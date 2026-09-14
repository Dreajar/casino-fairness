import { decodeAttestation, bytesFromBase64 } from "../../../duel-at-dawn/public/attestation.mjs";
import { verifyChain } from "./attestation.mjs";
import { canonicalJson, sha256Hex } from "./index.mjs";

const hex = (bytes) => Array.from(bytes ?? [], (byte) => byte.toString(16).padStart(2, "0")).join("");
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);

/** Policy/root are caller-pinned; never load them from the response being checked. */
export async function verifyGameTicket({ ticket, challengeB64, expectedRequest, policy, rootCertPem, now = Date.now(), allowMock = false, protocolVersion = "casino-game-proof-v1" }) {
  try {
    const { binding, attestationB64, publicKeySpkiB64 } = ticket;
    if (binding.usdScale !== 8) throw new Error("Ticket uses an incompatible USD accounting unit");
    if (policy.mode !== "aws" && !allowMock) throw new Error("AWS trust policy required");
    if (binding.protocolVersion !== protocolVersion || binding.releaseId !== policy.releaseId || binding.rulesHash !== policy.rulesHash) throw new Error("Unapproved game release");
    if (!policy.enabledGameIds.includes(binding.gameId)) throw new Error("Game absent from pinned release policy");
    if (binding.payoutRounding !== "floor-minor-v1") throw new Error("Unapproved payout rounding rule");
    if (binding.recoveryProtocol !== undefined) {
      if (binding.recoveryProtocol !== "sealed-ticket-v1" || typeof ticket.recoveryB64 !== "string" || ticket.recoveryB64.length > 65536 ||
        await sha256Hex(ticket.recoveryB64) !== binding.recoverySha256) throw new Error("Sealed ticket commitment mismatch");
    }
    for (const field of ["wagerMinor", "chargedWagerMinor"]) {
      if (typeof binding[field] !== "string" || !/^[1-9][0-9]{0,14}$/.test(binding[field]) || BigInt(binding[field]) > BigInt(policy.maximumWagerMinor)) throw new Error("Ticket wager exceeds approved policy");
    }
    for (const key of ["playerRef", "clubRef", "roundId", "gameId", "wagerMinor", "action"]) {
      if (binding[key] !== expectedRequest[key]) throw new Error(`Ticket request mismatch: ${key}`);
    }
    if (!/^[a-f0-9]{64}$/.test(binding.serverSeedHash) || !/^[a-f0-9]{32}$/.test(binding.ticketId) || !/^[a-f0-9]{32}$/.test(binding.bootId) || binding.sequence !== 0) throw new Error("Malformed ticket identity");
    const { document, cose } = decodeAttestation(bytesFromBase64(attestationB64));
    document.__cose = cose;
    const lifetime = binding.expiresAt - binding.issuedAt;
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(binding.issuedAt) || !Number.isSafeInteger(binding.expiresAt) || lifetime <= 0 || lifetime > 300_000 || now > binding.expiresAt || document.timestamp > now + 30_000 || now - document.timestamp > 300_000 || Math.abs(binding.issuedAt - document.timestamp) > 30_000) throw new Error("Stale ticket or invalid attested lifetime");
    await verifyChain(document, rootCertPem, globalThis.crypto.subtle);
    for (const index of [0, 1, 2]) {
      const expected = policy.pcrs[index] ?? policy.pcrs[`PCR${index}`];
      if (typeof expected !== "string" || !/^[a-f0-9]{96}$/.test(expected) || /^0+$/.test(expected) || hex(document.pcrs.get(index)) !== expected) throw new Error("PCR mismatch or debug enclave");
    }
    const challenge = bytesFromBase64(challengeB64);
    const key = bytesFromBase64(publicKeySpkiB64);
    if (challenge.length !== 32 || hex(document.nonce) !== hex(challenge)) throw new Error("Challenge mismatch");
    if (hex(document.publicKey) !== hex(key) || await sha256Hex(key) !== binding.publicKeySha256) throw new Error("Attested key mismatch");
    if (hex(document.userData) !== await sha256Hex(canonicalJson(binding))) throw new Error("Attested ticket mismatch");
    return { ok: true, trustedHardware: policy.mode === "aws" };
  } catch (error) { return { ok: false, trustedHardware: false, reason: error.message }; }
}

export async function verifyGameReceipt({ ticket, result, request, policy }) {
  try {
    if (ticket.binding.usdScale !== 8) throw new Error("Receipt uses an incompatible USD accounting unit");
    const { receipt, receiptSignatureB64, serverSeed } = result;
    for (const [key, value] of Object.entries(ticket.binding)) if (!equal(receipt[key], value)) throw new Error(`Receipt binding mismatch: ${key}`);
    if (receipt.requestId !== request.requestId || receipt.clientSeed !== request.clientSeed || ticket.binding.ticketId !== request.ticketId) throw new Error("Receipt request mismatch");
    if (!/^[a-f0-9]{64}$/.test(serverSeed) || await sha256Hex(serverSeed) !== ticket.binding.serverSeedHash) throw new Error("Seed commitment mismatch");
    if (!Number.isSafeInteger(receipt.completedAt) || receipt.completedAt < ticket.binding.issuedAt ||
      (ticket.binding.recoveryProtocol !== "sealed-ticket-v1" && receipt.completedAt > ticket.binding.expiresAt)) throw new Error("Receipt timing mismatch");
    for (const key of ["chargedWagerMinor", "payoutMinor"]) if (typeof receipt[key] !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(receipt[key])) throw new Error("Invalid monetary encoding");
    if (BigInt(receipt.payoutMinor) > BigInt(policy.maximumPayoutMinor)) throw new Error("Payout exceeds approved policy");
    const key = await globalThis.crypto.subtle.importKey("spki", bytesFromBase64(ticket.publicKeySpkiB64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    if (!(await globalThis.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytesFromBase64(receiptSignatureB64), new TextEncoder().encode(canonicalJson(receipt))))) throw new Error("Invalid receipt signature");
    const outcome = JSON.parse(receipt.outcomeJson);
    if (receipt.payoutRounding !== "floor-minor-v1") throw new Error("Unapproved payout rounding rule");
    let numerator, denominator;
    if (receipt.gameId === "baccarat" && receipt.action.startsWith("bets:v2:")) {
      numerator = BigInt(outcome.payoutRatio.numerator);
      denominator = BigInt(outcome.payoutRatio.denominator);
      if (numerator < 0n || denominator <= 0n || numerator > 31n * denominator) throw new Error("Invalid baccarat ratio");
    } else {
      const multiplier = /^(0|[1-9][0-9]{0,10})(?:\.([0-9]{1,4}))?$/.exec(receipt.multiplier);
      if (!multiplier) throw new Error("Invalid multiplier encoding");
      denominator = 10n ** BigInt((multiplier[2] ?? "").length);
      numerator = BigInt(multiplier[1]) * denominator + BigInt(multiplier[2] ?? "0");
    }
    if (BigInt(receipt.payoutMinor) !== BigInt(receipt.chargedWagerMinor) * numerator / denominator) throw new Error("Payout does not follow the signed rounding rule");
    return { ok: true };
  } catch (error) { return { ok: false, reason: error.message }; }
}
