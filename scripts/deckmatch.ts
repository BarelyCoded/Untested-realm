// Deck-vs-deck harness: plays deck A against deck B with the same procedural bot on both seats.
//
//   npm run deckmatch -- testing/decks.json PF_TECH FIRE_NECRO 300 testing/results.jsonl [seed]
//
// Deck A alternates seats and who goes first. One JSON line per game is appended to the output file
// (result, turns, final life, illegal-action fallbacks, and what each side cast / activated / fetched
// from its collection). Games that pass turn 80 are recorded as draws.
import { readFileSync, appendFileSync } from 'node:fs'
import type { DeckList } from '../packages/shared/src'
import { playDeckGame } from './deckgame'
const [file, A, B, nStr, out, seedStr] = process.argv.slice(2)
const decks: Record<string, DeckList> = JSON.parse(readFileSync(file, 'utf8'))
const N = Number(nStr); const BASE = Number(seedStr ?? 20261109)
for (let i = 0; i < N; i++) appendFileSync(out, JSON.stringify(playDeckGame(A, B, decks[A], decks[B], i, BASE)) + '\n')
process.stderr.write(`${A} v ${B} done ${N}\n`)
