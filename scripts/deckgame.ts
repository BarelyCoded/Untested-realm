// One bot-vs-bot game between two decks, shared by deckmatch.ts and fieldtest.ts.
// Both seats are played by the procedural bot. Returns a plain record of what happened.
import { createGame, applyAction, avatarOf, getCard, type GameState, type PlayerId, type Action, type DeckList } from '../packages/shared/src'
import { botAction, botNeedsToAct, setBotProfile } from '../packages/client/src/bot'

export const MAXTURN = 80   // a game still running after this turn is recorded as a draw
export const ACT_CAP = 400  // per-turn action limit → forced end of turn (stall guard)

export interface GameRecord {
  A: string; B: string; i: number; seed: number; aSeat: PlayerId; aFirst: boolean
  result: 'A' | 'B' | 'draw' | 'crash'; turns: number; lifeA: number | null; lifeB: number | null
  fbA: number; fbB: number; capHits: number; maxDecisionMs: number; fbLog: string[]; secs: number
  collA: Record<string, number>; collB: Record<string, number>; actsA: Record<string, number>; actsB: Record<string, number>
  castsA: Record<string, number>; castsB: Record<string, number>; crashed: string
  /** card name → number of own turns ended holding it with enough mana left over to pay its cost */
  stuckA: Record<string, number>; stuckB: Record<string, number>
}

/** which bot pilots each deck: 'considered' (default) plays magics and abilities out before choosing,
 *  'ladder' is the plain heuristic ladder. Set with BOT_A / BOT_B in the environment. */
export interface BotChoice { A: 'considered' | 'ladder'; B: 'considered' | 'ladder' }
export function botsFromEnv(): BotChoice {
  const pick = (v?: string) => (v === 'ladder' ? 'ladder' : 'considered')
  return { A: pick(process.env.BOT_A), B: pick(process.env.BOT_B) }
}

const inc = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
const srcName = (g: GameState, id: string): string => {
  const o: any = (g as any).units?.[id] ?? (g as any).artifacts?.[id] ?? (g as any).sites?.[id]
  return (o?.cardId && g.cards[o.cardId]?.name) || o?.name || '?'
}

/** game `i` of deck A vs deck B: A alternates seats, and who goes first alternates independently. */
export function playDeckGame(A: string, B: string, deckA: DeckList, deckB: DeckList, i: number, baseSeed: number, bots: BotChoice = botsFromEnv()): GameRecord {
  const aSeat = (i % 2) as PlayerId
  setBotProfile(aSeat, { considered: bots.A !== 'ladder' })
  setBotProfile((1 - aSeat) as PlayerId, { considered: bots.B !== 'ladder' })
  const first = (Math.floor(i / 2) % 2) as PlayerId
  const pair: [DeckList, DeckList] = aSeat === 0 ? [deckA, deckB] : [deckB, deckA]
  const seed = (baseSeed + i * 7919) >>> 0
  const g: GameState = createGame(pair, ['P0', 'P1'], seed, first)
  const fb = [0, 0]; const casts: Record<string, number>[] = [{}, {}]; const coll: Record<string, number>[] = [{}, {}]; const acts: Record<string, number>[] = [{}, {}]; const stuck: Record<string, number>[] = [{}, {}]
  let lastTurn = -1, turnActs = 0, capHits = 0, maxDecisionMs = 0; const t0 = Date.now(); let crashed = ''; const fbLog: string[] = []
  try {
    while (g.phase !== 'over' && g.turn <= MAXTURN) {
      if (g.turn !== lastTurn) { lastTurn = g.turn; turnActs = 0 }
      const seat: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null
      if (seat === null) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
      if (++turnActs > ACT_CAP) {
        capHits++; turnActs = 0
        // stalled: end the turn, or decline the prompt that keeps coming back; if neither is accepted the game is abandoned (a draw)
        const out: Action = g.prompts[0] ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : { t: 'endTurn' }
        if (!applyAction(g, g.prompts[0] ? g.prompts[0].player : seat, out).ok && capHits > 20) break
        continue
      }
      let action: Action
      const d0 = Date.now()
      try { action = botAction(g, seat) } catch (e: any) { fb[seat]++; fbLog.push('threw: ' + String(e?.message ?? e).slice(0, 120)); action = { t: 'endTurn' } }
      maxDecisionMs = Math.max(maxDecisionMs, Date.now() - d0)
      if (action.t === 'castSpell') { const nm = g.cards[action.cardId]?.name; if (nm) inc(casts[seat], nm) }
      if (action.t === 'activate') inc(acts[seat], srcName(g, action.sourceId) + ':' + action.ability)
      if (action.t === 'prompt' && typeof action.choice === 'string' && g.prompts[0]?.kind === 'nameCard' && (g.prompts[0] as any).data?.fromCollection) inc(coll[seat], action.choice)
      if (action.t === 'endTurn' && g.phase === 'main') {
        const pl = g.players[seat]
        for (const id of new Set(pl.hand.map((h) => g.cards[h]?.name))) {
          const def: any = id ? getCard(id) : null
          if (def && def.type !== 'Site' && def.type !== 'Avatar' && (def.cost ?? 0) <= pl.mana) inc(stuck[seat], id!)
        }
      }
      const res = applyAction(g, seat, action)
      if (!res.ok) {
        fb[seat]++
        fbLog.push(`${action.t}${action.t === 'activate' ? ':' + srcName(g, action.sourceId) + ':' + action.ability : ''}${action.t === 'prompt' ? ':' + g.prompts[0]?.kind + ':' + JSON.stringify(action.choice)?.slice(0, 60) : ''} → ${String((res as any).error).slice(0, 100)}`)
        const f: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
        if (!applyAction(g, seat, f).ok) { applyAction(g, seat, { t: 'concede' }); break }
      }
    }
  } catch (e: any) { crashed = String(e?.message ?? e).slice(0, 200) }
  const w = g.phase === 'over' ? g.winner : null
  const life = (p: PlayerId) => { try { return avatarOf(g, p).life ?? 0 } catch { return null } }
  const bSeat = (1 - aSeat) as PlayerId
  return { A, B, i, seed, aSeat, aFirst: first === aSeat, result: crashed ? 'crash' : w === null || w === undefined ? 'draw' : w === aSeat ? 'A' : 'B', turns: g.turn,
    lifeA: life(aSeat), lifeB: life(bSeat), fbA: fb[aSeat], fbB: fb[bSeat], capHits, maxDecisionMs, fbLog: fbLog.slice(0, 5), secs: +((Date.now() - t0) / 1000).toFixed(1),
    collA: coll[aSeat], collB: coll[bSeat], actsA: acts[aSeat], actsB: acts[bSeat], castsA: casts[aSeat], castsB: casts[bSeat], crashed, stuckA: stuck[aSeat], stuckB: stuck[bSeat] }
}
