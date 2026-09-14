# Developer guide

[Home](README.md) · [Player guide](PLAYERS.md)

This repository contains the checkers, the game calculations they use, and the code built into our AWS Nitro enclave. An enclave is the isolated environment where the game code runs.

To run a checker, install Node.js 24 or later and open a terminal in this folder. You don't need to install npm packages or log in to AWS. The checks run locally.

## Pick the checker for your file

| Your file | Run this |
| --- | --- |
| A normal **Export bet history** download | `verify-fairness.mjs` |
| A game proof containing an AWS-signed document and signed game results | `verify-nitro.mjs` |
| A proof downloaded from the separate Dice proof demo | `verify-dice-proof.mjs` |

These files contain different information. Renaming one won't make it work with another checker.

## Check a game history

```sh
node verify-fairness.mjs "/path/to/fairness-history.json"
```

Before exporting, finish your round and click **Rotate & reveal** in the game's fairness panel. That puts the previous server seed in the export so the checker can use it.

For each round, the checker:

1. Hashes the revealed seed and compares it with the hash recorded before play.
2. Uses the seeds, round number, and recorded action to calculate the game again.
3. Compares the result, multiplier, and payout with the exported values.

It prints `PASS` or `FAIL` for each check. `VERIFIED` means every included round passed. The program exits with code 0 on success and a nonzero code on failure.

This checker uses the demo history's payout calculation, rounded to cents. Nitro receipts use a different calculation with eight decimal places. Use the Nitro checker for those receipts.

## Check a Nitro proof

Start with the included example:

```sh
node verify-nitro.mjs examples/nitro-49-games.json releases/policy.json
```

That file contains 49 test rounds, one for each supported game. They were played on AWS Nitro during testing. They are not customer bets. The checker should print a `PASS` for each game and finish with `VERIFIED: 49 archived Nitro round(s)` followed by a note about the check's limits.

To check your own proof, replace the first filename:

```sh
node verify-nitro.mjs "/path/to/nitro-proof.json" releases/policy.json
```

### What is policy.json?

It tells the checker which software release to accept. It contains the release ID, allowed games, bet and payout limits, and the expected fingerprints of the enclave software. AWS calls those fingerprints **PCR0, PCR1, and PCR2**.

Use the `releases/policy.json` published here for the release that produced your proof. If someone sends you a proof with a different policy file, don't automatically use their file: they could change the expected fingerprints to make different software pass the check. Compare it with the file in the matching release of this repository.

You still need to decide whether you trust the published code and release. You can inspect the source and rebuild it using the instructions below.

### What does the checker do?

It checks that:

1. The AWS-signed document has a valid signature and certificate chain.
2. The software fingerprints in that document match `policy.json`.
3. The document ties the signing key to the record issued before this round.
4. The game result was signed with that key and matches the recorded player actions.
5. Running the game calculation again produces the recorded result and payout.

The code calls the AWS-signed document an **attestation**, and the signed game result a **receipt**.

This command checks a saved round using the time recorded when its ticket was issued. It doesn't contact the running server, check whether it's still online, or approve a new bet.

### What must be in the proof file?

For a game that finishes in one action, such as a slot spin, the JSON needs these fields:

| Field | What it contains |
| --- | --- |
| `request` | The original request to prepare the round, including the game, wager, action, and random challenge sent for the AWS check. |
| `ticket` | The record returned before play, including the seed hash, signing key, and AWS-signed document. |
| `command` | The request that played the round, including the player seed. |
| `result` | The signed result and revealed server seed. The example files call this field `first`; the checker accepts either name. |

For games with several actions, such as blackjack, the checker needs the whole round: the opening action, each hit or stand, and the final result. Those steps belong in `completedHistory`, in order. Each entry contains its `command` and `result`. The checker rejects a round that hasn't finished.

A file can contain one round directly, or several rounds inside a `rounds` array. See [the example file](examples/nitro-49-games.json) for complete, working records.

Amounts ending in `Minor` are integers stored as strings. In these Nitro proofs, `"100000000"` means $1. Preserve those strings when reading or exporting a proof.

**A normal bet-history export doesn't contain the AWS document or signed receipts.** Use the normal history checker for that file. Keep personal proof files private unless you want to share the player and round references they contain.

## Check a Dice demo proof

The separate Dice demo uses its own file format:

```sh
node verify-dice-proof.mjs "/path/to/dice-proof.json" --manifest "/path/to/approved-dice-release.json"
```

The manifest must come from the matching Dice demo release. `releases/policy.json` in this package is for the all-game Nitro checker and won't work here. A result marked `local mock` has not passed an AWS hardware check.

## Find the source and build records

| Path | What's there |
| --- | --- |
| `source/` | The verifier and game source, code used inside Nitro, and the library files needed to build it. |
| `source/docs/` | Details of the seed calculations and proof formats. |
| `enclave/game-service.mjs` | The built JavaScript program included in the recorded Nitro release. |
| `releases/policy.json` | The release details the Nitro checker expects. |
| `releases/build-evidence.json` | The recorded build settings, software fingerprints, and enclave image hash. |
| `releases/live-check.json` | A dated check of the running AWS host. It is a report from us, not an AWS-signed proof. |
| `build-recipes.json` | Source file hashes, build tool version, and settings used by `rebuild.mjs`. |
| `SHA256SUMS.json` | File hashes for checking that your copy matches this download. |
| `THIRD_PARTY_LICENSES/` | Licenses for the included libraries. |

The KMS key identifier in the release records names an AWS key used by the system. It is not the key itself and doesn't grant access to it.

## Build the JavaScript yourself

This step needs npm to download the build tools:

```sh
npm install --ignore-scripts
node rebuild.mjs
```

The script checks the source file hashes, builds the three verifiers and the enclave's JavaScript program, and compares the output with the published files. It prints `MATCH` for each file only if the bytes are identical. The rebuilt files go in `rebuilt/`.

This rebuild was checked for this release. It builds the JavaScript files; the complete Nitro image takes a separate step.

## Build the Nitro image

You'll need a Linux x86-64 machine with Docker Buildx, Nitro CLI 1.5.0, jq, and the other commands listed at the start of [build-game-eif.sh](source/enclave/build-game-eif.sh).

After installing the build tools and running `node rebuild.mjs` above:

```sh
cd source
SOURCE_DATE_EPOCH=0 bash enclave/build-game-eif.sh ../releases/policy.json ../rebuilt-eif
```

The output directory must not already exist. `SOURCE_DATE_EPOCH=0` is the timestamp setting used in the original build. The Dockerfile specifies exact base image and package versions so later updates don't silently change the build.

The script builds the image twice and checks that both copies match. The image file has an `.eif` extension. Compare PCR0, PCR1, PCR2, and the EIF's SHA-384 hash in `rebuilt-eif/release-evidence.json` with the values in `releases/build-evidence.json`. A difference means you haven't reproduced the published image.

The original release records include matching image builds. We also checked the running enclave's fingerprints and stored image hash on September 14, 2026. We did **not** rebuild the full image when preparing this public package.

## What these checks establish

The history checker uses the same published game calculations as the server. Running it locally lets you check the exported result without asking the server to check itself. If you want to write a separate implementation, start with the source, the format descriptions in `source/docs/`, and the example inputs and outputs under `source/packages/`.

A Nitro pass adds evidence that the signed round came from software with the expected fingerprints. Neither check guarantees future wins, service availability, or withdrawals.

## License

You may inspect, rebuild, and run the covered code for noncommercial verification. You may not reuse it commercially or use it to run another casino. See [LICENSE](LICENSE). Third-party libraries keep their own licenses.
