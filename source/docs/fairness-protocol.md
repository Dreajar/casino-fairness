# Replicate catalogue fairness protocol v1

Protocol identifier: `replicate-fairness-v1`. This document specifies the shared server-authoritative engine used by the enabled catalogue. The separate Nitro Dice proof is specified in `docs/dice-proof-protocol.md`.

## Commitment and byte stream

The server samples a 32-byte value and publishes it as 64 lowercase hexadecimal characters. In this protocol the hexadecimal **text** is the seed: do not hex-decode it. The commitment is:

```text
lowercase_hex(SHA-256(UTF8(serverSeed)))
```

Before drawing, normalize the action only for these games:

| Game | HMAC action |
|---|---|
| `rps-ascent` | first `rock`, `paper`, or `scissors` substring, lowercase; otherwise `rock` |
| `chicken-cross` | `start:` plus the parsed difficulty (`medium` when omitted) |
| `tower` | `column:` plus `(integer after tile:) mod 4` |
| `moles`, `nullfield` | `single-step` |
| `stake-pump` | `start:` plus the selected difficulty for the committed progressive round |
| `moonbound` | canonical `pumps:<count>:<difficulty>` |
| `prism-deck` | `deal` |
| `thirteen-card-flip` | `deal` for the committed two-hand round |
| all others | the recorded action unchanged |

For block numbers 0, 1, 2, ... compute:

```text
HMAC-SHA256(
  key = UTF8(serverSeed),
  message = UTF8("replicate-fairness-v1" NUL gameId NUL clientSeed NUL
                 decimalNonce NUL normalizedAction NUL decimalBlock)
)
```

Concatenate the 32-byte digests and consume without alignment padding. `uint32()` consumes four bytes as an unsigned big-endian integer. `int(n)` repeatedly draws `uint32` until the value is below `floor(2^32/n)*n`, then returns `value mod n`. `float()` consumes six bytes as one unsigned big-endian integer and divides by `2^48`. `pick(A)` is `A[int(A.length)]`. This order and rejection behavior are part of the protocol.

Session nonces begin at zero, advance once per resolved one-step play, and reset on seed rotation. Stake Pump, Chicken, Moles, Floor Is Lava, Dragon Tower, and 13 Card Flip reserve one nonce at start and use it for the whole progressive round. A retry with the same request ID returns the stored result.

## Targets and settlement

The common target is 0.97 (9700 basis points). Nine cases require special interpretation:

1. Baccarat is determined by its bet: banker is approximately 98.94%, player 98.76%, and tie 85.64% under the standard commission and drawing rules.
2. Keno has ten separate 97% rows—one for each pick count—rather than one blended row.
3. Dice remains at 99% so its integer kernel agrees with the separately released Nitro Dice economics.
4. Odin enhancer/bonus-buy returns are divided by their action cost. Gates currently exposes no bonus-purchase action; if one is added it must likewise be measured against its purchase cost.
5. Chicken uses its published 98% progressive cash-out curve at every difficulty and lane.
6. Rainbet Limbo uses the observed 99% target-to-chance curve (`49.50000000%` at `2.00x`) and its observed 100,000x target ceiling.
7. Stake Pump and Moonbound preserve the observed Pump ladders and 25-position danger model, whose offered cash-outs are approximately 98% after the displayed multiplier rounding.
8. Plinko uses whole-number payouts and the closest symmetric binomial return to 98% for its legacy action and every risk/row configuration.
9. 13 Card Flip pays 1.96 on a Player win and zero on a House win; the House opens and retains an exactly tied lead.

For Odin, the recorded and debited wager is `baseWager * actionCost`; for every other game it is the base wager. Settlement first divides the engine multiplier by the action cost where applicable, applies the game's public multiplier quantization, then calculates `round(recordedWager * settlementMultiplier * 100) / 100`. Verification repeats those operations in the same order. All engine maxima are published as `FAIRNESS_MAX_MULTIPLIERS` and mirrored by the settlement service.

The seven slots named in the slot sections below quantize public outcome and settlement multipliers to two decimal places: `round(value*100)/100`. Other catalogue engines quantize to four decimal places: `round(value*10000)/10000`. In both formulas `round` is JavaScript `Math.round` (nearest integer, with exact half values toward positive infinity). Verification applies the game-specific operation before exact equality. Exposure strings always include exactly four fractional digits.

## One-step engines

Draw order below begins with a fresh stream unless stated otherwise.

