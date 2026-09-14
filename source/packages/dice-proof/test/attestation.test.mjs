import assert from "node:assert/strict";
import test from "node:test";

import { verifyDiceTicketAttestation } from "../src/attestation.mjs";
import { MockAttestor } from "../../../enclave/oracle/attestor.mjs";
import { DiceProofOracle } from "../../../enclave/oracle/dice-proof-oracle.mjs";

test("browser-compatible verifier validates the complete mock chain and every ticket binding", async () => {
  const now = Date.now();
  const attestor = new MockAttestor({ clock: () => now });
  const oracle = new DiceProofOracle({ attestor, clock: () => now, releaseId: "local-mock-not-a-release" });
  const challengeB64 = Buffer.alloc(32, 9).toString("base64");
  const ticket = await oracle.createTicket({ challengeB64, sessionId: "browser-session", sequence: 3 });
  const releaseManifest = {
    schemaVersion: 1,
    mode: "mock",
    releaseId: ticket.binding.releaseId,
    pcrs: Object.fromEntries(Object.entries(attestor.expectedPcrs).map(([key, value]) => [`PCR${key}`, value]))
  };
  const result = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(result.ok, true, result.reasons.join("; "));
  assert.equal(result.trustedHardware, false);
  assert.equal(result.chainSubjects.length, 3);

  const wrongChallenge = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64: Buffer.alloc(32, 8).toString("base64"),
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(wrongChallenge.ok, false);
  assert.equal(wrongChallenge.checks.challenge, false);

  const otherRoot = new MockAttestor({ clock: () => now });
  const wrongRoot = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest,
    rootCertPem: otherRoot.rootCertPem,
    now
  });
  assert.equal(wrongRoot.ok, false);
  assert.equal(wrongRoot.checks.certificateChain, false);

  const wrongPcr = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest: { ...releaseManifest, pcrs: { ...releaseManifest.pcrs, PCR0: "01".repeat(48) } },
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(wrongPcr.checks.pcrs, false);

  const zeroPcr = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest: { ...releaseManifest, pcrs: { ...releaseManifest.pcrs, PCR0: "00".repeat(48) } },
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(zeroPcr.checks.pcrs, false);

  const stale = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now: now + 10 * 60_000
  });
  assert.equal(stale.checks.freshness, false);

  const wrongPublicKey = await verifyDiceTicketAttestation({
    ...ticket,
    publicKeySpkiB64: Buffer.alloc(91, 3).toString("base64"),
    challengeB64,
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(wrongPublicKey.checks.publicKey, false);

  const wrongUserData = await verifyDiceTicketAttestation({
    ...ticket,
    binding: { ...ticket.binding, serverSeedHash: "ff".repeat(32) },
    challengeB64,
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(wrongUserData.checks.userData, false);

  const wrongRelease = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest: { ...releaseManifest, releaseId: "different-release" },
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(wrongRelease.checks.release, false);

  const alteredBytes = Buffer.from(ticket.attestationB64, "base64");
  alteredBytes[alteredBytes.length - 1] ^= 1;
  const alteredSignature = await verifyDiceTicketAttestation({
    ...ticket,
    attestationB64: alteredBytes.toString("base64"),
    challengeB64,
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(alteredSignature.checks.coseSignature, false);
});

test("browser-compatible verifier rejects a certificate expired at the attestation timestamp", async () => {
  const now = Date.now();
  const attestor = new MockAttestor({
    clock: () => now,
    notBefore: new Date(now - 10_000),
    notAfter: new Date(now - 1)
  });
  const oracle = new DiceProofOracle({ attestor, clock: () => now, releaseId: "local-mock-not-a-release" });
  const challengeB64 = Buffer.alloc(32, 6).toString("base64");
  const ticket = await oracle.createTicket({ challengeB64, sessionId: "expired-cert", sequence: 0 });
  const result = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest: {
      schemaVersion: 1,
      mode: "mock",
      releaseId: ticket.binding.releaseId,
      pcrs: Object.fromEntries(Object.entries(attestor.expectedPcrs).map(([key, value]) => [`PCR${key}`, value]))
    },
    rootCertPem: attestor.rootCertPem,
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks.certificateChain, false);
  assert.match(result.reasons.join("; "), /not valid/);
});

test("browser-compatible verifier anchors ticket lifetime to attested time across clock skew", async () => {
  const browserNow = Date.now();
  const enclaveNow = browserNow + 1_000;
  const attestor = new MockAttestor({ clock: () => enclaveNow });
  const oracle = new DiceProofOracle({
    attestor,
    clock: () => enclaveNow,
    releaseId: "local-mock-not-a-release"
  });
  const challengeB64 = Buffer.alloc(32, 4).toString("base64");
  const ticket = await oracle.createTicket({ challengeB64, sessionId: "clock-skew", sequence: 0 });
  const releaseManifest = {
    schemaVersion: 1,
    mode: "mock",
    releaseId: ticket.binding.releaseId,
    pcrs: Object.fromEntries(Object.entries(attestor.expectedPcrs).map(([key, value]) => [`PCR${key}`, value]))
  };

  const result = await verifyDiceTicketAttestation({
    ...ticket,
    challengeB64,
    releaseManifest,
    rootCertPem: attestor.rootCertPem,
    now: browserNow
  });

  assert.equal(result.ok, true, result.reasons.join("; "));
  assert.equal(result.checks.ticketValidity, true);
});
