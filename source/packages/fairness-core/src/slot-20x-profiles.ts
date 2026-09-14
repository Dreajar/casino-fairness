/** Fixed per-action profiles; evidence/slots-20x/results.json SHA-256: 4f08619c7abb0362b24719bb3d7f5f89bbbe7061b66171ac2855cfee8fba94bb. */
export const SLOT_20X_PROFILES: Readonly<
  Record<
    string,
    Readonly<Record<string, { readonly factor: number; readonly cost: number; readonly preserveV2?: boolean }>>
  >
> = {
  "american-aurora": {
    spin: {
      factor: 1.0882352941176472,
      cost: 1
    }
  },
  "fist-of-destruction": {
    spin: {
      factor: 0.048583333333333326,
      cost: 1
    }
  },
  "fruit-party": {
    spin: {
      factor: 1.1357142857142855,
      cost: 1
    }
  },
  "gates-of-olympus-super-scatter": {
    spin: {
      factor: 5.682545336788,
      cost: 1,
      preserveV2: true
    },
    "ante-spin": {
      factor: 2.127939429716,
      cost: 1.5,
      preserveV2: true
    },
    "buy-free-spins": {
      factor: 1.492556019899,
      cost: 100,
      preserveV2: true
    },
    "buy-super-free-spins": {
      factor: 2.704331864634,
      cost: 500,
      preserveV2: true
    }
  },
  "midas-feast": {
    spin: {
      factor: 0.9986301933361,
      cost: 1,
      preserveV2: true
    }
  },
  "midnight-train-heist": {
    spin: {
      factor: 1.050323744198,
      cost: 1,
      preserveV2: true
    }
  },
  "neon-syndicate": {
    spin: {
      factor: 0.047499999999999994,
      cost: 1
    },
    "boost:rival": {
      factor: 0.0051571428571428575,
      cost: 3
    },
    "boost:duo": {
      factor: 0.02582048346078,
      cost: 25,
      preserveV2: true
    },
    "boost:triple": {
      factor: 0.02450132549062,
      cost: 75,
      preserveV2: true
    },
    "buy:signal": {
      factor: 0.02284858790989,
      cost: 80,
      preserveV2: true
    },
    "buy:cleave": {
      factor: 0.01730010233745,
      cost: 150,
      preserveV2: true
    },
    "buy:last": {
      factor: 0.04002113139888,
      cost: 500,
      preserveV2: true
    },
    "buy:trial-signal": {
      factor: 0.03443334864134,
      cost: 240,
      preserveV2: true
    },
    "buy:trial-cleave": {
      factor: 0.03344966666332,
      cost: 450,
      preserveV2: true
    },
    "buy:trial-last": {
      factor: 0.09849966666667,
      cost: 1500,
      preserveV2: true
    }
  },
  "odins-vault": {
    spin: {
      factor: 2.40121193309,
      cost: 1,
      preserveV2: true
    },
    "enhancer:bonus": {
      factor: 2.413038056949,
      cost: 3,
      preserveV2: true
    },
    "enhancer:degen": {
      factor: 2.566808887041,
      cost: 25,
      preserveV2: true
    },
    "enhancer:trickster": {
      factor: 2.370341505429,
      cost: 75,
      preserveV2: true
    },
    "enhancer:fu": {
      factor: 1.623083080609,
      cost: 5000,
      preserveV2: true
    },
    "buy:bonus": {
      factor: 1.215246197479,
      cost: 200,
      preserveV2: true
    },
    "buy:super": {
      factor: 1.200953519133,
      cost: 1000,
      preserveV2: true
    }
  },
  "poseidons-abyssal-crown": {
    spin: {
      factor: 1.187280393416,
      cost: 1,
      preserveV2: true
    }
  },
  "rip-city": {
    spin: {
      factor: 0.3194444444444444,
      cost: 1
    },
    "spin:force-cat": {
      factor: 0.0006632251188759,
      cost: 1,
      preserveV2: true
    },
    "spin:force-mouse": {
      factor: 0.001310624931726,
      cost: 1,
      preserveV2: true
    }
  },
  "sands-of-sekhmet": {
    spin: {
      factor: 1.09088890683,
      cost: 1,
      preserveV2: true
    }
  },
  sixsixsix: {
    spin: {
      factor: 5.813014517129,
      cost: 1,
      preserveV2: true
    }
  },
  "sweet-bonanza-2500": {
    spin: {
      factor: 5.78421052631579,
      cost: 1
    },
    feature: {
      factor: 0.024541284403669723,
      cost: 1
    },
    "spin:feature": {
      factor: 0.024541284403669723,
      cost: 1
    }
  },
  "wanted-dead-or-wild": {
    spin: {
      factor: 0.0030454545454545456,
      cost: 1
    },
    "feature:train": {
      factor: 0.13456178551986933,
      cost: 80
    },
    "feature:duel": {
      factor: 0.01575960000158,
      cost: 200,
      preserveV2: true
    },
    "feature:dead": {
      factor: 0.06671959999333,
      cost: 400,
      preserveV2: true
    }
  },
  "witch-blood-megaways": {
    spin: {
      factor: 1.181287852286,
      cost: 1,
      preserveV2: true
    }
  },
  "xmas-drop": {
    spin: {
      factor: 0.22518610421836227,
      cost: 1
    },
    "spin:bonus-hunt": {
      factor: 0.22518610421836227,
      cost: 1
    },
    "spin:two-santas": {
      factor: 0.041319882303488854,
      cost: 1
    },
    "spin:three-santas": {
      factor: 0.013564939847778047,
      cost: 1
    },
    "spin:force-night": {
      factor: 0.0006606853732622,
      cost: 1,
      preserveV2: true
    },
    "spin:force-town": {
      factor: 0.001244570749729,
      cost: 1,
      preserveV2: true
    }
  }
};
