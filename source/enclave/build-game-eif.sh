#!/usr/bin/env bash
set -euo pipefail

# Run from a canonical Linux source checkout with locked dependencies installed.
# This creates evidence; it does not approve PCRs or activate wagering.
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
policy=${1:?usage: build-game-eif.sh policy.json new-output-directory}
output=${2:?supply a new output directory}
test ! -e "$output" || { echo "Output already exists" >&2; exit 1; }
for command in node docker nitro-cli jq sha384sum; do command -v "$command" >/dev/null; done
epoch=${SOURCE_DATE_EPOCH:-0}
[[ "$epoch" =~ ^[0-9]+$ ]] || { echo "Invalid SOURCE_DATE_EPOCH" >&2; exit 1; }
mkdir -p "$output"
output=$(cd "$output" && pwd)
# SSM does not provide HOME; use an explicit per-build Nitro workspace.
export NITRO_CLI_ARTIFACTS="$output/nitro-artifacts"
mkdir -p "$NITRO_CLI_ARTIFACTS"
node enclave/build-game-service.mjs "$policy" > "$output/game-build-first.json"
cp enclave/dist/game-service.mjs "$output/game-service-first.mjs"
node enclave/build-game-service.mjs "$policy" > "$output/game-build-second.json"
cmp "$output/game-build-first.json" "$output/game-build-second.json"
cmp "$output/game-service-first.mjs" enclave/dist/game-service.mjs
release=$(jq -er '.policy.releaseId' "$output/game-build-first.json")
builder="casino-game-builder-$$"
tag="casino-game-enclave:$(jq -er '.bundleSha256' "$output/game-build-first.json")"
buildkit='moby/buildkit:v0.24.0@sha256:8c2ce26a3722e0cf4514fad4cfcd0e0f0f16214219ca7b73f3e1fcef74640ac4'
cleanup() { docker buildx rm "$builder" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker buildx create --name "$builder" --driver docker-container --driver-opt "image=$buildkit"
docker buildx inspect --builder "$builder" --bootstrap
for pass in first second; do
  docker buildx build --builder "$builder" --no-cache --pull=false --platform linux/amd64 \
    --target game-runtime --build-arg SOURCE_DATE_EPOCH="$epoch" \
    --build-arg DICE_PROOF_RELEASE_ID="$release" \
    --output "type=docker,dest=$output/$pass.docker.tar,rewrite-timestamp=true" \
    --tag "$tag" --file enclave/Dockerfile .
  docker load --input "$output/$pass.docker.tar"
  docker image inspect --format '{{.Id}}' "$tag" > "$output/$pass.image-digest"
  nitro-cli build-enclave --docker-uri "$tag" --output-file "$output/$pass.eif" > "$output/$pass.build.json"
  node infra/normalize-eif.mjs "$output/$pass.eif" "$epoch" "$tag"
  nitro-cli describe-eif --eif-path "$output/$pass.eif" > "$output/$pass.describe.json"
  jq -e '.CheckCRC == true' "$output/$pass.describe.json" >/dev/null
  jq -S '.Measurements' "$output/$pass.build.json" > "$output/$pass.pcrs.json"
  jq -S '.Measurements' "$output/$pass.describe.json" > "$output/$pass.described-pcrs.json"
  cmp "$output/$pass.pcrs.json" "$output/$pass.described-pcrs.json"
  for pcr in PCR0 PCR1 PCR2; do
    value=$(jq -er --arg pcr "$pcr" '.[$pcr]' "$output/$pass.pcrs.json")
    [[ "$value" =~ ^[a-fA-F0-9]{96}$ && ! "$value" =~ ^0+$ ]] || exit 1
  done
done
cmp "$output/first.image-digest" "$output/second.image-digest"
cmp "$output/first.pcrs.json" "$output/second.pcrs.json"
cmp "$output/first.eif" "$output/second.eif"
eif_sha=$(sha384sum "$output/first.eif" | cut -d' ' -f1)
jq -n --slurpfile build "$output/game-build-first.json" --slurpfile pcrs "$output/first.pcrs.json" \
  --arg eifSha384 "$eif_sha" --arg imageDigest "$(cat "$output/first.image-digest")" \
  --arg nitroCliVersion "$(nitro-cli --version)" --arg buildkitImage "$buildkit" \
  '{schemaVersion:1,protocolVersion:"casino-game-proof-v1",build:$build[0],pcrs:$pcrs[0],$eifSha384,$imageDigest,$nitroCliVersion,$buildkitImage,reproducibility:{passed:true},hardwareSmokePassed:false}' \
  > "$output/release-evidence.json"
echo "Reproducible game EIF evidence: $output/release-evidence.json"
echo "Hardware attestation, recovery and wagering integration checks remain required."
