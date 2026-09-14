import { bytesFromBase64 } from "../../../duel-at-dawn/public/attestation.mjs";
import { canonicalJson, sha256Hex } from "./index.mjs";
import { verifyGameTicket } from "./game-attestation.mjs";
import { createProgressiveKernel, isEnclaveProgressiveGameId, progressiveInitialWagerMinor } from "../../../enclave/oracle/progressive-kernels.ts";

export async function verifyProgressiveTicket(input) {
  const verified = await verifyGameTicket({ ...input, protocolVersion: "casino-progressive-proof-v1" });
  if (!verified.ok) return verified;
  const binding = input.ticket.binding;
  try {
  if (binding.maximumPayoutMinor !== String(input.policy.maximumPayoutMinor) ||
      binding.chargedWagerMinor !== progressiveInitialWagerMinor(binding.gameId, binding.action, BigInt(binding.wagerMinor), 8).toString()) {
    return { ok: false, trustedHardware: false, reason: "Progressive exposure policy mismatch" };
  }
  return verified;
  } catch { return { ok: false, trustedHardware: false, reason: "Invalid progressive opening stake" }; }
}

/** Verify the complete ordered transcript after separately verifying its pinned
 * attested ticket. An active receipt never authorizes a payout or seed reveal. */
export async function verifyProgressiveTranscript({ ticket, commands, results, policy }) {
  try {
    if (ticket.binding.usdScale !== 8 || ticket.binding.protocolVersion !== "casino-progressive-proof-v1" || ticket.binding.payoutRounding !== "floor-minor-v1" || ticket.binding.releaseId !== policy.releaseId ||
        ticket.binding.rulesHash !== policy.rulesHash || !policy.enabledGameIds.includes(ticket.binding.gameId)) throw new Error("Unapproved progressive release");
    if (!Array.isArray(commands) || !Array.isArray(results) || results.length < 1 || results.length > 128 || results.length !== commands.length) throw new Error("Invalid transcript length");
    const key = await globalThis.crypto.subtle.importKey("spki", bytesFromBase64(ticket.publicKeySpkiB64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    let previousHash = await sha256Hex(canonicalJson(ticket.binding));
    let previousTime = ticket.binding.issuedAt;
    let terminal = false;
    let totalWager = 0n;
    let previousView;
    const requestIds = new Set();
    const seed = commands[0].clientSeed;
    if (!/^[a-f0-9]{64}$/.test(seed)) throw new Error("Invalid player entropy");
    for (let index = 0; index < results.length; index++) {
      const result = results[index], receipt = result.receipt, command = commands[index];
      if (terminal) throw new Error("Actions follow a terminal result");
      for (const [name, value] of Object.entries(ticket.binding)) {
        if (canonicalJson(receipt[name]) !== canonicalJson(value)) throw new Error(`Progressive binding mismatch: ${name}`);
      }
      if (command.sequence !== index || receipt.actionSequence !== index || command.ticketId !== ticket.binding.ticketId ||
          command.clientSeed !== seed || receipt.clientSeed !== seed || command.action !== receipt.commandAction ||
          command.previousReceiptHash !== previousHash || receipt.previousReceiptHash !== previousHash ||
          !command.requestId || receipt.requestId !== command.requestId || requestIds.has(command.requestId)) throw new Error("Progressive command mismatch");
      if (index === 0 && command.action !== ticket.binding.action) throw new Error("Opening action mismatch");
      if (!Number.isSafeInteger(receipt.completedAt) || receipt.completedAt < previousTime ||
          (index === 0 && !ticket.binding.recoveryProtocol && receipt.completedAt > ticket.binding.expiresAt)) throw new Error("Progressive timestamp mismatch");
      if (!["ACTIVE", "LOST", "CASHED_OUT", "COMPLETED"].includes(receipt.status)) throw new Error("Invalid progressive status");
      terminal = receipt.status !== "ACTIVE";
      if (typeof receipt.payoutMinor !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(receipt.payoutMinor) ||
          BigInt(receipt.payoutMinor) > BigInt(policy.maximumPayoutMinor) ||
          ((!terminal || receipt.status === "LOST") && receipt.payoutMinor !== "0")) throw new Error("Invalid progressive payout");
      if (terminal) {
        if (!/^[a-f0-9]{64}$/.test(result.serverSeed) || await sha256Hex(result.serverSeed) !== ticket.binding.serverSeedHash) throw new Error("Progressive seed commitment mismatch");
      } else if (result.serverSeed !== undefined) throw new Error("Premature seed disclosure");
      if (!(await globalThis.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytesFromBase64(result.receiptSignatureB64), new TextEncoder().encode(canonicalJson(receipt))))) throw new Error("Invalid progressive signature");
      const view = JSON.parse(receipt.outcomeJson);
      if (view.roundId !== ticket.binding.roundId || view.gameId !== ticket.binding.gameId || view.sequence !== index ||
          view.status !== receipt.status || view.payoutMinor !== receipt.payoutMinor) throw new Error("Progressive view mismatch");
      if (["blackjack", "rainbet-war"].includes(ticket.binding.gameId)) {
        for (const value of [view.actionWagerMinor, view.totalWagerMinor]) {
          if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(value)) throw new Error("Invalid progressive stake encoding");
        }
        const expectedCharge = index === 0 ? ticket.binding.chargedWagerMinor : previousView?.nextActionWagersMinor?.[command.action.split(":")[0]];
        if (expectedCharge === undefined || view.actionWagerMinor !== expectedCharge) throw new Error("Progressive action stake quote mismatch");
        totalWager += BigInt(view.actionWagerMinor);
        if (view.totalWagerMinor !== totalWager.toString()) throw new Error("Progressive cumulative stake mismatch");
      }
      previousView = view;
      previousHash = await sha256Hex(canonicalJson(receipt));
      if (result.receiptHash !== previousHash) throw new Error("Progressive receipt hash mismatch");
      previousTime = receipt.completedAt;
      requestIds.add(command.requestId);
    }
    if (terminal) {
      if (!isEnclaveProgressiveGameId(ticket.binding.gameId)) throw new Error("Unsupported progressive replay game");
      const kernel = createProgressiveKernel({ usdScale: 8, roundId: ticket.binding.roundId, gameId: ticket.binding.gameId,
        wagerMinor: BigInt(ticket.binding.wagerMinor), maximumPayoutMinor: BigInt(policy.maximumPayoutMinor),
        action: ticket.binding.action, serverSeed: results.at(-1).serverSeed, clientSeed: seed, nonce: 0,
        ...(ticket.binding.gameId === "blackjack" ? { blackjackRules: JSON.parse(results[0].receipt.outcomeJson).outcome.rules } : {}) });
      for (let index = 0; index < results.length; index++) {
        const command = commands[index];
        const view = index === 0 ? kernel.view() : kernel.advance({ roundId: ticket.binding.roundId, ...command });
        // The signed outcome is the kernel's exact JSON serialization, including
        // fractional multipliers; canonicalJson intentionally permits integers only.
        if (JSON.stringify(view) !== results[index].receipt.outcomeJson) throw new Error("Progressive math replay mismatch");
      }
    }
    return { ok: true, terminal, payoutMinor: terminal ? results.at(-1).receipt.payoutMinor : "0" };
  } catch (error) { return { ok: false, reason: error.message }; }
}
