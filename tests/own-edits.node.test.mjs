// F216 review fixes 5–6: what a step's own Write / Edit calls changed (Claude's or a helper's) is recorded, so an undo
// puts back only that, never a value the creative changed meanwhile (their Dev Kit save), and a commit takes only that.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const json = v => JSON.stringify(v, null, 2) + '\n'

test('an own edit of a JSON file is recorded key by key (from the first value before it, to the last after it)', () => {
  let e = E.ownEntry(null, json({ a: 1, b: { c: 2 } }), json({ a: 1, b: { c: 3 } }))
  assert.deepEqual(e.keys, { 'b.c': { from: 2, to: 3 } })
  assert.equal(e.after, E.textSha(json({ a: 1, b: { c: 3 } })))
  e = E.ownEntry(e, json({ a: 1, b: { c: 3 } }), json({ a: 1, b: { c: 4 } }))
  assert.deepEqual(e.keys, { 'b.c': { from: 2, to: 4 } })
  // back to where it was: no change of its own any more
  e = E.ownEntry(e, json({ a: 1, b: { c: 4 } }), json({ a: 1, b: { c: 2 } }))
  assert.deepEqual(e.keys, {})
  const t = E.ownEntry(null, 'hello', 'hello world')
  assert.equal(t.keys, null)
  assert.equal(E.ownEntry(null, null, 'new').created, true)
})

test('the own changes: the keys only the step changed, without a value the creative changed after it', () => {
  const cp = json({ speed: 2, hand: 3 })
  const own = E.ownEntry(null, cp, json({ speed: 1, hand: 3 }))
  assert.deepEqual(E.ownChanges(own, json({ speed: 1, hand: 3 })), [{ key: 'speed', from: 2, to: 1 }])
  // the creative saved speed 5 in the Dev Kit after the step changed it: not the step's change any more
  assert.deepEqual(E.ownChanges(own, json({ speed: 5, hand: 3 })), [])
})

test('undo puts back only the step\'s own changes: the whole file when nobody else touched it; else only its own keys still as it left them', () => {
  const cp = json({ speed: 2, hand: 3 })
  const own = E.ownEntry(null, cp, json({ speed: 1, hand: 3 }))
  assert.equal(E.ownRollback(own, cp, json({ speed: 1, hand: 3 })).text, cp)
  // the creative changed hand to 4 meanwhile: speed goes back, hand stays theirs
  assert.deepEqual(JSON.parse(E.ownRollback(own, cp, json({ speed: 1, hand: 4 })).text), { speed: 2, hand: 4 })
  // the creative changed speed itself: theirs, nothing to put back
  assert.equal(E.ownRollback(own, cp, json({ speed: 7, hand: 3 })).keep, true)
  // a text file someone else changed after the step: kept as it is
  const t = E.ownEntry(null, 'a', 'b')
  assert.equal(E.ownRollback(t, 'a', 'b').text, 'a')
  assert.equal(E.ownRollback(t, 'a', 'c').keep, true)
  // a file the step made: deleted, unless someone changed it after
  const n = E.ownEntry(null, null, 'new')
  assert.equal(E.ownRollback(n, null, 'new').remove, true)
  assert.equal(E.ownRollback(n, null, 'theirs').keep, true)
})
