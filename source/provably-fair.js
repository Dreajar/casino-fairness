import { createHash, createHmac } from "node:crypto";

export const symbols = ["A", "K", "Q", "J", "10", "🤠", "🐎", "🔫", "💰"];
export const tiers = [0, 0.4, 0.8, 1.5, 3];

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createFloatSource(serverSeed, clientSeed, nonce) {
  let bytes = Buffer.alloc(0);
  let cursor = 0;
  let round = 0;

  return function nextFloat() {
    if (cursor + 4 > bytes.length) {
      bytes = createHmac("sha256", serverSeed)
        .update(`${clientSeed}:${nonce}:${round}`)
        .digest();
      cursor = 0;
      round += 1;
    }

    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      value += bytes[cursor + index] / (256 ** (index + 1));
    }
    cursor += 4;
    return value;
  };
}

function round2(value) {
  return Number(value.toFixed(2));
}

export function computeSpin(serverSeed, clientSeed, nonce, bet) {
  const nextFloat = createFloatSource(serverSeed, clientSeed, nonce);
  const reels = Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => symbols[Math.floor(nextFloat() * symbols.length)])
  );
  const center = reels.map((reel) => reel[1]);
  const run = center.every((value) => value === center[0]);
  const pair = new Set(center).size <= 3;
  const multiplier = run ? 120 : pair ? tiers[Math.floor(nextFloat() * tiers.length)] : 0;

  return {
    reels,
    bet,
    multiplier,
    payout: round2(bet * multiplier),
    balanceDelta: round2(bet * multiplier - bet)
  };
}
