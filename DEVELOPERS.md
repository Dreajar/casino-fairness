# For developers: verification and reproducible builds

[Home](README.md) · [Player guide](PLAYERS.md)

This guide covers the standalone CLIs, trust boundaries, published source, and reproducible builds. Node.js 24 or later is required. Running the bundled verifiers requires no npm install, AWS account, or casino login.

**Source available for noncommercial verification only. Commercial reuse is not permitted.** See [LICENSE](LICENSE). Third-party libraries retain their own licenses.

## Check a game history

Install Node.js 24 or later from https://nodejs.org. Open a terminal in this extracted folder:

```sh
node verify-fairness.mjs "/path/to/fairness-history.json"
```

On Windows you can also drag your JSON file onto `verify-history.cmd`.

Each completed round needs its revealed server seed. Finish play, use **Rotate & reveal**, then export your history. A PASS checks the commitment, outcome, multiplier, and payout. This legacy history format uses two-decimal demo settlement; it is not a substitute for Nitro's signed eight-decimal settlement receipts. No round data is uploaded.

## Check an archived Nitro proof

```sh
node verify-nitro.mjs "/path/to/nitro-proof.json" "releases/policy.json"
```

Use a policy from an independently trusted release. Never trust a policy merely because it arrived with a proof. This checks AWS attestation against pinned measurements, the signed receipt or complete progressive transcript, and game replay. It checks the archive at ticket issuance time, not whether a server is online or safe to accept new wagers now. A normal fairness-history export is not a Nitro proof.

The input is one object (or `{ "rounds": [...] }`) with the original `request`, attested `ticket`, play `command`, and completed `result` (or `first`). Progressive games require `completedHistory`, an ordered array of `{ "command": ..., "result": ... }` entries through completion. Proofs contain personal round references; share them only if you intend to.

Try the 49 synthetic hardware-validation rounds included with this release:

```sh
node verify-nitro.mjs examples/nitro-49-games.json releases/policy.json
```

The separate Dice demonstration format uses `verify-dice-proof.mjs` and its own trusted Dice release manifest. The all-game policy is not a Dice demonstration manifest.

## What is published

- Readable standalone verifiers requiring only Node, with no dependency install to run.
- Exact source inputs and vendored dependencies under `source/`, plus third-party licenses.
- Slot/game math, protocol documents, and a synthetic example under `examples/`.
- The recorded all-game Nitro release policy, measurements, and build evidence.
- The measured enclave bundle and build recipes, including its Rust attestation helper.
- SHA-256 hashes in `SHA256SUMS.json` and source provenance in `build-recipes.json`.

The recorded release is not a statement that it is currently deployed. Consult the release's live-state report when available. AWS attestation establishes a measured execution environment; it does not establish solvency or guarantee withdrawals.

The source is deliberately limited to verification and the enclave runtime. It contains no casino user interface, wallet credentials, private keys, customer database, or exported player histories. A KMS key identifier is part of the measured policy and is public metadata, not a key or credential.

## Reproduce the JavaScript bundles

```sh
npm install --ignore-scripts
node rebuild.mjs
```

The pinned esbuild version uses the published source and import map. The script checks every source hash and requires byte-identical output. Rebuilding the JavaScript bundle is separate from rebuilding the complete enclave image.

For the EIF, use a Linux x86-64 build host with Docker Buildx, Nitro CLI 1.5.0, jq, and the tools listed in `source/enclave/build-game-eif.sh`. After installing the build dependencies and running the rebuild above:

```sh
cd source
SOURCE_DATE_EPOCH=0 bash enclave/build-game-eif.sh ../releases/policy.json ../rebuilt-eif
```

The original build used epoch 0, confirmed from the deployed container image. The published Dockerfile pins its base images and packages. The script requires two clean builds to agree. Rebuilding the EIF has not been performed by this package exporter. Compare PCR0/1/2 and EIF SHA-384 in `rebuilt-eif/release-evidence.json` to `releases/build-evidence.json`, and reject any mismatch.

The legacy verifier shares the published game engines. For an implementation independent of this code, use the protocol and fixed vectors, with the release's source as the exact reference when documentation and historical vectors differ.

## Licensing

The Casino Fairness Verification License permits noncommercial inspection, local rebuilding, and checking this project's proofs. It does not grant permission to reuse the covered code in another product, operate a casino with it, or use it commercially. This is a source-available release, not an open-source release. Third-party code retains its own license under `THIRD_PARTY_LICENSES/`.
