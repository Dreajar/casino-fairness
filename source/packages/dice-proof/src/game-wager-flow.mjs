import { parseUsdAtoms } from "./usd.mjs";
import { VerifiedGameClient } from "./game-client.mjs";
import { canonicalJson, sha256Hex } from "./index.mjs";

/** Same origin Web Locks plus deterministic recovery keys serialize retries
 * across tabs. Release pins are supplied by the compiled app, never the API. */
export class GameWagerFlow {
  constructor({ releases, activeReleaseId, rootCertPem, store, requestJson, locks = globalThis.navigator?.locks, allowMockForTests = false }) {
    this.releases = releases; this.activeReleaseId = activeReleaseId;
    this.rootCertPem = rootCertPem; this.store = store; this.requestJson = requestJson;
    this.locks = locks; this.allowMockForTests = allowMockForTests;
  }
  async play(sessionId, context, input) {
    if (!this.locks) throw new Error("This browser cannot safely recover wagers across tabs");
    if (typeof input.requestId !== "string" || !input.requestId || input.requestId.length > 128) throw new Error("Invalid wager request ID");
    const minor = parseUsdAtoms(input.wager);
    if (minor <= 0n) throw new Error("Wager must be positive");
    const hash = await sha256Hex(canonicalJson(["casino-browser-round-v1", context.playerRef, sessionId, input.requestId]));
    const roundId = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
    const identity = { roundId, playerRef: context.playerRef, clubRef: context.clubRef,
      gameId: context.gameId, action: input.action, wagerMinor: minor.toString() };
    return this.locks.request(`casino-wager:${roundId}`, async () => {
      const saved = await this.store.load(roundId);
      const releaseId = saved?.ticket?.binding?.releaseId ?? this.activeReleaseId;
      const policy = this.releases.find(release => release.releaseId === releaseId);
      if (!policy) throw new Error("This wager's verified game release is unavailable. Refresh before starting a new wager.");
      const client = new VerifiedGameClient({ policy, rootCertPem: this.rootCertPem, allowMockForTests: this.allowMockForTests,
        requestTicket: request => this.requestJson(`/api/fairness/sessions/${sessionId}/nitro-ticket`, request),
        savePrepared: prepared => this.store.save(prepared),
        submitWager: prepared => this.requestJson(`/api/fairness/sessions/${sessionId}/nitro-play`, prepared) });
      if (saved) {
        for (const [key, value] of Object.entries(identity)) if (saved.request[key] !== value) throw new Error("Retry differs from the original wager");
        if (saved.play.requestId !== input.requestId) throw new Error("Retry request ID mismatch");
      }
      const prepared = saved ? await client.restore(saved) : await client.prepare(identity, input.requestId);
      const response = await client.play(prepared);
      if (!response.settlement || response.settlement.sessionId !== sessionId) throw new Error("Missing or mismatched verified settlement");
      return response.settlement;
    });
  }
}