- **Moonbound:** shuffle 25 positions, place the selected difficulty's danger count, and resolve the chosen `pumps:<count>:<difficulty>` target in one settlement. The earliest danger position bursts the flight; otherwise the selected ladder multiplier pays.

## Stake Pump progressive round

`start:<difficulty>` shuffles the same 25-position field once, commits the hidden earliest danger position, debits one wager, and returns step zero. Only `pump:<roundId>:<nextStep>` is accepted while active. Reaching the committed position pops the balloon and pays zero; a safe pump advances to that difficulty's observed multiplier. `cashout:<roundId>` is allowed after at least one safe pump and pays the current multiplier. The pop point is revealed only when the round terminates, and seed rotation is rejected while the round is active.

## 13 Card Flip progressive round

`start:player` Fisher–Yates shuffles one standard 52-card deck, deals 13 alternating cards to the House and Player, debits one wager, and reserves the maximum 1.96× exposure. The House reveals from its committed order until it makes a pair or stronger poker hand. While the Player is chasing, `pick:<roundId>:<slot>` assigns the next card in the Player's committed draw order to that still-face-down visual slot. The slot choice therefore cannot change the result. When either side takes the lead, the other continues from its committed order; if it cannot take the lead with its remaining cards, the current leader wins. Intermediate picks never move money. The terminal pick pays 1.96× only when the Player wins, releases exposure, and writes one canonical game round. Active responses redact every unrevealed identity, active rounds resume from PostgreSQL, and seed rotation is rejected until settlement.
- **RPS Ascent:** honor the normalized player choice, then `pick([rock,paper,scissors])`. A draw refunds 1, a normal RPS win pays 1.91, and a loss pays 0. Client stages are ignored.
- **Tower:** honor `column = tile mod 4`, draw `safeColumn=int(4)`, and pay 3.88 only on equality. The receipt reveals that resolved bottom-row tile only.
- **Moles:** draw three distinct integers from 0–6 by repeated `int(7)`. The selected tile wins when it is one of those three and pays the quantized `0.97*7/3 = 2.2633`.
- **Nullfield:** draw five distinct integers from 0–24 by repeated `int(25)`. The selected tile wins when it is not one of them and pays `0.97/0.8 = 1.2125`.
- **Rock Paper Scissors:** honor the player choice, `pick([rock,paper,scissors])`; draw refunds 1, win pays 1.91, loss pays 0.
- **Limbo:** draw `u=float()`, set `raw=min(100000,floor((0.99/(1-u))*100)/100)`, clamp the requested target to 1.01–100000, and pay the target iff `raw>=target`.
- **Dice:** draw `rollBp=int(10000)`. Parse `over:x` or `under:x` (default over 50), set `targetBp=clamp(round(100*x),200,9800)`, and win on `rollBp>=targetBp` for over or `<targetBp` for under. Let `chanceBp=10000-targetBp` for over and `targetBp` for under. `multiplierMicros=floor(9900*1000000/chanceBp)`; a win pays `multiplierMicros/1000000`.
- **Plinko:** parse `drop:<risk>:<rows>` for the four risks and 8–16 rows, then perform one `int(2)` draw per row; zero is left and one is right. The bin is the number of rights. Every browser and settlement multiplier is a non-negative whole number. For a symmetric integer table the binomial-weighted payout numerator is even, so the implementation selects the closest even numerator to `0.98*2^rows`. The backwards-compatible plain `drop` action uses the eight-row Low table `[9,4,1,1,0,1,1,4,9]`.

### Keno

Start with `[1..80]`. Twenty times, draw `i=int(pool.length)`, remove `pool[i]`, and append it to the result. Parse up to ten valid `numbers:` entries, remove duplicate selections, and let `P` be the resulting pick count and `M` the matches. The row for every `P=1..10` has entries `M=0..P`:

```text
payout[P][M] = M * 3.88 / P
```

Because each selected number is drawn with probability 1/4, every nonempty row returns exactly `E[M]*3.88/P = 0.97`.

### Prism Deck

