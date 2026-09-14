# For players: check your results

[Home](README.md) · [Developer guide](DEVELOPERS.md)

You do not need to know how to code. You need your downloaded game-history file and a free program called Node.js to run the checker.

## 1. Download your game record

On the game's page:

1. Finish a round and wait for it to end.
2. Open **Provably fair**, above the game.
3. Click **Rotate & reveal**. This reveals the secret seed used for the previous rounds so they can be checked.
4. Click **Export bet history**. Save the downloaded `.json` file.

The green or blue “verified” message in the game is a check performed by the casino's server. The steps below let you run the check on your own computer.

After rotation, **nonce 0** simply means a new sequence of rounds has started. It does not erase the old rounds.

## 2. Get the checker

1. Open [Downloads](https://github.com/Dreajar/casino-fairness/releases/latest).
2. Under **Assets**, download the ZIP whose name starts with `casino-fairness-v`. Choose the verifier ZIP, rather than GitHub's automatically generated “Source code” downloads.
3. Extract the ZIP. Open the extracted folder containing `verify-history.cmd` and `verify-fairness.mjs`.
4. Install **Node.js version 24 or later** from [nodejs.org](https://nodejs.org/en/download). Keep the installer's option to add Node to PATH enabled, if shown.

You do not need an AWS account or a casino login. Checking a file does not upload it.

## 3. Run it on Windows

Drag your downloaded game-history `.json` file onto **`verify-history.cmd`** in the extracted folder.

A window will open, run the check, and stay open so you can read the result. You do not need to type a command.

## 3. Run it on Mac or Linux

Open a terminal in the extracted checker folder. Run this command, replacing the example path with your downloaded file's path:

```sh
node verify-fairness.mjs "/full/path/to/fairness-history.json"
```

Keep the quotation marks if the path contains spaces.

## 4. Read the result

A successful round looks like this:

```text
PASS  schema
PASS  serverSeed.revealed
PASS  commitment
PASS  outcome
PASS  multiplier
PASS  payout

VERIFIED: 1 round
```

| Result | In plain English |
| --- | --- |
| `schema` | The file contains the required information. |
| `serverSeed.revealed` | The old secret seed is included, so the round can be checked. |
| `commitment` | That seed matches the fingerprint recorded before play. |
| `outcome` | Recalculating the round produces the recorded result. |
| `multiplier` | The recorded win multiplier matches the calculation. |
| `payout` | The recorded payout matches the calculation. |

`VERIFIED: 1 round` means one round was checked successfully. A larger export may contain several rounds. It is marked verified only if all included rounds pass.

## If something goes wrong

**“Node is not recognized” or “Install Node.js”**  
Install Node.js 24 or later, then open a new terminal or File Explorer window and try again. If Windows still cannot find it, sign out and back in after installation.

**“Cannot find module”**  
Extract the ZIP first. For typed commands, open the terminal inside the folder containing the checker. The Windows drag-and-drop method avoids this folder issue.

**`FAIL serverSeed.revealed`**  
The export contains a round whose seed has not been revealed. Finish any active round, use **Rotate & reveal**, and download a fresh export.

**`FAIL schema` or a JSON error**  
Check that you selected a game-history export. A Dice proof file and a Nitro proof file use different checkers. Do not edit the downloaded file.

**Another check fails**  
Keep the original file and the full result. Check that you have the verifier for the release used by your game. A failure alone does not explain whether the cause is missing information, a version mismatch, or a changed result. Do not treat a failed check as verified.

## What is Nitro?

Nitro is an AWS feature that provides signed evidence about the software running inside a protected environment.

There are two different checks here:

- **Game history:** checks the revealed seed, result, and payout. This is the normal export described above.
- **Nitro proof:** also checks AWS evidence and a signed result from that environment. It needs a different proof file and the approved release details.

Your normal history export does not prove Nitro was used. For a Nitro proof file, follow the [Nitro section of the developer guide](DEVELOPERS.md#check-an-archived-nitro-proof).

A successful check concerns the recorded round. It does not guarantee future wins, service availability, or withdrawals.

## Can I reuse the code?

You can inspect it and run noncommercial verification checks. You cannot reuse the covered code commercially or use it to run another casino. [Full terms](LICENSE).
