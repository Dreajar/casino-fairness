# Casino fairness verifier

Want to check a round you've played? Download your bet history and run it through this verifier. It works out the result again and compares it with what the game recorded.

The check runs on your computer. It doesn't send us your file.

## Give it a try

1. Finish your round, open **Provably fair**, and click **Rotate & reveal**.
2. Click **Export bet history** to save the file.
3. [Download the verifier](https://github.com/Dreajar/casino-fairness/releases/latest) and extract the ZIP named `casino-fairness-v…` under **Assets**.

You'll need Node.js 24 or later installed. On Windows, you can then drag your history file onto `verify-history.cmd`.

The [player guide](PLAYERS.md) walks through the setup and explains the results. For the commands, proof formats, and build instructions, see the [developer guide](DEVELOPERS.md).

## What does a successful check mean?

A pass means the revealed seed matches the fingerprint recorded before play, and using that seed produces the recorded result and payout.

Nitro proofs go further: they include signed evidence from AWS about the code that produced the result. You'll need a separate Nitro proof file for that; a normal bet-history export doesn't contain it. Read [what Nitro checks](PLAYERS.md#what-is-nitro) or [how to verify a Nitro proof](DEVELOPERS.md#check-a-nitro-proof).

Passing a check doesn't guarantee a win or a withdrawal.

## Where is the Nitro code?

Our program that runs inside Nitro is in [source/enclave/oracle](source/enclave/oracle). Start with [game-service.ts](source/enclave/oracle/game-service.ts). The [game calculations](source/packages/fairness-core/src) and [Dockerfile used to build the image](source/enclave/Dockerfile) are public too.

The developer guide shows [which files to read](DEVELOPERS.md#where-is-our-nitro-code) and [how to check that this source matches a round's AWS proof](DEVELOPERS.md#how-do-i-check-that-this-code-produced-a-round).

## Using the code

We've made the code available so people can inspect it and check the proofs. Our [license](LICENSE) allows noncommercial verification, but doesn't allow commercial reuse or use in another casino. Third-party libraries keep their own licenses.
