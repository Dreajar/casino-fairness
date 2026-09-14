export const RAINBET_PLINKO_RISKS = Object.freeze(["low", "medium", "high", "rain"]);

export const PLINKO_TARGET_RTP_BPS = 9_900;
export const PLINKO_TARGET_RTP = PLINKO_TARGET_RTP_BPS / 10_000;
export const PLINKO_RTP_TOLERANCE = 0.002;

/**
 * Exact values captured from the first-party reference. This is the sole table
 * used by both browser presentation and authoritative settlement.
 */
export const RAINBET_PLINKO_PAYTABLES = Object.freeze({
  low: Object.freeze({
    8: Object.freeze([5.6,2.1,1.1,1,0.5,1,1.1,2.1,5.6]),
    9: Object.freeze([5.6,2,1.6,1,0.7,0.7,1,1.6,2,5.6]),
    10: Object.freeze([8.9,3,1.4,1.1,1,0.5,1,1.1,1.4,3,8.9]),
    11: Object.freeze([8.4,3,1.9,1.3,1,0.7,0.7,1,1.3,1.9,3,8.4]),
    12: Object.freeze([10,3,1.6,1.4,1.1,1,0.5,1,1.1,1.4,1.6,3,10]),
    13: Object.freeze([8.1,4,3,1.9,1.2,0.9,0.7,0.7,0.9,1.2,1.9,3,4,8.1]),
    14: Object.freeze([7.1,4,1.9,1.4,1.3,1.1,1,0.5,1,1.1,1.3,1.4,1.9,4,7.1]),
    15: Object.freeze([15,8,3,2,1.5,1.1,1,0.7,0.7,1,1.1,1.5,2,3,8,15]),
    16: Object.freeze([16,9,2,1.4,1.4,1.2,1.1,1,0.5,1,1.1,1.2,1.4,1.4,2,9,16])
  }),
  medium: Object.freeze({
    8: Object.freeze([13,3,1.3,0.7,0.4,0.7,1.3,3,13]),
    9: Object.freeze([18,4,1.7,0.9,0.5,0.5,0.9,1.7,4,18]),
    10: Object.freeze([22,5,2,1.4,0.6,0.4,0.6,1.4,2,5,22]),
    11: Object.freeze([24,6,3,1.8,0.7,0.5,0.5,0.7,1.8,3,6,24]),
    12: Object.freeze([33,11,4,2,1.1,0.6,0.3,0.6,1.1,2,4,11,33]),
    13: Object.freeze([43,13,6,3,1.3,0.7,0.4,0.4,0.7,1.3,3,6,13,43]),
    14: Object.freeze([58,15,7,4,1.9,1,0.5,0.2,0.5,1,1.9,4,7,15,58]),
    15: Object.freeze([88,18,11,5,3,1.3,0.5,0.3,0.3,0.5,1.3,3,5,11,18,88]),
    16: Object.freeze([110,41,10,5,3,1.5,1,0.5,0.3,0.5,1,1.5,3,5,10,41,110])
  }),
  high: Object.freeze({
    8: Object.freeze([29,4,1.5,0.3,0.2,0.3,1.5,4,29]),
    9: Object.freeze([43,7,2,0.6,0.2,0.2,0.6,2,7,43]),
    10: Object.freeze([76,10,3,0.9,0.3,0.2,0.3,0.9,3,10,76]),
    11: Object.freeze([120,14,5.2,1.4,0.4,0.2,0.2,0.4,1.4,5.2,14,120]),
    12: Object.freeze([170,24,8.1,2,0.7,0.2,0.2,0.2,0.7,2,8.1,24,170]),
    13: Object.freeze([260,37,11,4,1,0.2,0.2,0.2,0.2,1,4,11,37,260]),
    14: Object.freeze([420,56,18,5,1.9,0.3,0.2,0.2,0.2,0.3,1.9,5,18,56,420]),
    15: Object.freeze([620,83,27,8,3,0.5,0.2,0.2,0.2,0.2,0.5,3,8,27,83,620]),
    16: Object.freeze([1000,130,26,9,4,2,0.2,0.2,0.2,0.2,0.2,2,4,9,26,130,1000])
  }),
  rain: Object.freeze({
    8: Object.freeze([22,2,0.9,0.4,0.2,0.4,0.9,2,22]),
    9: Object.freeze([30,2,2.2,0.7,0.2,0.2,0.7,2.2,2,30]),
    10: Object.freeze([45,2,3.1,1.2,0.4,0.2,0.4,1.2,3.1,2,45]),
    11: Object.freeze([65,10,2,1.4,0.5,0.2,0.2,0.5,1.4,2,10,65]),
    12: Object.freeze([100,15,2,3.1,0.6,0.3,0.2,0.3,0.6,3.1,2,15,100]),
    13: Object.freeze([175,25,4,2,1,0.3,0.2,0.2,0.3,1,2,4,25,175]),
    14: Object.freeze([250,35,11,2,1.8,0.5,0.3,0.2,0.3,0.5,1.8,2,11,35,250]),
    15: Object.freeze([400,40,17,2,2.3,1.3,0.4,0.2,0.2,0.4,1.3,2.3,2,17,40,400]),
    16: Object.freeze([500,42,22,4,2,2,0.3,0.2,0.2,0.2,0.3,2,2,4,22,42,500])
  })
});

// Kept as an explicit evidence export for independent fixture assertions.
export const RAINBET_PLINKO_REFERENCE_PAYTABLES = RAINBET_PLINKO_PAYTABLES;
