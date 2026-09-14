import "reflect-metadata";
import { X509Certificate, X509ChainBuilder, cryptoProvider } from "@peculiar/x509";

import {
  bytesFromBase64,
  bytesToHex,
  decodeAttestation,
  extractSubjectPublicKeyInfo,
  verifyLeafSignature
} from "../../../duel-at-dawn/public/attestation.mjs";
import {
  base64ToBytes,
  DICE_PROOF_TICKET_TTL_MS,
  publicKeyHashHex,
  ticketBindingHashHex,
  validateReleaseManifestIdentity,
  validateTicketBinding
} from "./index.mjs";

function equalBytes(left, right) {
  const a = left instanceof Uint8Array ? left : new Uint8Array(left);
  const b = right instanceof Uint8Array ? right : new Uint8Array(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function pcrPolicy(releaseManifest) {
  const pcrs = releaseManifest?.pcrs;
  if (!pcrs || typeof pcrs !== "object") throw new Error("Release manifest has no PCR policy");
  const output = new Map();
  for (const index of [0, 1, 2]) {
    const value = pcrs[`PCR${index}`] ?? pcrs[index];
    if (typeof value !== "string" || !/^[0-9a-f]{96}$/i.test(value)) {
      throw new Error(`Release manifest PCR${index} is invalid`);
    }
    output.set(index, value.toLowerCase());
  }
  return output;
}

function validAt(certificate, timestamp) {
  return timestamp >= certificate.notBefore.getTime() && timestamp <= certificate.notAfter.getTime();
}

export async function verifyChain(document, rootCertPem, subtle) {
  if (typeof rootCertPem !== "string" || !rootCertPem.includes("BEGIN CERTIFICATE")) {
    throw new Error("No pinned Nitro root certificate was provided");
  }
  cryptoProvider.set(globalThis.crypto);
  // Strictly parse each certificate as exactly one DER object before passing it
  // to the general X.509 library. This rejects trailing-object smuggling.
  for (const certificate of [document.certificate, ...document.cabundle]) extractSubjectPublicKeyInfo(certificate);
  const leaf = new X509Certificate(document.certificate);
  const bundle = document.cabundle.map((certificate) => new X509Certificate(certificate));
  const root = new X509Certificate(rootCertPem);
  const chain = await new X509ChainBuilder({ certificates: [...bundle, root] }).build(leaf, globalThis.crypto);
  if (chain.length < 2 || !chain.at(-1)?.equal(root)) throw new Error("Attestation certificate chain does not reach the pinned root");
  if (!(await root.isSelfSigned(globalThis.crypto))) throw new Error("Pinned Nitro root is not self-signed");
  for (const [index, certificate] of chain.entries()) {
    if (!validAt(certificate, document.timestamp)) throw new Error(`Certificate ${index} is not valid at the attestation timestamp`);
    if (index > 0 && certificate.getExtension("2.5.29.19")?.ca !== true) {
      throw new Error(`Certificate ${index} is not a CA`);
    }
  }
  if (!(await verifyLeafSignature({ cose: document.__cose, document }, subtle))) {
    throw new Error("Nitro COSE signature is invalid");
  }
  return chain.map((certificate) => certificate.subject);
}

export async function verifyDiceTicketAttestation({
  attestationB64,
  binding,
  publicKeySpkiB64,
  challengeB64,
  releaseManifest,
  rootCertPem,
  now = Date.now(),
  maximumAgeMs = 5 * 60 * 1000
}) {
  const checks = {
    structure: false,
    releaseIdentity: false,
    release: false,
    freshness: false,
    certificateChain: false,
    coseSignature: false,
    pcrs: false,
    challenge: false,
    publicKey: false,
    userData: false,
    ticketValidity: false
  };
  const reasons = [];
  let parsed;
  let chainSubjects = [];
  try {
    validateTicketBinding(binding);
    parsed = decodeAttestation(bytesFromBase64(attestationB64));
    parsed.document.__cose = parsed.cose;
    checks.structure = true;
    checks.releaseIdentity = await validateReleaseManifestIdentity(releaseManifest);
    if (!checks.releaseIdentity) reasons.push("Release manifest ID is not content-derived or an explicit local mock ID");
    checks.release = releaseManifest?.releaseId === binding.releaseId;
    if (!checks.release) reasons.push("Ticket release ID does not match the pinned release manifest");
    checks.ticketValidity = binding.expiresAt > now &&
      binding.expiresAt > parsed.document.timestamp &&
      binding.expiresAt <= parsed.document.timestamp + DICE_PROOF_TICKET_TTL_MS;
    if (!checks.ticketValidity) reasons.push("Ticket is expired or has an invalid lifetime");
    checks.freshness = Number.isSafeInteger(now) &&
      parsed.document.timestamp <= now + maximumAgeMs &&
      now - parsed.document.timestamp <= maximumAgeMs;
    if (!checks.freshness) reasons.push("Attestation timestamp is stale or too far in the future");

    try {
      chainSubjects = await verifyChain(parsed.document, rootCertPem, globalThis.crypto.subtle);
      checks.certificateChain = true;
      checks.coseSignature = true;
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }

    const expectedPcrs = pcrPolicy(releaseManifest);
    checks.pcrs = [...expectedPcrs].every(([index, expected]) => {
      const actual = parsed.document.pcrs.get(index);
      return actual instanceof Uint8Array && bytesToHex(actual) === expected && !/^0+$/.test(expected);
    });
    if (!checks.pcrs) reasons.push("Attestation PCRs do not match the pinned release or contain debug values");

    const challenge = base64ToBytes(challengeB64);
    checks.challenge = challenge.length === 32 && parsed.document.nonce instanceof Uint8Array &&
      equalBytes(parsed.document.nonce, challenge);
    if (!checks.challenge) reasons.push("Attestation challenge does not match this browser request");

    const publicKey = base64ToBytes(publicKeySpkiB64);
    checks.publicKey = parsed.document.publicKey instanceof Uint8Array &&
      equalBytes(parsed.document.publicKey, publicKey) &&
      (await publicKeyHashHex(publicKey)) === binding.publicKeySha256;
    if (!checks.publicKey) reasons.push("Attested public key does not match the ticket");

    checks.userData = bytesToHex(parsed.document.userData) === await ticketBindingHashHex(binding);
    if (!checks.userData) reasons.push("Attestation user_data does not bind the prepared ticket");
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }
  return {
    ok: Object.values(checks).every(Boolean),
    trustedHardware: releaseManifest?.mode === "aws" && Object.values(checks).every(Boolean),
    checks,
    reasons,
    pcr0:
      parsed?.document.pcrs instanceof Map && parsed.document.pcrs.get(0) instanceof Uint8Array
        ? bytesToHex(parsed.document.pcrs.get(0))
        : undefined,
    timestamp: parsed?.document.timestamp,
    moduleId: parsed?.document.moduleId,
    chainSubjects
  };
}
