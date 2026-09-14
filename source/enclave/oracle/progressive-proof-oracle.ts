import { createHash, randomBytes } from "node:crypto";
import { canonicalJson, exportP256PublicKey, generateP256SigningKey } from "../../packages/dice-proof/src/index.mjs";
import { commitmentFor } from "../../packages/fairness-core/src/index.ts";
import { isEnclaveProgressiveGameId as isProgressiveGameId, createProgressiveKernel, progressiveInitialWagerMinor } from "./progressive-kernels.ts";
import type { GameProofPolicy, GameTicketRequest } from "./game-proof-oracle.ts";
import { verifyProgressiveTranscript } from "../../packages/dice-proof/src/progressive-attestation.mjs";

export const PROGRESSIVE_PROOF_PROTOCOL = "casino-progressive-proof-v1";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Binding = Record<string, string | number>;
export interface ProgressiveProofCommand {
  ticketId: string; requestId: string; clientSeed: string; sequence: number; action: string; previousReceiptHash: string;
  recoveryB64?: string;
  history?: { command: ProgressiveProofCommand; result: ProgressiveProofResult }[];
}
export interface ProgressiveProofResult {
  receipt: Binding; receiptSignatureB64: string; receiptHash: string; serverSeed?: string;
}
interface Ticket {
  binding: Binding; seed: string; key: CryptoKey; kernel?: ReturnType<typeof createProgressiveKernel>;
  clientSeed?: string; previousHash: string; sequence: number; terminal: boolean;
  pending?: string;
  replies: Map<string, { fingerprint: string; promise: Promise<ProgressiveProofResult> }>;
}

/** Ordered interactive proof protocol. A sealed ticket plus the signed public
 * action journal reconstructs state after restart without exposing future RNG. */
