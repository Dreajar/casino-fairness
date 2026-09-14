import { randomBytes } from "node:crypto";

import { computeSpin, sha256Hex } from "../../provably-fair.js";

function bytesFromEntropy(entropy, size) {
  const value = Buffer.from(entropy(size));
  if (value.length !== size) throw new Error(`Entropy source returned ${value.length} bytes; expected ${size}`);
  return value;
}

export class FairnessOracle {
  constructor({ attestor, entropy = randomBytes, initialEpoch = 0 } = {}) {
    if (!attestor || typeof attestor.attest !== "function") throw new TypeError("FairnessOracle requires an Attestor");
    this.attestor = attestor;
    this.entropy = entropy;
    this.nextEpoch = initialEpoch;
    this.sessions = new Map();
  }

  async mintSession({ clientSeed = "", nonce = null } = {}) {
    const serverSeed = bytesFromEntropy(this.entropy, 32).toString("hex");
    const serverSeedHash = sha256Hex(serverSeed);
    let sessionId;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      sessionId = bytesFromEntropy(this.entropy, 16).toString("hex");
      if (!this.sessions.has(sessionId)) break;
    }
    if (this.sessions.has(sessionId)) throw new Error("Entropy source repeatedly produced a duplicate session ID");
    const epoch = this.nextEpoch;
    this.nextEpoch += 1;
    const attestation = await this.attestor.attest({
      userData: Buffer.from(serverSeedHash, "hex"),
      nonce: nonce === null || nonce === undefined ? null : Buffer.from(nonce),
      publicKey: null
    });
    this.sessions.set(sessionId, { serverSeed, serverSeedHash, clientSeed: String(clientSeed), epoch });
    return { sessionId, serverSeedHash, attestationB64: Buffer.from(attestation).toString("base64"), epoch };
  }

  // The public game API remains unchanged, but enclave-backed sessions must be
  // computed here so the host never needs the unrevealed server seed.
  compute({ sessionId, clientSeed, nonce, bet }) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Unknown oracle session");
    return computeSpin(session.serverSeed, String(clientSeed), nonce, bet);
  }

  reveal({ sessionId }) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Unknown oracle session");
    this.sessions.delete(sessionId);
    return { serverSeed: session.serverSeed, serverSeedHash: session.serverSeedHash };
  }
}
