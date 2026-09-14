export const PACK_RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "stake"] as const;

export type PackRarity = (typeof PACK_RARITIES)[number];

export interface PackCardDefinition {
  readonly id: string;
  readonly collectionNumber: number;
  readonly name: string;
  readonly rarity: PackRarity;
  readonly multiplier: number;
  readonly glyph: string;
  readonly hue: number;
  readonly artVariant: number;
}

export interface PackCardResult extends PackCardDefinition {
  readonly revealPosition: number;
  readonly presentation: Readonly<{
    accent: string;
    foil: boolean;
    glow: "soft" | "bright" | "radiant";
    tilt: number;
  }>;
}

export interface PackOutcome {
  readonly kind: "packs";
  readonly mathVersion?: "packs-house-edge-v2";
  readonly collectionSize: 240;
  readonly cardsPerPack: 5;
  readonly cards: readonly PackCardResult[];
  readonly summedMultiplier: number;
  readonly presentation: Readonly<{
    sequence: "five-card-pack";
    presentationMs: number;
    rarityOrder: readonly PackRarity[];
  }>;
}

export interface PacksRandomSource {
  int(maxExclusive: number): number;
}

type RarityBlueprint = Readonly<{
  adjectives: readonly string[];
  nouns: readonly string[];
  multipliers: readonly number[];
}>;

const rarityBlueprints: Readonly<Record<PackRarity, RarityBlueprint>> = {
  common: {
    adjectives: ["Copper", "Moss", "Cloud", "Pebble", "Dawn", "Harbor", "Quiet", "Paper", "Lunar", "Pocket"],
    nouns: ["Finch", "Compass", "Lantern", "Acorn", "Kite", "Cove", "Key", "Sprout", "Button", "Glider"],
    multipliers: [0.01, 0.02, 0.03, 0.04]
  },
  uncommon: {
    adjectives: ["Verdant", "Cobalt", "Amber", "Silver", "Saffron", "Electric", "Nova", "Glass", "Mint", "Coral"],
    nouns: ["Mantis", "Wayfinder", "Orchid", "Tern", "Relic", "Grove"],
    multipliers: [0.1, 0.2, 0.3, 0.4, 0.6, 0.8]
  },
  rare: {
    adjectives: [
      "Azure",
      "Runic",
      "Frosted",
      "Solar",
      "Velvet",
      "Aerial",
      "Neon",
      "Tidal",
      "Orbit",
      "Stellar",
      "Midnight"
    ],
    nouns: ["Voyager", "Chimera", "Comet", "Oracle", "Monument"],
    multipliers: [1, 2, 3, 5, 8, 10, 15]
  },
  epic: {
    adjectives: ["Violet", "Astral", "Tempest", "Prismatic", "Eclipse"],
    nouns: ["Sentinel", "Phoenix", "Labyrinth"],
    multipliers: [50, 75, 100, 150]
  },
  legendary: {
    adjectives: [
      "Golden",
      "Celestial",
      "Infinite",
      "Crimson",
      "Sovereign",
      "Radiant",
      "Imperial",
      "Eternal",
      "Starborn"
    ],
    nouns: ["Crown"],
    multipliers: [500, 600, 700, 800, 1_000]
  },
  stake: {
    adjectives: ["Prismatic"],
    nouns: ["Singularity"],
    multipliers: [10_000]
  }
};

export const PACK_RARITY_CARD_COUNTS: Readonly<Record<PackRarity, number>> = {
  common: 100,
  uncommon: 60,
  rare: 55,
  epic: 15,
  legendary: 9,
  stake: 1
};

const rarityNumberStarts: Readonly<Record<PackRarity, number>> = {
  stake: 1,
  legendary: 2,
  epic: 11,
  rare: 26,
  uncommon: 81,
  common: 141
};

const rarityHues: Readonly<Record<PackRarity, number>> = {
  common: 188,
  uncommon: 213,
  rare: 344,
  epic: 133,
  legendary: 176,
  stake: 42
};

const glyphs = ["✦", "◆", "⬡", "✧", "◈", "❖", "✺", "✤", "⌁", "⟡"] as const;

