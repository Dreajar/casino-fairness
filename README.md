# Check your game results

This tool lets you check a downloaded game record on your own computer. It recalculates the round and checks whether the recorded result and payout match. Your file stays on your computer.

## Choose your guide

| For players | For developers and technical reviewers |
| --- | --- |
| **[Check my results →](PLAYERS.md)** | **[Inspect the code and proofs →](DEVELOPERS.md)** |
| Plain-English steps, what PASS means, and help if something goes wrong. | Commands, proof formats, source code, Nitro checks, and rebuilding instructions. |

## Start here

1. In the game, finish a round, click **Provably fair**, then **Rotate & reveal**.
2. Click **Export bet history**.
3. Follow the **[player guide](PLAYERS.md)** to check that file.

[Download the latest verifier package](https://github.com/Dreajar/casino-fairness/releases/latest). Under **Assets**, choose the ZIP whose name starts with `casino-fairness-v`, then extract it.

## What does a successful check mean?

For a normal game-history file, it means the revealed seed matches the earlier commitment, and the recorded result and payout match the calculation.

Some proof files also contain an AWS Nitro check. That checks evidence about the code that produced the result. **A normal history export does not include that check.** The [player guide](PLAYERS.md#what-is-nitro) explains the difference in plain English; the [developer guide](DEVELOPERS.md#check-an-archived-nitro-proof) covers the technical checks.

These checks do not promise that you will win or guarantee withdrawals.

## Use of this code

You may inspect and use the covered code for noncommercial verification. Commercial reuse and using it in another casino are not permitted. See [LICENSE](LICENSE); third-party libraries keep their own licenses.
