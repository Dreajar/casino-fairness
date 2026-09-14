import { randomBytes } from "node:crypto";

import {
  DICE_PROOF_GAME_ID,
  DICE_PROOF_PROTOCOL_VERSION,
  DICE_PROOF_SCHEMA_VERSION,
  DICE_PROOF_TICKET_TTL_MS,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  canonicalJson,
  exportP256PublicKey,
  generateP256SigningKey,
  publicKeyHashHex,
  resolveDice,
  sha256Hex,
  signReceipt,
  ticketBindingHashHex,
  validatePlayInput
} from "../../packages/dice-proof/src/index.mjs";

function entropyHex(entropy, size) {
  const value = Buffer.from(entropy(size));
  if (value.length !== size) throw new Error(`Entropy source returned ${value.length} bytes; expected ${size}`);
  return value.toString("hex");
}

function boundedText(value, maximum, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must contain 1-${maximum} characters`);
  }
  return value;
}

export class DiceProofOracle {
  /**
   * @param {{ attestor: any, entropy?: typeof randomBytes, clock?: () => number, releaseId?: string, ticketTtlMs?: number, maxPendingTickets?: number }} options
   */
  constructor({
    attestor,
    entropy = randomBytes,
    clock = () => Date.now(),
    releaseId = process.env.DICE_PROOF_RELEASE_ID,
    ticketTtlMs = DICE_PROOF_TICKET_TTL_MS,
    maxPendingTickets = 1024
  } = {}) {
    if (!attestor || typeof attestor.attest !== "function") throw new TypeError("DiceProofOracle requires an Attestor");
    this.attestor = attestor;
    this.entropy = entropy;
    this.clock = clock;
    this.releaseId = boundedText(releaseId, 128, "DICE_PROOF_RELEASE_ID");
    this.ticketTtlMs = ticketTtlMs;
    this.maxPendingTickets = maxPendingTickets;
    this.tickets = new Map();
  }

  sweep(now = this.clock()) {
    for (const [ticketId, ticket] of this.tickets) {
      const completedUntil = ticket.completedAt === undefined ? ticket.binding.expiresAt : ticket.completedAt + this.ticketTtlMs;
      if (completedUntil < now) this.tickets.delete(ticketId);
    }
  }

  async createTicket({ challengeB64, sessionId, sequence }) {
    const now = Number(this.clock());
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Ticket clock must return integer milliseconds");
    this.sweep(now);
    if (this.tickets.size >= this.maxPendingTickets) throw new Error("Dice proof ticket capacity reached");
    const challenge = base64ToBytes(challengeB64);
    if (challenge.length !== 32) throw new TypeError("Dice proof challenge must contain 32 bytes");
    boundedText(sessionId, 128, "sessionId");
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError("sequence must be non-negative");

    const serverSeed = entropyHex(this.entropy, 32);
    const ticketId = entropyHex(this.entropy, 16);
    if (this.tickets.has(ticketId)) throw new Error("Entropy source produced a duplicate ticket ID");
    const keyPair = await generateP256SigningKey();
    const publicKeySpki = await exportP256PublicKey(keyPair.publicKey);
    const binding = {
      protocolVersion: DICE_PROOF_PROTOCOL_VERSION,
      releaseId: this.releaseId,
      gameId: DICE_PROOF_GAME_ID,
      ticketId,
      serverSeedHash: await sha256Hex(Buffer.from(serverSeed, "hex")),
      publicKeySha256: await publicKeyHashHex(publicKeySpki),
      sessionId,
      sequence,
      expiresAt: now + this.ticketTtlMs
    };
    const bindingHash = await ticketBindingHashHex(binding);
    const attestation = await this.attestor.attest({
      userData: Buffer.from(bindingHash, "hex"),
      nonce: challenge,
      publicKey: publicKeySpki
    });
    this.tickets.set(ticketId, { binding, serverSeed, privateKey: keyPair.privateKey });
    return {
      binding,
      publicKeySpkiB64: bytesToBase64(publicKeySpki),
      attestationB64: Buffer.from(attestation).toString("base64"),
      ...(this.attestor.rootCertPem
        ? {
            mockPolicy: {
              rootCertPem: this.attestor.rootCertPem,
              expectedPcrs: this.attestor.expectedPcrs
            }
          }
        : {})
    };
  }

  async playTicket({ ticketId, ...rawInput }) {
    const now = Number(this.clock());
    this.sweep(now);
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error("Unknown or expired Dice proof ticket");
    const input = validatePlayInput(rawInput);
    const fingerprint = await sha256Hex(canonicalJson(input));
    // Claim before the first outcome/signing await. Concurrent requests must
    // never obtain distinct signed outcomes for one committed ticket.
    if (ticket.inFlight) {
      if (ticket.requestFingerprint !== fingerprint) throw new Error("Dice proof ticket was reused with different input");
      return ticket.inFlight;
    }
    if (ticket.completedResponse) {
      if (ticket.requestFingerprint !== fingerprint) throw new Error("Dice proof ticket was reused with different input");
      return ticket.completedResponse;
    }
    if (ticket.binding.expiresAt < now) {
      this.tickets.delete(ticketId);
      throw new Error("Dice proof ticket expired");
    }
    ticket.requestFingerprint = fingerprint;
    ticket.inFlight = this.completeTicket(ticket, input, now);
    // A failed signer leaves the ticket claimed. Never unlock it for a changed
    // wager after outcome computation may have occurred.
    return ticket.inFlight;
  }

  async completeTicket(ticket, input, now) {
    const resolved = await resolveDice(ticket.serverSeed, ticket.binding, input);
    const receipt = {
      schemaVersion: DICE_PROOF_SCHEMA_VERSION,
      ...ticket.binding,
      ...input,
      ...resolved,
      issuedAt: now
    };
    const receiptSignatureB64 = await signReceipt(receipt, ticket.privateKey);
    const response = {
      receipt,
      receiptSignatureB64,
      serverSeed: ticket.serverSeed
    };
    ticket.completedResponse = response;
    ticket.completedAt = now;
    delete ticket.serverSeed;
    delete ticket.privateKey;
    return response;
  }

  health() {
    this.sweep();
    return { ok: true, releaseId: this.releaseId, pendingTickets: this.tickets.size };
  }
}
