import { formatUsdAtoms, parseUsdAtoms } from "./usd.mjs";
import { canonicalJson, sha256Hex, bytesToBase64 } from "./index.mjs";
import { verifyProgressiveTicket, verifyProgressiveTranscript } from "./progressive-attestation.mjs";
import { progressiveActionWagerMinor } from "./progressive-command.mjs";

const orderedJson = value => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child)
  ? Object.fromEntries(Object.entries(child).sort(([a],[b])=>a.localeCompare(b))) : child);
const decimal = formatUsdAtoms;
function wagerMinor(value) {
  const amount = parseUsdAtoms(value);
  if(amount<=0n) throw Error("Wager must be positive");
  return String(amount);
}

/** Every prepared ticket and command is an immutable IndexedDB record. The
 * server owns the ordered action journal; the browser verifies its complete
 * signed prefix before selecting a move or displaying the next outcome. */
export class ProgressiveWagerFlow {
  constructor({releases,activeReleaseId,rootCertPem,store,requestJson,locks=globalThis.navigator?.locks,allowMockForTests=false}) {
    Object.assign(this,{releases,activeReleaseId,rootCertPem,store,requestJson,locks,allowMockForTests});
  }
  #policy(releaseId) {
    const policy=this.releases.find(release=>release.releaseId===releaseId);
    if(!policy || (policy.mode!=="aws"&&!this.allowMockForTests)) throw Error("This interactive game's verified release is unavailable");
    return policy;
  }
  async #verifyPrepared(prepared,context) {
    const {request,ticket,clientSeed}=prepared;
    for(const field of ["playerRef","clubRef","gameId"]) if(request[field]!==context[field]) throw Error("Progressive recovery ownership mismatch");
    if(!/^[a-f0-9]{64}$/.test(clientSeed)) throw Error("Invalid saved progressive entropy");
    const checked=await verifyProgressiveTicket({ticket,expectedRequest:request,challengeB64:request.challengeB64,
      policy:this.#policy(ticket.binding.releaseId),rootCertPem:this.rootCertPem,allowMock:this.allowMockForTests,now:Number(ticket.binding.issuedAt)});
    if(!checked.ok) throw Error(`Progressive ticket rejected: ${checked.reason}`);
  }
  async #history(prepared,state) {
    if(state.roundId!==prepared.request.roundId || canonicalJson(state.ticket.binding)!==canonicalJson(prepared.ticket.binding)) throw Error("Progressive recovery ticket changed");
    if(!Array.isArray(state.history)) throw Error("Missing progressive history");
    if(state.history.length) {
      if(state.history[0].command.clientSeed!==prepared.clientSeed) throw Error("Progressive player entropy changed");
      const checked=await verifyProgressiveTranscript({ticket:prepared.ticket,commands:state.history.map(h=>h.command),results:state.history.map(h=>h.result),policy:this.#policy(prepared.ticket.binding.releaseId)});
      if(!checked.ok) throw Error(`Progressive history rejected: ${checked.reason}`);
    }
    return state.history;
  }
  #state(sessionId,roundId) { return this.requestJson(`/api/fairness/sessions/${sessionId}/nitro-progressive/${roundId}`); }

  async #restoreFromServer(sessionId,context,roundId) {
    const state=await this.#state(sessionId,roundId);
    let prepared=await this.store.load(roundId);
    if(!prepared) {
      const {challengeB64,...ticket}=state.ticket;
      const b=ticket.binding;
      const request={roundId,playerRef:b.playerRef,clubRef:b.clubRef,gameId:b.gameId,wagerMinor:b.wagerMinor,action:b.action,challengeB64};
      const clientSeed=state.history?.[0]?.command.clientSeed ?? state.pendingCommand?.clientSeed;
      prepared={request,ticket,clientSeed};
      await this.#verifyPrepared(prepared,context);
      await this.#history(prepared,state);
      await this.store.save(prepared);
    } else { await this.#verifyPrepared(prepared,context); await this.#history(prepared,state); }
    return {prepared,state};
  }

  async play(sessionId,context,input) {
    if(!this.locks) throw Error("This browser cannot safely recover wagers across tabs");
    if(typeof input.requestId!=="string"||!input.requestId||input.requestId.length>128) throw Error("Invalid game action request ID");
    return this.locks.request(`casino-progressive-session:${context.playerRef}:${sessionId}`,async()=>{
      const key=`progressive-command:${context.playerRef}:${sessionId}:${input.requestId}`;
      const identity={playerRef:context.playerRef,clubRef:context.clubRef,gameId:context.gameId,wager:input.wager,action:input.action};
      let saved=await this.store.load(key),prepared;
      if(saved) {
        if(orderedJson(saved.identity)!==orderedJson(identity)) throw Error("Retry differs from the accepted progressive command");
        prepared=await this.store.load(saved.roundId);
        if(!prepared) throw Error("Missing original progressive ticket; restore the round before retrying");
      } else {
        let command;
        if(context.activeRoundId) {
          const restored=await this.#restoreFromServer(sessionId,context,context.activeRoundId);
          prepared=restored.prepared;
          const history=restored.state.history;
          if(restored.state.pendingCommand) throw Error("The previous action is still pending recovery");
          if(!history.length) throw Error("The opening action is still pending recovery");
          const last=history.at(-1).result;
          command={ticketId:prepared.ticket.binding.ticketId,requestId:input.requestId,clientSeed:prepared.clientSeed,sequence:history.length,
            action:input.action,previousReceiptHash:last.receiptHash};
          progressiveActionWagerMinor(JSON.parse(last.receipt.outcomeJson),{roundId:prepared.request.roundId,...command});
        } else {
          const hash=await sha256Hex(canonicalJson(["casino-progressive-browser-round-v1",context.playerRef,sessionId,input.requestId]));
          const roundId=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
          prepared=await this.store.load(roundId);
          if(!prepared) {
            const request={roundId,playerRef:context.playerRef,clubRef:context.clubRef,gameId:context.gameId,action:input.action,
              wagerMinor:wagerMinor(input.wager),challengeB64:bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))};
            const ticket=await this.requestJson(`/api/fairness/sessions/${sessionId}/nitro-ticket`,request);
            const checked=await verifyProgressiveTicket({ticket,expectedRequest:request,challengeB64:request.challengeB64,
              policy:this.#policy(this.activeReleaseId),rootCertPem:this.rootCertPem,allowMock:this.allowMockForTests});
            if(!checked.ok) throw Error(`Progressive ticket rejected: ${checked.reason}`);
            const clientSeed=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,"0")).join("");
            prepared={request,ticket,clientSeed};
            await this.store.save(prepared);
          }
          if(prepared.request.action!==input.action||prepared.request.wagerMinor!==wagerMinor(input.wager)) throw Error("Opening retry changed its wager");
          command={ticketId:prepared.ticket.binding.ticketId,requestId:input.requestId,clientSeed:prepared.clientSeed,sequence:0,
            action:prepared.request.action,previousReceiptHash:await sha256Hex(canonicalJson(prepared.ticket.binding))};
        }
        saved={request:{roundId:key},identity,roundId:prepared.request.roundId,command};
        await this.store.save(saved);
      }
      await this.#verifyPrepared(prepared,context);
      const command=saved.command;
      const response=await this.requestJson(`/api/fairness/sessions/${sessionId}/nitro-progressive-${command.sequence===0?"open":"advance"}`,
        command.sequence===0?{request:prepared.request,ticket:prepared.ticket,command}:{roundId:prepared.request.roundId,command});
      const state=await this.#state(sessionId,prepared.request.roundId);
      const history=await this.#history(prepared,state);
      const accepted=history[command.sequence];
      if(!accepted || canonicalJson(accepted.command)!==canonicalJson(command) || orderedJson(accepted.result)!==orderedJson(response.result))
        throw Error("Returned action differs from the verified progressive journal");
      return this.#settlement(sessionId,prepared,command,response);
    });
  }

  #settlement(sessionId,prepared,command,response) {
    const receipt=response.result.receipt, view=JSON.parse(receipt.outcomeJson), binding=prepared.ticket.binding;
    if(response.roundId!==binding.roundId||response.requestId!==command.requestId||response.gameId!==binding.gameId||
      orderedJson(response.view)!==orderedJson(view)||response.terminal!==(view.status!=="ACTIVE")||
      !/^(0|[1-9][0-9]*)$/.test(response.balanceMinor)||!/^(0|[1-9][0-9]*)$/.test(response.walletVersion)) throw Error("Invalid progressive settlement response");
    const total=view.totalWagerMinor??binding.chargedWagerMinor;
    if(response.wagerMinor!==total) throw Error("Progressive settlement stake mismatch");
    return {requestId:command.requestId,roundId:binding.roundId,sessionId,gameId:binding.gameId,clubId:binding.clubRef,nonce:0,
      action:command.action,fairnessAction:binding.action,wager:decimal(total),payout:decimal(receipt.payoutMinor),multiplier:Number(view.multiplier).toFixed(4),
      balance:decimal(response.balanceMinor),walletVersion:response.walletVersion,outcome:view.outcome,serverSeedHash:binding.serverSeedHash,
      roundActive:view.status==="ACTIVE",createdAt:new Date(Number(receipt.completedAt)).toISOString(),
      proofProtocol:"casino-progressive-proof-v1",payoutRounding:"floor-minor-v1"};
  }

  async resume(sessionId,context,roundId) {
    if(!this.locks) throw Error("Durable game recovery is unavailable");
    return this.locks.request(`casino-progressive-session:${context.playerRef}:${sessionId}`,async()=>{
      const {prepared,state}=await this.#restoreFromServer(sessionId,context,roundId);
      // A pending command is retried exactly as stored; no new player decision
      // is inferred from a page reload.
      if(state.pendingCommand) {
        const command=state.pendingCommand;
        const response=await this.requestJson(`/api/fairness/sessions/${sessionId}/nitro-progressive-${command.sequence===0?"open":"advance"}`,
          command.sequence===0?{request:prepared.request,ticket:prepared.ticket,command}:{roundId,command});
        const recovered=await this.#state(sessionId,roundId);
        const history=await this.#history(prepared,recovered);
        if(orderedJson(history[command.sequence]?.result)!==orderedJson(response.result) || canonicalJson(history[command.sequence]?.command)!==canonicalJson(command)) throw Error("Recovery result mismatch");
        return this.#settlement(sessionId,prepared,command,response);
      }
      if(!state.latest || !state.history.length) throw Error("Progressive round has no verified result");
      const entry=state.history.at(-1);
      if(orderedJson(entry.result)!==orderedJson(state.latest.result)) throw Error("Recovery result mismatch");
      return this.#settlement(sessionId,prepared,entry.command,state.latest);
    });
  }
}
