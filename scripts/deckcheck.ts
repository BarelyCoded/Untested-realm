// Checks every deck in a decks JSON file: cards exist, are implemented, and the deck is legal.
//
//   npm run deckcheck -- testing/decks.json
import { readFileSync } from 'node:fs'
import { validateDeck, findCard, cardSupport, type DeckList } from '../packages/shared/src'
const decks: Record<string, DeckList> = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const [k, d] of Object.entries(decks)) {
  const names = [d.avatar, ...Object.keys(d.spellbook), ...Object.keys(d.atlas), ...Object.keys(d.collection ?? {})]
  const missing = names.filter((n) => !findCard(n))
  const sup: Record<string, string[]> = {}
  for (const n of names) { const c = findCard(n); if (c) { const s = String(cardSupport(c)); (sup[s] ??= []).push(n) } }
  const probs = validateDeck(d)
  console.log(`${k}: missing=${JSON.stringify(missing)} problems=${JSON.stringify(probs).slice(0, 300)}`)
  for (const [s, v] of Object.entries(sup)) console.log(`   support=${s}: ${v.length}${s === 'full' || v.length > 25 ? '' : ' → ' + v.join(', ')}`)
}