export class ProgressiveProofOracle {
  readonly #restoring = new Map<string, Promise<Ticket>>();
  readonly #tickets = new Map<string, Ticket>();
  readonly #rounds = new Set<string>();
  readonly #bootId: string;
  readonly #policy: GameProofPolicy;
  constructor(
    private readonly attestor: { attest(input: { userData: Uint8Array; nonce: Uint8Array; publicKey: Uint8Array }): Uint8Array | Promise<Uint8Array> },
    policy: GameProofPolicy, private readonly clock = Date.now,
    private readonly recovery?: { seal(value: unknown): Promise<string>; open(value: string): Promise<any> },
    bootId = randomBytes(16).toString("hex")
  ) {
    if (!/^[a-f0-9]{32}$/.test(bootId)) throw new Error("Invalid enclave boot identity");
    this.#bootId = bootId;
    if (!policy.enabledGameIds.length || policy.enabledGameIds.some((id) => !isProgressiveGameId(id)) ||
        new Set(policy.enabledGameIds).size !== policy.enabledGameIds.length ||
        typeof policy.releaseId !== "string" || !policy.releaseId || policy.releaseId.length > 128 || !/^[a-f0-9]{64}$/.test(policy.rulesHash) ||
        typeof policy.maximumWagerMinor !== "bigint" || typeof policy.maximumPayoutMinor !== "bigint" ||
        policy.maximumWagerMinor <= 0n || policy.maximumWagerMinor > 999999999999999n ||
        policy.maximumPayoutMinor <= 0n || policy.maximumPayoutMinor > 999999999999999999n) throw new Error("Unsupported progressive policy");
    this.#policy = Object.freeze({ ...policy, enabledGameIds: Object.freeze([...policy.enabledGameIds]) });
  }
  health() {
    return { protocolVersion: PROGRESSIVE_PROOF_PROTOCOL, releaseId: this.#policy.releaseId, rulesHash: this.#policy.rulesHash,
      bootId: this.#bootId, enabledGameIds: [...this.#policy.enabledGameIds], capacityRemaining: 100000 - this.#rounds.size };
  }
  async createTicket(request: GameTicketRequest) {
    if (!isProgressiveGameId(request.gameId) || !this.#policy.enabledGameIds.includes(request.gameId)) throw new Error("Unsupported progressive game");
    for (const field of ["roundId", "playerRef", "clubRef"] as const) {
      if (typeof request[field] !== "string" || !request[field] || request[field].length > 128) throw new Error("Invalid progressive identity");
    }
    if (typeof request.action !== "string" || request.action.length > 1024 || typeof request.wagerMinor !== "string" ||
        !/^[1-9][0-9]{0,14}$/.test(request.wagerMinor) || BigInt(request.wagerMinor) > this.#policy.maximumWagerMinor) throw new Error("Invalid progressive wager");
    const challenge = Buffer.from(request.challengeB64, "base64");
    if (challenge.length !== 32 || challenge.toString("base64") !== request.challengeB64) throw new Error("Invalid challenge");
    const kernelInput = { usdScale: 8 as const, roundId: request.roundId, action: request.action, gameId: request.gameId, wagerMinor: BigInt(request.wagerMinor), maximumPayoutMinor: this.#policy.maximumPayoutMinor, nonce: 0 };
    const chargedWagerMinor = progressiveInitialWagerMinor(request.gameId, request.action, BigInt(request.wagerMinor), 8);
    if (chargedWagerMinor > this.#policy.maximumWagerMinor) throw new Error("Progressive opening stake exceeds policy");
    // Parse and bound the opening action without testing the future random seed.
    createProgressiveKernel({ ...kernelInput, serverSeed: "public-validation", clientSeed: "public-validation" });
    const roundKey = canonicalJson([request.playerRef, request.clubRef, request.roundId]);
    if (this.#rounds.has(roundKey)) throw new Error("Progressive round already has a ticket");
    if (this.#rounds.size >= 100000) throw new Error("Progressive capacity reached");
    this.#rounds.add(roundKey);
    const seed = randomBytes(32).toString("hex");
    const keys = this.recovery
      ? await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
      : await generateP256SigningKey();
    const publicKey = await exportP256PublicKey(keys.publicKey);
    const now = this.clock();
    const ticketId = randomBytes(16).toString("hex");
    const binding: Binding = { usdScale: 8, protocolVersion: PROGRESSIVE_PROOF_PROTOCOL, releaseId: this.#policy.releaseId, rulesHash: this.#policy.rulesHash,
      bootId: this.#bootId, ticketId, roundId: request.roundId, playerRef: request.playerRef, clubRef: request.clubRef,
      gameId: request.gameId, wagerMinor: request.wagerMinor, chargedWagerMinor: chargedWagerMinor.toString(),
      maximumPayoutMinor: this.#policy.maximumPayoutMinor.toString(), action: request.action, sequence: 0,
      payoutRounding: "floor-minor-v1",
      serverSeedHash: commitmentFor(seed), publicKeySha256: hash(publicKey), issuedAt: now, expiresAt: now + 300000 };
    let recoveryB64: string | undefined;
    if (this.recovery) {
      binding.recoveryProtocol = "sealed-ticket-v1";
      const keyBytes = new Uint8Array(await globalThis.crypto.subtle.exportKey("pkcs8", keys.privateKey));
      try {
        recoveryB64 = await this.recovery.seal({ kind: "progressive", binding, seed,
          privateKeyB64: Buffer.from(keyBytes).toString("base64"), publicKeySpkiB64: Buffer.from(publicKey).toString("base64") });
      } finally { keyBytes.fill(0); }
      binding.recoverySha256 = hash(recoveryB64);
    }
    const attestation = await this.attestor.attest({ userData: Buffer.from(hash(canonicalJson(binding)), "hex"), nonce: challenge, publicKey });
    this.#tickets.set(ticketId, { binding, seed, key: keys.privateKey, previousHash: hash(canonicalJson(binding)), sequence: -1, terminal: false, replies: new Map() });
    return { binding, attestationB64: Buffer.from(attestation).toString("base64"), publicKeySpkiB64: Buffer.from(publicKey).toString("base64"), ...(recoveryB64 ? { recoveryB64 } : {}) };
  }
  async advance(command: ProgressiveProofCommand): Promise<ProgressiveProofResult> {
    let ticket = this.#tickets.get(command.ticketId);
    if (!ticket && this.recovery && command.recoveryB64) {
      let pending = this.#restoring.get(command.ticketId);
      if (!pending) {
        pending = this.#restore(command);
        this.#restoring.set(command.ticketId, pending);
      }
      try { ticket = await pending; } finally { this.#restoring.delete(command.ticketId); }
    }
    if (!ticket) throw new Error("Progressive ticket unavailable; do not re-ticket");
    if (command.recoveryB64 && hash(command.recoveryB64) !== ticket.binding.recoverySha256) throw new Error("Progressive recovery mismatch");
    if (typeof command.requestId !== "string" || !command.requestId || command.requestId.length > 128 ||
        typeof command.action !== "string" || command.action.length > 1024 || !Number.isSafeInteger(command.sequence) ||
        !/^[a-f0-9]{64}$/.test(command.clientSeed) || !/^[a-f0-9]{64}$/.test(command.previousReceiptHash)) throw new Error("Invalid progressive command");
    const fingerprint = this.#fingerprint(command);
    const previous = ticket.replies.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Progressive idempotency conflict");
      return structuredClone(await previous.promise);
    }
    if (ticket.pending || ticket.terminal || command.sequence !== ticket.sequence + 1 || command.previousReceiptHash !== ticket.previousHash) throw new Error("Progressive sequence conflict");
    if (ticket.clientSeed !== undefined && ticket.clientSeed !== command.clientSeed) throw new Error("Progressive client seed is locked");
    if (command.sequence === 0 && (command.action !== ticket.binding.action || (!ticket.binding.recoveryProtocol && this.clock() > Number(ticket.binding.expiresAt)))) throw new Error("Invalid or expired opening action");
    ticket.pending = command.requestId;
    let promise: Promise<ProgressiveProofResult>;
    try { promise = this.#complete(ticket, command); }
    catch (error) { delete ticket.pending; throw error; }
    ticket.replies.set(command.requestId, { fingerprint, promise });
    // A failed signing operation stays pending and retains the failed request.
    // Never accept a different action after an ambiguous state transition.
    const result = await promise;
    delete ticket.pending;
    return structuredClone(result);
  }
  #fingerprint(command: ProgressiveProofCommand) {
    const { ticketId, requestId, clientSeed, sequence, action, previousReceiptHash } = command;
    return hash(canonicalJson({ ticketId, requestId, clientSeed, sequence, action, previousReceiptHash }));
  }
  async #restore(command: ProgressiveProofCommand): Promise<Ticket> {
    const recovered = await this.recovery!.open(command.recoveryB64!);
    const binding: Binding = { ...recovered.binding, recoverySha256: hash(command.recoveryB64!) };
    const gameId = String(binding.gameId);
    if (recovered.kind !== "progressive" || binding.protocolVersion !== PROGRESSIVE_PROOF_PROTOCOL ||
        binding.recoveryProtocol !== "sealed-ticket-v1" || binding.ticketId !== command.ticketId ||
        binding.releaseId !== this.#policy.releaseId || binding.rulesHash !== this.#policy.rulesHash ||
        !isProgressiveGameId(gameId) || !this.#policy.enabledGameIds.includes(gameId) ||
        typeof recovered.seed !== "string" || !/^[a-f0-9]{64}$/.test(recovered.seed) ||
        commitmentFor(recovered.seed) !== binding.serverSeedHash ||
        hash(Buffer.from(recovered.publicKeySpkiB64, "base64")) !== binding.publicKeySha256) throw new Error("Invalid progressive recovery identity");
    const history = command.history ?? [];
    if (!Array.isArray(history) || history.length > 128) throw new Error("Invalid progressive recovery history");
    const key = await globalThis.crypto.subtle.importKey("pkcs8", Buffer.from(recovered.privateKeyB64, "base64"), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const ticket: Ticket = { binding, seed: recovered.seed, key, previousHash: hash(canonicalJson(binding)), sequence: -1, terminal: false, replies: new Map() };
    if (history.length) {
      const verified = await verifyProgressiveTranscript({ ticket: { binding, publicKeySpkiB64: recovered.publicKeySpkiB64 },
        commands: history.map(h => h.command), results: history.map(h => h.result), policy: this.#policy });
      if (!verified.ok) throw new Error("Invalid signed progressive recovery history");
      ticket.clientSeed = history[0]!.command.clientSeed;
      ticket.kernel = createProgressiveKernel({ usdScale: 8, roundId: String(binding.roundId), gameId,
        wagerMinor: BigInt(String(binding.wagerMinor)), maximumPayoutMinor: this.#policy.maximumPayoutMinor,
        action: String(binding.action), serverSeed: recovered.seed, clientSeed: ticket.clientSeed, nonce: 0 });
      for (const [index, entry] of history.entries()) {
        const view = index === 0 ? ticket.kernel.view() : ticket.kernel.advance({ roundId: String(binding.roundId),
          requestId: entry.command.requestId, sequence: index, action: entry.command.action });
        if (JSON.stringify(view) !== entry.result.receipt.outcomeJson) throw new Error("Progressive recovery replay mismatch");
        ticket.replies.set(entry.command.requestId, { fingerprint: this.#fingerprint(entry.command), promise: Promise.resolve(structuredClone(entry.result)) });
        ticket.previousHash = entry.result.receiptHash;
        ticket.sequence = index;
        ticket.terminal = view.status !== "ACTIVE";
      }
    }
    this.#tickets.set(command.ticketId, ticket);
    return ticket;
  }
  #complete(ticket: Ticket, command: ProgressiveProofCommand): Promise<ProgressiveProofResult> {
    const gameId = String(ticket.binding.gameId);
    if (!isProgressiveGameId(gameId)) throw new Error("Invalid progressive game");
    if (!ticket.kernel) {
      ticket.kernel = createProgressiveKernel({ usdScale: 8, roundId: String(ticket.binding.roundId), gameId,
        wagerMinor: BigInt(String(ticket.binding.wagerMinor)), maximumPayoutMinor: this.#policy.maximumPayoutMinor,
        action: command.action, serverSeed: ticket.seed, clientSeed: command.clientSeed, nonce: 0 });
      ticket.clientSeed = command.clientSeed;
    }
    const view = command.sequence === 0 ? ticket.kernel.view() : ticket.kernel.advance({
      roundId: String(ticket.binding.roundId), requestId: command.requestId, sequence: command.sequence, action: command.action
    });
    const receipt = { ...ticket.binding, requestId: command.requestId, clientSeed: command.clientSeed,
      actionSequence: command.sequence, commandAction: command.action, previousReceiptHash: command.previousReceiptHash,
      status: view.status, payoutMinor: view.payoutMinor, outcomeJson: JSON.stringify(view), completedAt: this.clock() };
    return (async () => {
      const signature = await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ticket.key, new TextEncoder().encode(canonicalJson(receipt)));
      ticket.sequence = command.sequence;
      ticket.previousHash = hash(canonicalJson(receipt));
      ticket.terminal = view.status !== "ACTIVE";
      return { receipt, receiptSignatureB64: Buffer.from(signature).toString("base64"), receiptHash: ticket.previousHash,
        ...(ticket.terminal ? { serverSeed: ticket.seed } : {}) };
    })();
  }
}