Create cards in index order 0–51 as `{rank:(index mod 13)+1,suit:floor(index/13)}`. Sequence position zero is the fixed opening card `7-clubs`. For every position `p>0`, create a separate stream with nonce `p-1` and action `prism-deck-sequence-v3`, then draw `candidate=int(51)`. Let `currentIndex` be the prior card's 0–51 index; the next index is `candidate` when `candidate<currentIndex`, otherwise `candidate+1`. This samples uniformly from every card except the current exact card. The deck is infinite: any card can return after an intervening card, but an exact consecutive duplicate is impossible. Round nonce `n` displays positions `n` and `n+1`, so its next card becomes the following round's current card; the wager direction never changes the deal. `higher` wins on `next>=current`; `lower` wins on `next<=current`, so the three remaining cards of an equal rank win in both directions. For current rank `r`, the win probability is `(4*(14-r)-1)/51` higher or `(4*r-1)/51` lower. A win pays `quantize4(0.96/probability)`.

## Baccarat

Build eight decks in nested order deck 0–7, suits `[clubs,diamonds,hearts,spades]`, ranks `[A,2,3,4,5,6,7,8,9,10,J,Q,K]`; values are A=1, 2–9 face value, 10/J/Q/K=0. Fisher–Yates shuffle all 416 cards from the last index down, with `int(index+1)`. Deal Player, Banker, Player, Banker. Totals are sums modulo 10. On either natural 8/9, stop. Otherwise Player draws on 0–5. Banker without a Player third card draws on 0–5; with its value `p`, Banker draws on 0–2, on 3 unless `p=8`, on 4 for `p=2..7`, on 5 for `p=4..7`, and on 6 for `p=6..7`.

Player pays 2 on a player win, Banker pays 1.95 on a banker win, Tie pays 9 on a tie. A Player or Banker wager returns 1 on a tie; all other losing bets pay 0.

## Chicken Cross

The first `cross-next-lane:difficulty:<difficulty>:step:0` command commits one server-owned round, debits one wager, and reserves one nonce. The HMAC action is `start:<difficulty>`. The multiplier paths are:

| Difficulty | Multipliers |
|---|---|
| easy | 1.03, 1.09, 1.15, 1.23, 1.31, 1.40, 1.51, 1.63, 1.78, 1.96, 2.18, 2.45, 2.80, 3.27, 3.92, 4.90, 6.53, 9.80, 19.60 |
| medium | 1.15, 1.37, 1.64, 2.00, 2.46, 3.07, 3.91, 5.08, 6.77, 9.31, 13.30, 19.95, 31.92, 55.86, 111.72, 279.30, 1117.20 |
| hard | 1.31, 1.77, 2.46, 3.48, 5.06, 7.59, 11.81, 19.18, 32.89, 60.29, 120.59, 271.32, 723.52, 2532.32, 15193.92 |
| expert | 1.96, 4.14, 9.31, 22.61, 60.29, 180.88, 633.08, 2743.35, 16460.08, 181060.88 |

For lane zero, draw `u=float()` and survive iff `u < 0.98/multiplier[0]`. For every later lane `n`, draw the next float and survive iff `u < multiplier[n-1]/multiplier[n]`. The server validates that every command uses the active round's unchanged wager and difficulty and targets exactly the next lane; client-declared progress never creates authority. A collision ends the round at zero. Cash-out credits the multiplier of the last cleared lane, and clearing the final lane auto-settles it. Thus the cumulative ideal return at every offered cash-out is `(0.98/multiplier[n])*multiplier[n] = 0.98`; the exact audit additionally accounts for each 48-bit threshold ceiling.

## Dragon Tower

The action that commits the layout is `start:<difficulty>`. For each of nine floors, create `[0..tiles-1]`, Fisher–Yates shuffle from the last index using `int(index+1)`, take the first `safeTiles`, and sort those column numbers ascending. Configurations are easy 3/4, medium 2/3, hard 1/2, expert 1/3, master 1/4.

The cash-out multipliers by cleared floor 1–9 are:

| Difficulty | Multipliers |
|---|---|
| easy | 1.29, 1.72, 2.30, 3.07, 4.09, 5.45, 7.27, 9.69, 12.92 |
| medium | 1.46, 2.18, 3.27, 4.91, 7.37, 11.05, 16.57, 24.86, 37.29 |
| hard | 1.94, 3.88, 7.76, 15.52, 31.04, 62.08, 124.16, 248.32, 496.64 |
| expert | 2.91, 8.73, 26.19, 78.57, 235.71, 707.13, 2121.39, 6364.17, 19092.51 |
| master | 3.88, 15.52, 62.08, 248.32, 993.28, 3973.12, 15892.48, 63569.92, 254279.68 |

Verification regenerates the complete hidden layout from the start action and validates every sequential pick, terminal phase, floor, and payout. Its economics are checked exactly rather than by Monte Carlo: at floor `n`, RTP is `(safeTiles/tiles)^n * paytable[n-1]`. All 45 values are within two-decimal rounding tolerance of 97%, with less than 0.5 percentage-point spread.

