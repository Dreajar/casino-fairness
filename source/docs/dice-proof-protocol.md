# Replicate Dice Nitro proof protocol v1

Protocol identifier: `replicate-dice-nitro-v1`. All values at the signed boundary are strings, booleans, `null`, arrays, objects, or safe integers. Floating-point values are forbidden.

## Canonical form

Tickets and receipts use the JSON Canonicalization Scheme from RFC 8785, restricted to the data model above. Object member names are sorted lexicographically, strings use JSON escaping, arrays retain order, and no insignificant whitespace is emitted. The receipt signature covers `SHA-256(UTF8(canonical-receipt))`.

## Ticket ordering

1. The browser samples a 32-byte challenge with Web Crypto and sends it with the demo session identifier.
2. The enclave samples a 32-byte server seed, a 128-bit ticket ID, and a fresh P-256 signing key. It commits `SHA-256(serverSeed)` before the player seed exists.
3. Nitro attestation places the browser challenge in `nonce`, the DER SubjectPublicKeyInfo in `public_key`, and `SHA-256(canonical-ticket-binding)` in `user_data`.
4. The browser validates the complete AWS certificate/COSE chain, freshness, PCR0/1/2, challenge, key, ticket binding, release, and five-minute expiry.
5. Only then does the browser sample the 32-byte player seed and submit the bet.

This ordering prevents the enclave from selecting its server seed after seeing the player's seed. The ticket also contains the demo session and sequence so a valid proof cannot be moved to another demo balance.

## Dice kernel

The roll domain is exactly the integers 0 through 9,999, displayed as 0.00 through 99.99. For HMAC block `b`, the enclave computes HMAC-SHA256 using the server seed bytes as key and UTF-8 canonical JSON as the message:

```json
{"block":b,"clientSeed":"…","direction":"over","gameId":"dice","protocolVersion":"replicate-dice-nitro-v1","releaseId":"…","sequence":0,"sessionId":"…","targetBasisPoints":5050,"ticketId":"…"}
```

Each 32-byte HMAC output is read as eight unsigned big-endian 32-bit values. Values at or above `floor(2^32 / 10000) * 10000` are rejected. The first accepted value modulo 10,000 is the roll. This rejection rule removes modulo bias.

- `over` wins when `rollBasisPoints >= targetBasisPoints`.
- `under` wins when `rollBasisPoints < targetBasisPoints`.
- `targetBasisPoints` is an integer from 200 through 9,800.

Let `chance` be `10000 - targetBasisPoints` for over or `targetBasisPoints` for under. The multiplier uses one-millionths:

```text
multiplierMicros = floor(9900 * 1,000,000 / chance)
payoutAtoms      = won ? floor(wagerAtoms * multiplierMicros / 1,000,000) : 0
```

The pre-rounding theoretical return is 99%. Every multiplication that can exceed JavaScript's safe integer range uses `BigInt`. `wagerAtoms`, `multiplierMicros`, and `payoutAtoms` are canonical unsigned decimal strings.

## Receipt

The canonical receipt includes the ticket fields plus `schemaVersion`, `requestId`, player seed, direction, target, wager, roll, win flag, multiplier, payout, and issue time. The enclave signs the receipt hash using P-256 ECDSA with SHA-256. The encoding is the 64-byte IEEE P1363 form `r || s`, base64-encoded, matching browser Web Crypto.

An identical retry returns the stored completed proof. Any changed input on the used ticket is rejected. The seed and private key are removed from the live ticket immediately after signing; the completed public response is retained briefly for retry. An enclave restart invalidates unplayed tickets and cannot authorize a settlement without a receipt that validates under the attested key.

## Release identity

The release identifier is `source-sha256:<sourceArchiveSha256>`. The published manifest maps that exact deterministic source archive to the parent image digest, enclave Docker digest, EIF SHA-384, and PCR0/1/2. The browser additionally embeds an approved release policy containing the release ID and PCR values; PCR expectations are never accepted from the ticket API.
