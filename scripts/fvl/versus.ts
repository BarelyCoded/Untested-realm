// One deck against named opponents only (bot against bot).
//   npx tsx scripts/fvl/versus.ts <deck key> <opponent,opponent> [games each=40] [seed=1] [fast|search:<ms>]
import { createGame, applyAction, featuredDecks, type PlayerId, type DeckList } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct } from '../../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH, resetSearchState } from '../../packages/client/src/bot_search'
import { DECKS } from './decks'
const [key, oppArg, gArg, sArg, botArg] = process.argv.slice(2)
const GAMES = Number(gArg ?? 40), SEED = Number(sArg ?? 1)
const searchMs = botArg?.startsWith('search') ? Number(botArg.split(':')[1] ?? 300) : 0
const all: Record<string, DeckList> = { ...Object.fromEntries((featuredDecks as DeckList[]).map((d) => [d.name, d])), ...DECKS }
const deck = all[key]
const act = (g: any, s: PlayerId) => { if (searchMs) { try { return searchBotAction(g, s, { ...DEFAULT_SEARCH, timeBudgetMs: searchMs }) } catch { /* fall through */ } } return botAction(g, s) }
const out: Record<string, string> = {}
for (const on of oppArg.split(',')) {
  const opp = all[on]; let w = 0, l = 0, d = 0
  for (let i = 0; i < GAMES; i++) {
    const mySeat = (i % 2) as PlayerId
    const g = createGame((mySeat === 0 ? [deck, opp] : [opp, deck]) as [DeckList, DeckList], ['A', 'B'], SEED * 100003 + i * 7919 + on.length * 31, (Math.floor(i / 2) % 2) as PlayerId)
    resetSearchState()
    let n = 0; const t0 = Date.now()
    while (g.winner === null && g.phase !== 'over' && n++ < 6000 && g.turn <= 70 && Date.now() - t0 < (searchMs ? 400000 : 60000)) {
      const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
      let a = act(g, s)
      if (!applyAction(g, s, a).ok) { a = botAction(g, s); if (!applyAction(g, s, a).ok) break }
    }
    if (g.winner === mySeat) w++; else if (g.winner === null) d++; else l++
  }
  out[on] = `${w}-${l}-${d}`
}
console.log(JSON.stringify({ deck: key, ...out }))