## Four cascade slots

The four games share the following published mechanism, but have separate strips, paytables, and calibration. To construct base strip `B`, find the largest published symbol weight and visit passes `p=0..maxWeight-1`; on each pass visit the weight entries in listed order and append a symbol when `p < weight`. A base strip of length `L` creates reel `c` by rotating left by `(c*stride) mod L`. Midnight, Midas, and Sands draw one stop `int(L)` for each column, then append `rows` consecutive wrapping strip entries. Poseidon instead draws `int(L)` independently for each of its 30 cells from that cell's fixed column strip; this permits the documented eight-symbol pay-anywhere threshold instead of limiting an initial symbol to one occurrence per column. Count every paying symbol anywhere. If its count has a positive paytable entry, all of its positions win. Remove the union of all winning positions, visit flat positions in ascending order, and for each removed position draw `int(L)` independently from that position's same fixed column strip. Repeat at most four winning stages. Base stops and refills therefore use the same fixed weights; no probability depends on the current board. Specials do not substitute.

The bonus is evaluated on the initial grid only. It triggers at the configured count and adds the shared raw table `{3:1,4:2,5:4,6:7,7:11,8:16}` (unlisted counts pay zero). The terminal multiplier is `Q2(min(20,rawWin*calibration))`; reported component values also use Q2. The first cascade supplies `winningPositions` and the first paying symbol in the configured ordering supplies `winningSymbol`.

| Game | Grid | stride | bonus / trigger | calibration |
|---|---:|---:|---|---:|
| Midnight Train Heist | 5×5 | 11 | `fs` / 3 | 1.1677079235994345 |
| Midas’ Feast | 6×6 | 7 | `midas` / 3 | 0.022332841081829487 |
| Sands of Sekhmet | 6×5 | 13 | `scatter` / 4 | 1.1127530911018986 |
| Poseidon’s Abyssal Crown | 6×5 | 17 | `scatter` / 4 | 0.7610840316013392 |

Midnight paytable, count 5–25: `.4,2,4,8,40,60,80,200,400,800,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000`.

Midas uses the Poseidon count table through 30 and its 1000 raw award through count 36. Per-symbol factors are grapes `.65`, amphora `.8`, coin `1`, laurel `1.25`, feast `1.6`, and wild `2.4`.

Sands paytable, count 6–30: `.65,2.6,6.5,16.25,39,78,162.5,325,650,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000`.

Poseidon paytable, count 8–30: `2.2,5.5,13.2,40,80,110,220,440,880,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000`.

Paying-symbol order is Midnight `[wheel,skull,hat,guns,badge,wild,vs,outlaw,A,K,Q,10]`; Midas `[grapes,amphora,coin,laurel,feast,wild]`; Sands `[lapis,emerald,carnelian,lotus,scarab,eye,lioness,regalia,cobra,wild,sun,moon]`; Poseidon `[blue,red,purple,green,yellow,ring,cup,hourglass,crown,multiplier]`.

The symbol weights, in strip-construction order, are:

```text
Midnight:
wheel:6 skull:4 hat:5 guns:4 badge:4 wild:3 fs:1 vs:4 outlaw:4 A:8 K:8 Q:7 10:7

Midas:
midas:1 grapes:8 amphora:8 coin:8 laurel:6 feast:5 wild:4

Sands:
lapis:7 emerald:7 carnelian:6 lotus:7 scarab:4 eye:4 lioness:4 regalia:4 cobra:4 wild:3 scatter:1 sun:5 moon:4

Poseidon:
blue:8 red:8 purple:8 green:8 yellow:8 ring:4 cup:4 hourglass:4 crown:4 scatter:1 multiplier:3
```

Every shared engine is capped at `20.00x` the charged wager after all simultaneous wins, cascades, immediate bonuses, and calibration have been accumulated.

## Witch Blood Megaways

Each paid or free spin first draws six reel heights as `2+int(6)`. It then fills the six main reels in column order and the four one-cell top positions over reels two through five. For every cell, draw `int(96)`; zero is scatter. Otherwise, on every reel except the first, draw `int(4096)`; zero is wild. Otherwise draw `pick(basePool)`, where the 21-entry pool has weights `rune:5, potion:4, lantern:3, spellbook:3, owl:2, cat:2, amulet:1, blood-moon:1`. The first reel cannot contain a wild. The top cell counts as one additional symbol on each middle reel, so the ways count is `h1*(h2+1)*(h3+1)*(h4+1)*(h5+1)*h6`.