function buildCards(): readonly PackCardDefinition[] {
  return PACK_RARITIES.flatMap((rarity, rarityIndex) => {
    const blueprint = rarityBlueprints[rarity];
    return blueprint.adjectives.flatMap((adjective, adjectiveIndex) =>
      blueprint.nouns.map((noun, nounIndex) => {
        const withinTier = adjectiveIndex * blueprint.nouns.length + nounIndex;
        return {
          id: `${rarity}-${String(withinTier + 1).padStart(3, "0")}`,
          collectionNumber: rarityNumberStarts[rarity] + withinTier,
          name: `${adjective} ${noun}`,
          rarity,
          multiplier: blueprint.multipliers[(withinTier * 5 + rarityIndex) % blueprint.multipliers.length] ?? 0.01,
          glyph: glyphs[(withinTier + rarityIndex * 2) % glyphs.length] ?? "✦",
          hue: (rarityHues[rarity] + withinTier * 7) % 360,
          artVariant: withinTier % 8
        } satisfies PackCardDefinition;
      })
    );
  });
}

export const PACK_CARDS = buildCards();
export const PACKS_MAX_MULTIPLIER = 50_000;

// Historical draws must remain independently replayable.
const LEGACY_PACK_RARITY_WEIGHTS: Readonly<Record<PackRarity, number>> = {
  common: 8_300_000,
  uncommon: 1_500_000,
  rare: 195_000,
  epic: 4_500,
  legendary: 499,
  stake: 1
};

// Exact expectation of the actual 240-card inventory: 97.13363636...%.
// Five independent rarity/card draws, integer rejection sampling, unchanged
// card payouts. The previous weights returned 147.80681818...%.
export const PACK_RARITY_WEIGHTS: Readonly<Record<PackRarity, number>> = Object.freeze({
  common: 8_800_000,
  uncommon: 1_050_000,
  rare: 148_000,
  epic: 1_800,
  legendary: 199,
  stake: 1
});

export const PACKS_PRESENTATION_MS = 1_883;

export function roundPackMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}

export function packCardsForRarity(rarity: PackRarity): readonly PackCardDefinition[] {
  return PACK_CARDS.filter((card) => card.rarity === rarity);
}

function pickRarity(random: PacksRandomSource, weights: Readonly<Record<PackRarity, number>>): PackRarity {
  const total = PACK_RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
  let cursor = random.int(total);
  for (const rarity of PACK_RARITIES) {
    const weight = weights[rarity];
    if (cursor < weight) return rarity;
    cursor -= weight;
  }
  return "common";
}

export function resolvePacks(
  random: PacksRandomSource,
  mathVersion: "legacy" | "packs-house-edge-v2" = "packs-house-edge-v2"
): Readonly<{ multiplier: number; outcome: PackOutcome }> {
  const weights = mathVersion === "legacy" ? LEGACY_PACK_RARITY_WEIGHTS : PACK_RARITY_WEIGHTS;
  const cards = Array.from({ length: 5 }, (_, index): PackCardResult => {
    const rarity = pickRarity(random, weights);
    const candidates = packCardsForRarity(rarity);
    const card = candidates[random.int(candidates.length)];
    if (!card) throw new Error("Packs card selection failed");
    const rarityIndex = PACK_RARITIES.indexOf(rarity);
    return {
      ...card,
      revealPosition: index + 1,
      presentation: {
        accent: `hsl(${card.hue} 82% ${rarityIndex >= 4 ? 62 : 54}%)`,
        foil: rarityIndex >= 3,
        glow: rarityIndex >= 5 ? "radiant" : rarityIndex >= 3 ? "bright" : "soft",
        tilt: random.int(11) - 5
      }
    };
  });
  const summedMultiplier = roundPackMultiplier(cards.reduce((sum, card) => sum + card.multiplier, 0));
  return {
    multiplier: summedMultiplier,
    outcome: {
      kind: "packs",
      ...(mathVersion === "legacy" ? {} : { mathVersion: "packs-house-edge-v2" as const }),
      collectionSize: 240,
      cardsPerPack: 5,
      cards,
      summedMultiplier,
      presentation: {
        sequence: "five-card-pack",
        presentationMs: PACKS_PRESENTATION_MS,
        rarityOrder: PACK_RARITIES
      }
    }
  };
}
