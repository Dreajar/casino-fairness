import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";

import { encode } from "./cbor.mjs";
import { buildCoseSign1 } from "./cose.mjs";
import { derToPem, mkCert } from "./x509.mjs";

function pcr(label) {
  return createHash("sha384").update(`replicate-games mock ${label}`).digest();
}

export const DEFAULT_MOCK_PCRS = Object.freeze({
  0: pcr("PCR0").toString("hex"),
  1: pcr("PCR1").toString("hex"),
  2: pcr("PCR2").toString("hex"),
  8: pcr("PCR8").toString("hex")
});

function normalizePcrs(pcrs) {
  const entries = pcrs instanceof Map ? [...pcrs.entries()] : Object.entries(pcrs);
  const normalized = new Map();
  for (const [rawIndex, rawValue] of entries) {
    const index = Number(rawIndex);
    const value = Buffer.isBuffer(rawValue) || rawValue instanceof Uint8Array
      ? Buffer.from(rawValue)
      : Buffer.from(String(rawValue), "hex");
    if (!Number.isInteger(index) || index < 0 || index > 31) throw new TypeError(`Invalid PCR index ${rawIndex}`);
    if (value.length !== 48) throw new TypeError(`PCR${index} must contain 48 bytes for SHA384`);
    normalized.set(index, value);
  }
  for (const required of [0, 1, 2, 8]) {
    if (!normalized.has(required)) throw new TypeError(`Mock PCR set is missing PCR${required}`);
  }
  return normalized;
}

function keyPair() {
  return generateKeyPairSync("ec", { namedCurve: "P-384" });
}

export class Attestor {
  attest() {
    throw new Error("Attestor.attest() must be implemented");
  }
}

// NOT-FOR-PRODUCTION. This is a locally generated PKI and proves only that the
// verifier, protocol, and game binding work; it conveys no AWS hardware trust.
export class MockAttestor extends Attestor {
  constructor({
    pcrs = DEFAULT_MOCK_PCRS,
    moduleId = "mock-nitro-enclave",
    clock = () => Date.now(),
    notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
  } = {}) {
    super();
    this.moduleId = moduleId;
    this.clock = clock;
    this.pcrs = normalizePcrs(pcrs);
    this.expectedPcrs = Object.freeze(Object.fromEntries(
      [...this.pcrs].map(([index, value]) => [index, value.toString("hex")])
    ));

    const root = keyPair();
    const intermediate = keyPair();
    const leaf = keyPair();
    const rootName = "Replicate Games Mock Nitro Root (NOT FOR PRODUCTION)";
    const intermediateName = "Replicate Games Mock Nitro Intermediate";
    const leafName = "Replicate Games Mock Nitro Attestation Leaf";

    this.rootCertDer = mkCert({
      subject: rootName,
      subjectPublicKey: root.publicKey,
      issuerPrivateKey: root.privateKey,
      isCa: true,
      notBefore,
      notAfter
    });
    this.intermediateCertDer = mkCert({
      subject: intermediateName,
      subjectPublicKey: intermediate.publicKey,
      issuer: rootName,
      issuerPrivateKey: root.privateKey,
      isCa: true,
      notBefore,
      notAfter
    });
    this.leafCertDer = mkCert({
      subject: leafName,
      subjectPublicKey: leaf.publicKey,
      issuer: intermediateName,
      issuerPrivateKey: intermediate.privateKey,
      isCa: false,
      notBefore,
      notAfter
    });
    this.rootCertPem = derToPem(this.rootCertDer);
    this.leafPrivateKey = leaf.privateKey;
  }

  /** @param {{ userData: Uint8Array, nonce?: Uint8Array | null, publicKey?: Uint8Array | null }} input */
  attest({ userData, nonce = null, publicKey = null }) {
    const timestamp = Number(this.clock());
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError("Attestation clock must return integer milliseconds");
    const payload = new Map([
      ["module_id", this.moduleId],
      ["timestamp", timestamp],
      ["digest", "SHA384"],
      ["pcrs", new Map([...this.pcrs].map(([index, value]) => [index, Buffer.from(value)]))],
      ["certificate", Buffer.from(this.leafCertDer)],
      ["cabundle", [Buffer.from(this.intermediateCertDer)]],
      ["public_key", publicKey === null ? null : Buffer.from(publicKey)],
      ["user_data", Buffer.from(userData)],
      ["nonce", nonce === null ? null : Buffer.from(nonce)]
    ]);
    return buildCoseSign1(encode(payload), this.leafPrivateKey);
  }
}

export class NsmAttestor extends Attestor {
  /** @param {{ userData: Uint8Array, nonce?: Uint8Array | null, publicKey?: Uint8Array | null }} input */
  attest({ userData, nonce = null, publicKey = null }) {
    const bin = process.env.NSM_ATTEST_BIN || "/usr/local/bin/nsm-attest";
    const input = JSON.stringify({
      user_data: Buffer.from(userData).toString("hex"),
      nonce: nonce === null || nonce === undefined ? null : Buffer.from(nonce).toString("base64"),
      public_key: publicKey === null || publicKey === undefined ? null : Buffer.from(publicKey).toString("base64")
    });

    let stdout;
    try {
      // This binary and /dev/nsm exist only in the production enclave image.
      // The helper returns the genuine NSM document unchanged; this class never
      // creates a fallback key or synthesizes a signature.
      stdout = execFileSync(bin, [], { input, maxBuffer: 1024 * 1024 });
    } catch (cause) {
      const detail = cause && cause.stderr ? Buffer.from(cause.stderr).toString("utf8").trim() : (cause && cause.message) || "";
      throw new Error(
        "NsmAttestor is only available inside a Nitro Enclave with /dev/nsm and the nsm-attest helper" +
          (detail ? ` (helper: ${detail})` : ""),
        { cause }
      );
    }

    const encoded = stdout.toString("utf8").trim();
    if (!encoded) throw new Error("nsm-attest returned an empty attestation document");
    return Buffer.from(encoded, "base64");
  }
}
