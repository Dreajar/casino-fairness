#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { verifyDiceTicketAttestation } from "../packages/dice-proof/src/attestation.mjs";
import { canonicalJson, validateReleaseManifestIdentity, verifyDiceResult } from "../packages/dice-proof/src/index.mjs";

const awsRootPem = readFileSync(new URL("./aws-nitro-root-g1.pem", import.meta.url), "utf8");

function usage() {
  return "Usage: node verifier/verify-dice-proof.mjs <proof.json> [--manifest approved-release.json]";
}

function printChecks(checks) {
  for (const [name, passed] of Object.entries(checks)) {
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
  }
}

export async function verifyDiceProofBundle(bundle, { approvedManifest } = {}) {
  const manifest = bundle?.releaseManifest;
  const mock = manifest?.mode === "mock";
  const rootCertPem = mock ? bundle?.mockPolicy?.rootCertPem : awsRootPem;
  const attestation = await verifyDiceTicketAttestation({
    attestationB64: bundle?.attestationB64,
    binding: bundle?.ticketBinding,
    publicKeySpkiB64: bundle?.publicKeySpkiB64,
    challengeB64: bundle?.challengeB64,
    releaseManifest: manifest,
    rootCertPem,
    // Offline verification is historical: freshness and expiry are evaluated
    // at the signed receipt time, not at the time the file is opened.
    now: bundle?.receipt?.issuedAt
  });
  const result = await verifyDiceResult({
    binding: bundle?.ticketBinding,
    receipt: bundle?.receipt,
    receiptSignatureB64: bundle?.receiptSignatureB64,
    publicKeySpkiB64: bundle?.publicKeySpkiB64,
    serverSeed: bundle?.serverSeed
  });
  const checks = {
    schemaVersion: bundle?.schemaVersion === 1,
    verifierVersion: bundle?.verifierVersion === "dice-proof-v1",
    releaseIdentity: await validateReleaseManifestIdentity(manifest),
    ...(approvedManifest
      ? { approvedRelease: canonicalJson(manifest) === canonicalJson(approvedManifest) }
      : {}),
    receiptAfterAttestation:
      Number.isSafeInteger(attestation.timestamp) && bundle?.receipt?.issuedAt >= attestation.timestamp,
    ...Object.fromEntries(Object.entries(attestation.checks).map(([name, value]) => [`attestation.${name}`, value])),
    ...Object.fromEntries(Object.entries(result.checks).map(([name, value]) => [`receipt.${name}`, value]))
  };
  const reasons = [...attestation.reasons, ...result.reasons];
  if (approvedManifest && !checks.approvedRelease) reasons.push("Proof manifest does not match --manifest");
  if (!checks.receiptAfterAttestation) reasons.push("Receipt predates its attested ticket");
  return {
    ok: Object.values(checks).every(Boolean),
    trustedHardware: attestation.trustedHardware,
    checks,
    reasons,
    releaseId: manifest?.releaseId,
    pcr0: attestation.pcr0,
    ticketId: bundle?.ticketBinding?.ticketId
  };
}

async function main(argv) {
  const proofPath = argv[0];
  const manifestIndex = argv.indexOf("--manifest");
  const manifestPath = manifestIndex === -1 ? undefined : argv[manifestIndex + 1];
  if (!proofPath || (manifestIndex !== -1 && !manifestPath)) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  try {
    const bundle = JSON.parse(readFileSync(proofPath, "utf8"));
    const approvedManifest = manifestPath ? JSON.parse(readFileSync(manifestPath, "utf8")) : undefined;
    const result = await verifyDiceProofBundle(bundle, { approvedManifest });
    printChecks(result.checks);
    console.log(`\n${result.ok ? "VERIFIED" : "REJECTED"}${result.ok && !result.trustedHardware ? " (local mock — not AWS verified)" : ""}`);
    console.log(`releaseId: ${result.releaseId ?? "unknown"}`);
    console.log(`PCR0: ${result.pcr0 ?? "unknown"}`);
    console.log(`ticketId: ${result.ticketId ?? "unknown"}`);
    for (const reason of result.reasons) console.error(`- ${reason}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error("REJECTED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
