const encoder = new TextEncoder();

export const DICE_PROOF_SCHEMA_VERSION = 1;
export const DICE_PROOF_PROTOCOL_VERSION = "replicate-dice-nitro-v1";
export const DICE_PROOF_GAME_ID = "dice";
export const DICE_PROOF_TICKET_TTL_MS = 5 * 60 * 1000;
export const DICE_MULTIPLIER_SCALE = 1_000_000n;
export const DICE_HOUSE_RETURN_BASIS_POINTS = 9_900n;

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto;
}

function plainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical JSON accepts only safe integers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (!plainObject(value)) throw new TypeError("Canonical JSON accepts only plain JSON values");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`)
    .join(",")}}`;
}

// RFC 8785 JSON Canonicalization Scheme, restricted to the protocol's safe-
// integer/string/boolean/null data model. The restriction avoids floating-point
// and non-JSON values at the signed boundary.
export function canonicalJson(value) {
  return canonicalValue(value);
}

export function bytesToHex(input) {
  return Array.from(new Uint8Array(input instanceof ArrayBuffer ? input : input.buffer, input.byteOffset ?? 0, input.byteLength))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(value, expectedBytes) {
  if (typeof value !== "string" || !/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new TypeError("Expected even-length hexadecimal text");
  }
  const output = Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
  if (expectedBytes !== undefined && output.length !== expectedBytes) {
    throw new TypeError(`Expected ${expectedBytes} bytes`);
  }
  return output;
}

export function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("Expected base64 text");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomHex(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new TypeError("Random byte count must be positive");
  return bytesToHex(cryptoApi().getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Bytes(value) {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  return new Uint8Array(await cryptoApi().subtle.digest("SHA-256", input));
}

export async function sha256Hex(value) {
  return bytesToHex(await sha256Bytes(value));
}

function equalHex(left, right, bytes) {
  let a;
  let b;
  try {
    a = hexToBytes(left, bytes);
    b = hexToBytes(right, bytes);
  } catch {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function ticketBindingHashHex(binding) {
  validateTicketBinding(binding);
  return sha256Hex(canonicalJson(binding));
}

export async function publicKeyHashHex(spki) {
  return sha256Hex(spki);
}

export async function releaseIdForManifest(manifest) {
  if (!plainObject(manifest)) throw new TypeError("Release manifest must be an object");
  const sourceArchiveSha256 = manifest.sourceArchiveSha256;
  requireHex(sourceArchiveSha256, 32, "sourceArchiveSha256");
  return `source-sha256:${sourceArchiveSha256.toLowerCase()}`;
}

export async function validateReleaseManifestIdentity(manifest) {
  if (!plainObject(manifest) || typeof manifest.releaseId !== "string") return false;
  if (manifest.mode === "mock") return manifest.releaseId === "local-mock-not-a-release";
  return manifest.releaseId === await releaseIdForManifest(manifest);
}

function requireHex(value, bytes, label) {
  try {
    hexToBytes(value, bytes);
  } catch {
    throw new TypeError(`${label} must be ${bytes}-byte hexadecimal text`);
  }
}

function requireText(value, maximum, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must contain 1-${maximum} characters`);
  }
}

function requireDecimal(value, label) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${label} must be an unsigned canonical decimal string`);
  }
  return BigInt(value);
}

export function validateTicketBinding(binding) {
  if (!plainObject(binding)) throw new TypeError("Ticket binding must be an object");
  if (binding.protocolVersion !== DICE_PROOF_PROTOCOL_VERSION) throw new TypeError("Unsupported Dice proof protocol");
  if (binding.gameId !== DICE_PROOF_GAME_ID) throw new TypeError("Ticket is not bound to Dice");
  requireText(binding.releaseId, 128, "releaseId");
  requireHex(binding.ticketId, 16, "ticketId");
  requireHex(binding.serverSeedHash, 32, "serverSeedHash");
  requireHex(binding.publicKeySha256, 32, "publicKeySha256");
  requireText(binding.sessionId, 128, "sessionId");
  if (!Number.isSafeInteger(binding.sequence) || binding.sequence < 0) throw new TypeError("sequence must be non-negative");
  if (!Number.isSafeInteger(binding.expiresAt) || binding.expiresAt < 0) throw new TypeError("expiresAt must be non-negative");
  return binding;
}

export function validatePlayInput(input) {
  if (!plainObject(input)) throw new TypeError("Dice play input must be an object");
  requireText(input.requestId, 128, "requestId");
  requireHex(input.clientSeed, 32, "clientSeed");
  if (input.direction !== "over" && input.direction !== "under") throw new TypeError("direction must be over or under");
  if (!Number.isSafeInteger(input.targetBasisPoints) || input.targetBasisPoints < 200 || input.targetBasisPoints > 9_800) {
    throw new TypeError("targetBasisPoints must be between 200 and 9800");
  }
  const wager = requireDecimal(input.wagerAtoms, "wagerAtoms");
  if (wager <= 0n || wager > 100_000_000n) throw new TypeError("wagerAtoms is outside the demo limit");
  return input;
}

export function diceMultiplierMicros(direction, targetBasisPoints) {
  if (direction !== "over" && direction !== "under") throw new TypeError("Invalid Dice direction");
  if (!Number.isSafeInteger(targetBasisPoints) || targetBasisPoints < 200 || targetBasisPoints > 9_800) {
    throw new TypeError("Invalid Dice target");
  }
  const chance = BigInt(direction === "over" ? 10_000 - targetBasisPoints : targetBasisPoints);
  return (DICE_HOUSE_RETURN_BASIS_POINTS * DICE_MULTIPLIER_SCALE) / chance;
}

export function dicePayoutAtoms(wagerAtoms, multiplierMicros, won) {
  const wager = typeof wagerAtoms === "bigint" ? wagerAtoms : requireDecimal(wagerAtoms, "wagerAtoms");
  const multiplier = typeof multiplierMicros === "bigint" ? multiplierMicros : requireDecimal(multiplierMicros, "multiplierMicros");
  return won ? (wager * multiplier) / DICE_MULTIPLIER_SCALE : 0n;
}

export function diceWins(direction, targetBasisPoints, rollBasisPoints) {
  if (direction !== "over" && direction !== "under") throw new TypeError("Invalid Dice direction");
  if (!Number.isSafeInteger(targetBasisPoints) || targetBasisPoints < 200 || targetBasisPoints > 9_800) {
    throw new TypeError("Invalid Dice target");
  }
  if (!Number.isSafeInteger(rollBasisPoints) || rollBasisPoints < 0 || rollBasisPoints > 9_999) {
    throw new TypeError("Invalid Dice roll");
  }
  return direction === "over" ? rollBasisPoints >= targetBasisPoints : rollBasisPoints < targetBasisPoints;
}

async function hmacBlock(serverSeedHex, context, block) {
  const key = await cryptoApi().subtle.importKey(
    "raw",
    hexToBytes(serverSeedHex, 32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = canonicalJson({ ...context, block });
  return new Uint8Array(await cryptoApi().subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function diceRollBasisPoints(serverSeedHex, context) {
  requireHex(serverSeedHex, 32, "serverSeed");
  validateTicketBinding({
    protocolVersion: context.protocolVersion,
    releaseId: context.releaseId,
    gameId: DICE_PROOF_GAME_ID,
    ticketId: context.ticketId,
    serverSeedHash: context.serverSeedHash,
    publicKeySha256: context.publicKeySha256,
    sessionId: context.sessionId,
    sequence: context.sequence,
    expiresAt: context.expiresAt
  });
  validatePlayInput(context);
  const rejectionLimit = Math.floor(0x1_0000_0000 / 10_000) * 10_000;
  for (let block = 0; block < 1_000_000; block += 1) {
    const bytes = await hmacBlock(serverSeedHex, {
      protocolVersion: context.protocolVersion,
      releaseId: context.releaseId,
      gameId: DICE_PROOF_GAME_ID,
      ticketId: context.ticketId,
      sessionId: context.sessionId,
      sequence: context.sequence,
      clientSeed: context.clientSeed,
      direction: context.direction,
      targetBasisPoints: context.targetBasisPoints
    }, block);
    for (let offset = 0; offset <= bytes.length - 4; offset += 4) {
      const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
      if (value < rejectionLimit) return value % 10_000;
    }
  }
  throw new Error("Dice rejection sampler exceeded its safety bound");
}

export async function resolveDice(serverSeedHex, binding, playInput) {
  validateTicketBinding(binding);
  validatePlayInput(playInput);
  const rollBasisPoints = await diceRollBasisPoints(serverSeedHex, { ...binding, ...playInput });
  const won = diceWins(playInput.direction, playInput.targetBasisPoints, rollBasisPoints);
  const multiplier = diceMultiplierMicros(playInput.direction, playInput.targetBasisPoints);
  const payout = dicePayoutAtoms(playInput.wagerAtoms, multiplier, won);
  return {
    rollBasisPoints,
    won,
    multiplierMicros: multiplier.toString(),
    payoutAtoms: payout.toString()
  };
}

export function validateReceipt(receipt) {
  if (!plainObject(receipt)) throw new TypeError("Receipt must be an object");
  if (receipt.schemaVersion !== DICE_PROOF_SCHEMA_VERSION) throw new TypeError("Unsupported receipt schema");
  validateTicketBinding(receipt);
  validatePlayInput(receipt);
  if (!Number.isSafeInteger(receipt.rollBasisPoints) || receipt.rollBasisPoints < 0 || receipt.rollBasisPoints > 9_999) {
    throw new TypeError("rollBasisPoints must be between 0 and 9999");
  }
  if (typeof receipt.won !== "boolean") throw new TypeError("won must be boolean");
  requireDecimal(receipt.multiplierMicros, "multiplierMicros");
  requireDecimal(receipt.payoutAtoms, "payoutAtoms");
  if (!Number.isSafeInteger(receipt.issuedAt) || receipt.issuedAt < 0) throw new TypeError("issuedAt must be non-negative");
  return receipt;
}

export async function receiptHashHex(receipt) {
  validateReceipt(receipt);
  return sha256Hex(canonicalJson(receipt));
}

export async function generateP256SigningKey() {
  return cryptoApi().subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
}

export async function exportP256PublicKey(publicKey) {
  return new Uint8Array(await cryptoApi().subtle.exportKey("spki", publicKey));
}

export async function signReceipt(receipt, privateKey) {
  const canonicalReceipt = encoder.encode(canonicalJson(validateReceipt(receipt)));
  const signature = new Uint8Array(
    await cryptoApi().subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, canonicalReceipt)
  );
  if (signature.length !== 64) throw new Error("P-256 receipt signature must use 64-byte IEEE P1363 encoding");
  return bytesToBase64(signature);
}

export async function verifyReceiptSignature(receipt, signatureB64, publicKeySpkiB64) {
  const publicKey = await cryptoApi().subtle.importKey(
    "spki",
    base64ToBytes(publicKeySpkiB64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const canonicalReceipt = encoder.encode(canonicalJson(validateReceipt(receipt)));
  return cryptoApi().subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    base64ToBytes(signatureB64),
    canonicalReceipt
  );
}

export async function verifyDiceResult({
  binding,
  receipt,
  receiptSignatureB64,
  publicKeySpkiB64,
  serverSeed,
  expectedPlayInput
}) {
  const checks = {
    receiptSignature: false,
    ticketBinding: false,
    playInput: expectedPlayInput === undefined,
    receiptTiming: false,
    commitment: false,
    outcome: false,
    multiplier: false,
    payout: false
  };
  const reasons = [];
  try {
    validateTicketBinding(binding);
    validateReceipt(receipt);
    checks.ticketBinding = [
      "protocolVersion", "releaseId", "gameId", "ticketId", "serverSeedHash", "publicKeySha256",
      "sessionId", "sequence", "expiresAt"
    ].every((field) => receipt[field] === binding[field]);
    if (!checks.ticketBinding) reasons.push("Receipt does not match the prepared ticket");
    if (expectedPlayInput !== undefined) {
      validatePlayInput(expectedPlayInput);
      checks.playInput = ["requestId", "clientSeed", "direction", "targetBasisPoints", "wagerAtoms"]
        .every((field) => receipt[field] === expectedPlayInput[field]);
      if (!checks.playInput) reasons.push("Receipt does not match the submitted Dice play");
    }
    checks.receiptTiming = receipt.issuedAt <= receipt.expiresAt;
    if (!checks.receiptTiming) reasons.push("Receipt was issued after its ticket expired");
    checks.receiptSignature = await verifyReceiptSignature(receipt, receiptSignatureB64, publicKeySpkiB64);
    if (!checks.receiptSignature) reasons.push("Receipt signature is invalid");
    checks.commitment = equalHex(await sha256Hex(hexToBytes(serverSeed, 32)), binding.serverSeedHash, 32);
    if (!checks.commitment) reasons.push("Revealed server seed does not match its commitment");
    const computed = await resolveDice(serverSeed, binding, receipt);
    checks.outcome = computed.rollBasisPoints === receipt.rollBasisPoints && computed.won === receipt.won;
    checks.multiplier = computed.multiplierMicros === receipt.multiplierMicros;
    checks.payout = computed.payoutAtoms === receipt.payoutAtoms;
    if (!checks.outcome) reasons.push("Dice outcome does not recompute");
    if (!checks.multiplier) reasons.push("Dice multiplier does not recompute");
    if (!checks.payout) reasons.push("Dice payout does not recompute");
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }
  return { ok: Object.values(checks).every(Boolean), checks, reasons };
}
