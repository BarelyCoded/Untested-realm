// Field test: plays every candidate deck against every deck in a "field" and appends one JSON line
// per game. A candidate that is itself a field deck skips its own mirror.
//
//   npm run fieldtest -- testing/field_decks.json testing/field.json 10 testing/results_field.jsonl [candidates] [shard/of] [seed]
//
//   candidates  comma-separated deck keys, or "all" (default)
//   shard/of    e.g. 0/2 and 1/2 to split the pairings across two processes
import { readFileSync, appendFileSync } from 'node:fs'
import type { DeckList } from '../packages/shared/src'
import { playDeckGame } from './deckgame'
const [deckFile, fieldFile, nStr, out, candArg = 'all', shardArg = '0/1', seedStr] = process.argv.slice(2)
const decks: Record<string, DeckList> = JSON.parse(readFileSync(deckFile, 'utf8'))
const field: Record<string, number> = JSON.parse(readFileSync(fieldFile, 'utf8'))
const N = Number(nStr); const BASE = Number(seedStr ?? 20261109)
const [shard, of] = shardArg.split('/').map(Number)
const cands = candArg === 'all' ? Object.keys(decks) : candArg.split(',')
const pairs: [string, string][] = []
for (const c of cands) for (const f of Object.keys(field)) if (c !== f) pairs.push([c, f])
let done = 0
pairs.forEach(([c, f], idx) => {
  if (idx % of !== shard) return
  if (!decks[c] || !decks[f]) { process.stderr.write(`missing deck ${c} or ${f}\n`); return }
  for (let i = 0; i < N; i++) appendFileSync(out, JSON.stringify(playDeckGame(c, f, decks[c], decks[f], i, BASE)) + '\n')
  done++
  if (done % 10 === 0) process.stderr.write(`shard ${shard}: ${done} pairings done\n`)
})
process.stderr.write(`shard ${shard} finished: ${done} pairings x ${N} games\n`)
