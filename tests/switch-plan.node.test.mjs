// F225 review: a stage-switch plan read back from disk is re-checked before anything is copied or deleted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const good = { from: 'discover', to: 'define', at: null, given: {}, n: 1, archive: 'stages/1-discover', checkpoints: ['checkpoint-spark.json', 'checkpoint-bricks.json'] }

test('F225 review: a well-formed stage-switch plan passes', () => {
  assert.equal(E.switchProblem(good), null)
  assert.equal(E.switchProblem({ ...good, at: 'scope' }), null)
})

test('F225 review: a plan that could reach outside .bmuz is refused before anything moves', () => {
  for (const bad of [
    { ...good, checkpoints: ['../../important.txt'] },
    { ...good, checkpoints: ['checkpoint-../x.json'] },
    { ...good, archive: '../../elsewhere' },
    { ...good, archive: 'stages/2-discover' },
    { ...good, from: '../x' },
    { ...good, to: 'define/../../x' },
    { ...good, n: 0 },
    { ...good, at: '../x' },
    { ...good, given: [] },
    null,
  ]) assert.ok(E.switchProblem(bad), JSON.stringify(bad))
})