Only six-reel ways pay. Wild substitutes for each of the eight regular symbols. For a symbol, multiply its match counts on all six reels, multiply that ways count by the six-reel paytable value below, and sum simultaneous symbol wins. The fixed `5.184` factor is part of the paytable; it never depends on state or history.

| Symbol | Published base value | Effective six-reel rate (`base*5.184`) |
|---|---:|---:|
| rune | .024 | .124416 |
| potion | .032 | .165888 |
| lantern | .040 | .207360 |
| spellbook | .056 | .290304 |
| owl | .072 | .373248 |
| cat | .096 | .497664 |
| amulet | .128 | .663552 |
| blood-moon | .176 | .912384 |

Initial scatters pay by total count: two `.1`, three `.5`, four `1`, five `2`, and six or more `5`. Three/four/five/six scatters award 10/15/20/30 free spins. Each ways win removes its regular contributing cells. Contributing wilds remain and gain one charge; a wild reaching charge three also explodes and is removed. Refills visit main reels in order, drawing one new cell per removed main cell, followed by removed top cells in order, with the same fixed cell distribution. For every exploded wild draw `1+int(3)`; then repeatedly draw `int(eligible.length)` without replacement to convert that many non-wild cells outside reel one to new zero-charge wilds. A spin stops after no win or five tumbles.

Free spins start with persistent feature multiplier one. After each winning tumble it advances by `1 + explosionBoost`, where one/two/three-or-more exploding wilds add `1/2/4`; that tumble uses the multiplier from before the advance. A free spin with three or more scatters retriggers three spins once per paid feature, capped at 30 scheduled spins. Base and free-spin awards accumulate under the exact 20x charged-wager cap, and the final public multiplier is quantized to two decimal places.

The 20x maximum is attainable, not merely a configured exposure value. Heights of seven and blood-moon in every eligible cell have positive probability, and that board's uncapped first-tumble award exceeds the cap. With the default $10,000 house payout cap, exposure permits at most a $500 charged wager.

## Gates of Olympus Super Scatter

Every grid has 30 row-major cells. For each cell draw `int(totalWeight)` and walk these cumulative weights in order: blue 130, green 125, yellow 120, purple 115, red 110, chalice 105, ring 100, hourglass 95, crown 90, scatter 25, super-scatter 1, multiplier 5. Free-spin grids omit super-scatter and reduce the total accordingly. A multiplier cell immediately draws a second weighted integer from total 10000: `2:5010, 3:2500, 4:1200, 5:600, 6:300, 8:150, 10:100, 12:50, 15:30, 20:20, 25:15, 50:10, 100:8, 250:5, 500:2`.

Count regular symbols anywhere. Counts 8–9, 10–11, and 12+ select paytable columns:

| Symbol | 8–9 | 10–11 | 12+ |
|---|---:|---:|---:|
| blue | .7775 | 2.3325 | 6.22 |
| green | 1.244 | 2.799 | 12.44 |
| yellow | 1.555 | 3.11 | 15.55 |
| purple | 2.488 | 3.732 | 24.88 |
| red | 3.11 | 4.665 | 31.1 |
| chalice | 4.665 | 6.22 | 37.32 |
| ring | 6.22 | 15.55 | 46.65 |
| hourglass | 7.775 | 31.1 | 77.75 |
| crown | 31.1 | 77.75 | 155.5 |

For up to eight tumbles, remove every winning regular and every multiplier orb, then refill removed positions in ascending flat-index order. Round each tumble sum and accumulated raw win to four decimals. Sum all landed orb values across the sequence; base win is `rawWin*(orbSum or 1)`, rounded to four decimals.

On the initial grid, regular plus super scatters trigger at four. Total-scatter awards are 4→3, 5→5, 6+→100. Super-scatter awards are 1→100, 2→500, 3→5000, 4+→50000, but are paid only when the combined trigger qualifies. A trigger awards 15 free spins. Each free grid uses the same tumble rules without super scatters; 3+ regular scatters add five spins, capped at 100. The free-spin persistent multiplier begins at 1 and adds every landed orb value before that spin is evaluated. Each free spin pays `rawWin*persistentMultiplier + scatterAward`. Sum base, scatter, super-scatter and bonus values as `rawTotal`, multiply by the fixed calibration, and cap the raw result at `20 * actionCost`. Settlement divides by the action cost and applies terminal Q2, so every mode is capped at 20x the amount charged.

