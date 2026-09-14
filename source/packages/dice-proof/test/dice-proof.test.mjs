import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalJson,
  diceMultiplierMicros,
  dicePayoutAtoms,
  diceWins,
  exportP256PublicKey,
  generateP256SigningKey,
  publicKeyHashHex,
  resolveDice,
  signReceipt,
  verifyDiceResult,
  verifyReceiptSignature
} from "../src/index.mjs";

const golden = JSON.parse(readFileSync(new URL("../vectors/dice-golden-v1.json", import.meta.url), "utf8"));
const serverSeed = golden.serverSeed;
const binding = golden.binding;
const play = golden.play;

test("RFC 8785 restricted canonical form sorts keys and rejects floats", () => {
  assert.equal(canonicalJson({ z: 1, a: [true, "x"] }), '{"a":[true,"x"],"z":1}');
  assert.throws(() => canonicalJson({ amount: 1.25 }), /safe integers/);
});

test("integer multiplier and payout preserve the 99% pre-rounding return", () => {
  assert.equal(diceMultiplierMicros("under", 200), 49_500_000n);
  assert.equal(diceMultiplierMicros("over", 5_050), 2_000_000n);
  assert.equal(diceMultiplierMicros("under", 4_950), 2_000_000n);
  assert.equal(diceMultiplierMicros("over", 9_800), 49_500_000n);
  assert.equal(dicePayoutAtoms("125", "2000000", true), 250n);
  assert.equal(dicePayoutAtoms("125", "2000000", false), 0n);
  assert.equal(dicePayoutAtoms("1", "49500000", true), 49n);
  assert.equal(dicePayoutAtoms("100000000", "49500000", true), 4_950_000_000n);
  assert.equal(diceWins("over", 200, 199), false);
  assert.equal(diceWins("over", 200, 200), true);
  assert.equal(diceWins("over", 9_800, 9_799), false);
  assert.equal(diceWins("over", 9_800, 9_800), true);
  assert.equal(diceWins("under", 200, 199), true);
  assert.equal(diceWins("under", 200, 200), false);
  assert.equal(diceWins("under", 9_800, 9_799), true);
  assert.equal(diceWins("under", 9_800, 9_800), false);
});

test("Dice proof has a stable golden HMAC outcome", async () => {
  assert.deepEqual(await resolveDice(serverSeed, binding, play), golden.expected);
});

test("all 10,000 display outcomes obey exact over and under RTP arithmetic", () => {
  for (const target of [200, 1_234, 4_950, 5_050, 8_765, 9_800]) {
    for (const direction of ["over", "under"]) {
      const wins = Array.from({ length: 10_000 }, (_, roll) =>
        direction === "over" ? roll >= target : roll < target
      ).filter(Boolean).length;
      const expectedWins = direction === "over" ? 10_000 - target : target;
      assert.equal(wins, expectedWins);
      const returnNumerator = BigInt(wins) * diceMultiplierMicros(direction, target);
      assert.ok(returnNumerator <= 9_900n * 1_000_000n);
      assert.ok(returnNumerator > 9_899n * 1_000_000n);
    }
  }
});

test("P-256 receipt signatures and full result verification fail on tampering", async () => {
  const keyPair = await generateP256SigningKey();
  const publicKey = await exportP256PublicKey(keyPair.publicKey);
  const keyedBinding = { ...binding, publicKeySha256: await publicKeyHashHex(publicKey) };
  const resolved = await resolveDice(serverSeed, keyedBinding, play);
  const receipt = { schemaVersion: 1, ...keyedBinding, ...play, ...resolved, issuedAt: 1_800_000_000_000 };
  const signature = await signReceipt(receipt, keyPair.privateKey);
  const publicKeyB64 = Buffer.from(publicKey).toString("base64");
  assert.equal(await verifyReceiptSignature(receipt, signature, publicKeyB64), true);
  assert.equal((await verifyDiceResult({
    binding: keyedBinding,
    receipt,
    receiptSignatureB64: signature,
    publicKeySpkiB64: publicKeyB64,
    serverSeed,
    expectedPlayInput: play
  })).ok, true);

  const tampered = { ...receipt, payoutAtoms: "251" };
  const result = await verifyDiceResult({
    binding: keyedBinding,
    receipt: tampered,
    receiptSignatureB64: signature,
    publicKeySpkiB64: publicKeyB64,
    serverSeed
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks.receiptSignature, false);
  assert.equal(result.checks.payout, false);

  const changedBet = await verifyDiceResult({
    binding: keyedBinding,
    receipt,
    receiptSignatureB64: signature,
    publicKeySpkiB64: publicKeyB64,
    serverSeed,
    expectedPlayInput: { ...play, direction: "under" }
  });
  assert.equal(changedBet.ok, false);
  assert.equal(changedBet.checks.playInput, false);

  for (const [field, value] of [
    ["wagerAtoms", "126"],
    ["targetBasisPoints", 5_051],
    ["direction", "under"],
    ["rollBasisPoints", (receipt.rollBasisPoints + 1) % 10_000],
    ["multiplierMicros", (BigInt(receipt.multiplierMicros) + 1n).toString()],
    ["payoutAtoms", (BigInt(receipt.payoutAtoms) + 1n).toString()]
  ]) {
    const altered = { ...receipt, [field]: value };
    const alteredResult = await verifyDiceResult({
      binding: keyedBinding,
      receipt: altered,
      receiptSignatureB64: signature,
      publicKeySpkiB64: publicKeyB64,
      serverSeed
    });
    assert.equal(alteredResult.ok, false, `${field} alteration must fail`);
    assert.equal(alteredResult.checks.receiptSignature, false, `${field} alteration must invalidate its signature`);
  }

  const alteredSeed = await verifyDiceResult({
    binding: keyedBinding,
    receipt,
    receiptSignatureB64: signature,
    publicKeySpkiB64: publicKeyB64,
    serverSeed: "ff".repeat(32)
  });
  assert.equal(alteredSeed.ok, false);
  assert.equal(alteredSeed.checks.commitment, false);

  const alteredSignatureBytes = Buffer.from(signature, "base64");
  alteredSignatureBytes[0] ^= 1;
  const alteredSignature = await verifyDiceResult({
    binding: keyedBinding,
    receipt,
    receiptSignatureB64: alteredSignatureBytes.toString("base64"),
    publicKeySpkiB64: publicKeyB64,
    serverSeed
  });
  assert.equal(alteredSignature.ok, false);
  assert.equal(alteredSignature.checks.receiptSignature, false);
});