## Odin’s Vault

Odin uses a 5×6 row-major grid and 28 left-to-right paylines. Its action costs are `spin:1`, `enhancer:bonus:3`, `enhancer:degen:25`, `enhancer:trickster:75`, `enhancer:fu:5000`, `buy:bonus:200`, `buy:super:1000`. Regular symbol weights are clubs 18, spades 17, diamonds 16, hearts 15, horn 9, axe 8, mask 7, horse 6, falcon 4.

Regular 3/4/5-of-kind paytable: clubs `.1/.2/.4`; spades `.1/.2/.5`; diamonds `.1/.2/.7`; hearts `.2/.5/1`; horn `1/2/3`; axe `1/2/4`; mask `1/2/5`; horse `2/3/10`; falcon `2.5/10/25`. Paylines, expressed as row per column, are:

```text
00000 11111 22222 33333 44444 55555 01210 54345 00100 55455 12321 43234 21012 34543
01110 54445 10101 45454 02420 53135 20202 35353 01234 54321 12345 43210 02320 53235
```

For a grid cell, compute `boost=actionBoost+tierBoost`, with action boosts `0,55,140,230,480,90,170` in the action order above and tier boost free/super/legendary/mythic = 45/90/135/180. Draw `r=int(10000)`. Sequential ranges have sizes `115+floor(.12b)` scatter, `559+floor(.8b)` coin, `90+floor(.12b)` eye, `34+floor(.06b)` key, `34+floor(.06b)` bard, `22+floor(.04b)` upgrader, `34+floor(.05b)` redrop, `16+floor(.1b)` collector, `2+floor(.025b)` super-collector; the remainder is `pick(regularWeightArray)`.

For a coin, first `int(100000000)`; zero is a 500000 max coin. Otherwise draw `t=int(1000000000)` and choose the first threshold exceeded by `t`: `max(900000000,979000000-30000b)`, `997000000-10000b`, `999700000-2000b`, `999990000-200b`, `999999990`, `1000000000`. These map to bronze `[1,2,3,4]`, silver `[5,10,15]`, gold `[25,50,100]`, sapphire `[150,200,250,500]`, ruby `[750,1000,2500,5000]`, diamond `[10000,25000,50000]`; then `pick` the tier's values.

Grid resolution order is exact: draw 30 cells; for buys, Fisher–Yates shuffle positions and force 3 (`buy:bonus`) or 4 (`buy:super`) scatters; if a forced upgrader is requested, install an upgrader and then a bronze coin if absent; if any redrop exists, scan cells 0–29 and replace every regular/mystery pay symbol with `pick(regularWeights)`; collect eye positions and, when needed, `pick` an eye target, then repeatedly pick and remove candidate indices to convert `max(1,2*eyeCount)` pay symbols to that mystery target; upgrade each non-max coin one tier and pick its new value; for keys pick global multiplier `[2,3,4,5,10]` then side `[red,white]`; for bards pick `[2,3,5,10,20]`.

Collectors count one and super-collectors two. The per-action calibration factors in action order are `1,2.0296953620360245,8.439683886898873,15.667952629090827,403,5.477282860062938,15.29579389447073`. Let `C=(0.97/0.967)*actionCalibration`. `coinMultiplier=round6(sumCoinValues*collectorActivations*bardMultiplier*globalMultiplier*C)`. Evaluate each payline from column zero until mismatch; mystery uses its resolved symbol. `lineMultiplier=round6(sumLinePays*globalMultiplier*C)`. These factors normalize each mode against its action cost rather than pretending a 200× bonus purchase costs one unit. Each grid and the final round are capped at `20 * actionCost` before the public result is divided by that cost.

Three scatters award free, four super, and five+ legendary unless all five cells on any horizontal line or paylines 7, 8, 23–26 are scatter, which awards mythic. A buy forces its named initial tier. Exactly ten bonus grids follow the base. Super and above persist the eye target. Mythic forces an upgrader on spin one. Any scatter in a bonus grid upgrades the tier one step for subsequent spins, capped at mythic. Sum base and ten spin totals with six-decimal internal rounding, cap at `20 * actionCost`, divide by the charged action cost, and apply terminal Q2.

## RTP verification tiers

The audit has three deliberately separate tiers:

1. The exact tier evaluates formulas or finite count-state recurrences. It performs no random sampling and reports no confidence interval. Most results must be within `0.00005` of their target, the maximum expected effect of four-decimal multiplier quantization. Baccarat uses its independently rounded published targets, Dragon uses its documented two-decimal ladder tolerance, and whole-number Plinko uses a `0.0035` tolerance for the unavoidable eight-row integer grid.
2. The sampled release tier is only for the engines whose measured sufficient state spaces remain too large. It uses at least 3,000,000 rounds for Gates, 2,000,000 for Midnight, Sands, and Poseidon, 1,000,000 for Witch Blood, and 500,000 for each Odin mode. It reports point RTP, standard error, a 95% confidence interval, maximum observed return, and slot-shape statistics, and exits non-zero when the target is outside the interval or another release invariant fails.
3. The deterministic CI sampler run by `pnpm test` uses affordable samples and wide five-standard-error envelopes only on those same hard engines. It catches gross breakage such as missing mechanics or zero-return rows. A green CI sample is not calibration evidence.

Thus exact arithmetic establishes calibration where available; otherwise only the high-N `pnpm audit:fairness` release tier does. The CI tier never establishes calibration.

### Exact-return arithmetic

All values below are returns per unit wager, after the published four-decimal award is used. These are the expressions evaluated by the audit, so they can be checked without reproducing a pseudorandom sample:

| Game / action | Exact expression | Return |
|---|---|---:|
| Moonbound, four hard pumps | `(C(21,5) / C(25,5)) * 2.56` | `0.9804901186` |
| RPS Ascent and Rock Paper Scissors | `(1/3)*1 + (1/3)*1.91` | `0.9700000000` |
| Chicken Cross, lane `n` | `multiplier[n] * product(i=0..n, ceil(chance[i]*2^48)/2^48)`, where `chance[0]=0.98/multiplier[0]` and later chances are `multiplier[i-1]/multiplier[i]` | `0.9800000000` (shown precision) |
| Tower | `(1/4) * 3.88` | `0.9700000000` |
| Moles | `(3/7) * 2.2633` | `0.9699857143` |
| Nullfield | `(20/25) * 1.2125` | `0.9700000000` |
| Dice, under 50 | `(5000/10000) * floor(9900*1000000/5000)/1000000` | `0.9900000000` |
| Plinko, legacy and all 36 configured tables | `sum(k=0..rows) C(rows,k)/2^rows * wholeNumberPaytable[risk][rows][k]` | rows 8: `0.9765625000`; rows 9–11: `0.9804687500`; rows 12–15: `0.9799804688`; row 16: `0.9800109863` |
| Prism Deck, higher | `sum(r=1..13) (1/13)*((4*(14-r)-1)/51)*quantize4(0.96*51/(4*(14-r)-1))` | `0.9600024133` |

For Limbo target `t`, `float()` has exactly `2^48` equiprobable values. The return is

```text
t * (2^48 - ceil(2^48 * (1 - 0.99/t))) / 2^48
```

which is `0.9900000000` to the shown precision at `t=2`, `99`, `100`, and `100000` (the exact values differ from 0.99 only by the finite 48-bit draw quantization).

For Keno with `p` picks and `m` matches, use the hypergeometric probability

```text
C(p,m) * C(80-p,20-m) / C(80,20)
```

and sum it times `quantize4(3.88*m/p)` for `m=0..p`. The ten exact rows range from `0.9699788946` to `0.9700188414`; each lies within one four-decimal quantization unit of 0.97.

Exhaustive eight-deck Baccarat value enumeration gives `P(player)=0.44624660934317073`, `P(banker)=0.4585974226322891`, and `P(tie)=0.09515596802363396`. Therefore Player return is `2P(player)+P(tie)=0.987649186709975`, Banker is `1.95P(banker)+P(tie)=0.989420942156598`, and Tie is `9P(tie)=0.856403712212706`.

Dragon Tower uses `(safeTiles/tiles)^floor * paytable[difficulty][floor-1]` for each of its 45 difficulty/floor pairs. The exact range is `0.9675..0.973333333333333`; this is the explicitly documented cents-rounded ladder rather than sampling error.

### Why the slot engines are not in the exact tier

No slot RTP is currently published as exact. In particular, the former Midas entry multiplied a 200,000-round sampled raw mean by the production calibration and was not a proof. It has been removed from `exactRtpResults()`.

For the four shared engines, a payout-preserving state can use global symbol counts after the exact initial reel-window distribution is convolved by column. Gravity does not require positional state because every rotated reel has the same refill histogram and pay-anywhere awards depend only on counts. An exact solver must still carry the distribution of accumulated raw awards through terminal two-decimal settlement; a recursion that retains only the expected raw award is insufficient.

The four shared engines award their scatter or bonus paytable value immediately. They do not award or generate free-spin boards, and those bonus symbols do not add later RNG draws.

The exact attempt first convolves contiguous-window distributions by column, then uses global count vectors. It also quotients symbols that have identical refill weight and paytable behavior. A full-removal state is genuinely reachable in every authored slot: Midnight can have five each of wheel/skull/hat/guns/badge, Sands six each of lapis/emerald/carnelian/lotus/scarab, and Poseidon six each of blue/red/purple/green/yellow. Therefore the next independent refill has the full support shown below. The canonical-state count is the coefficient of `x^cells` in `product_groups product_(j=1..groupSize) (1-x^j)^-1`.

| Sampled game | Reachable initial count states | Canonical states after one reachable full refill | Exact-attempt finding |
|---|---:|---:|---|
| Midnight Train Heist | 460,149 | 25,424,649 | One node of a four-stage recursion already fans into this support. |
| Midas' Feast | 2,961 | 13,992 | Symmetry reduces a direct refill from 54,264 states, but a pre-Q2 mean recursion still evaluates 394,232,914 transitions; exact Q2 additionally requires the accumulated-award distribution. |
| Sands of Sekhmet | 1,050,219 | 28,148,688 | One node of a four-stage recursion already fans into this support. |
| Poseidon's Abyssal Crown | 89,999 | 1,943,584 | The smallest remaining slot still expands to this support per stage; transition convolution must then be repeated through four stages. |
| Witch Blood Megaways | 13,212,791,084,461,898,837,587,724,550 | larger still | Initial support after preserving top/main identity and quotienting the four exchangeable middle reels; continuation adds wild state, tumbles, and free spins. |

For Gates, the sufficient state is already compressed to nine regular-symbol counts, regular/super-scatter counts, orb count, and orb-value sum. If `S_o` is the reachable set of sums of exactly `o` orb values, the base-grid support is

```text
sum_(r=0..30) sum_(o=0..30-r) C(r+8,8) * (31-r-o) * |S_o|
= 1,633,959,836,296 states
```

Removing the super-scatter dimension still leaves `505,933,187,648` free-grid states. Eight tumble stages, spins remaining up to 30, accumulated multiplier, and retriggers only enlarge that Markov chain, so the absorbing-chain solve cannot be traversed in release tooling.

For Witch Blood, a continuation-sufficient initial column state must preserve the separate top cell on reels two through five. Reel one has 11,430 reachable height/count states, each middle reel has 194,370, and reel six has 19,437. Treating the four identically distributed middle reels as a multiset gives

```text
11430 * C(194370+3,4) * 19437
= 13,212,791,084,461,898,837,587,724,550 states
```

This is before wild charges, spawned flags, five refill/explosion stages, persistent free-spin multipliers, retriggers, or the absorbing chain over up to 30 spins. Witch Blood therefore remains in the sampled release tier.

Odin cannot use a count vector because its 28 paylines make positions significant. Even before coins, collectors, upgrades, tiers, forced features, or ten bonus grids, its nine positive-weight regular symbols give at least `9^30 = 42,391,158,275,216,203,514,294,433,201` reachable ordered grids. It therefore remains sampled as well.

## Verification and exports

History rows contain game ID, the client seed actually used, nonce, original action, optional Dragon fairness action, complete outcome, multiplier, wager, payout, commitment, and—only after rotation—the revealed server seed. Live-session rows deliberately cannot verify yet.

For a revealed row:

1. Hash the UTF-8 revealed seed and compare its lowercase hex digest to `serverSeedHash`.
2. Normalize the action, regenerate the byte stream, and run the named engine in the draw order above.
3. Compare the outcome as recursively key-sorted JSON, quantize the computed settlement multiplier to two places for the seven slots (four places otherwise) and compare it exactly, then independently recompute the cent-rounded payout from the recorded charged wager and settlement multiplier.

The repository CLI performs those checks offline:

```sh
node verifier/verify-fairness.mjs fairness-history.json
```

It has no network or npm runtime dependency, but it imports this checkout's published engine source. For a truly independent check, reimplement this document and validate it against every entry in `packages/fairness-core/vectors/fairness-golden-v1.json`.
