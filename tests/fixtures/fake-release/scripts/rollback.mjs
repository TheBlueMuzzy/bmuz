// Stand-in for rollback.mjs <tag> "<why>": the code (src/) put back to the tag's as a new commit, history kept.
import { called, git } from './lib.mjs'
called('rollback')
const [tag, why = ''] = process.argv.slice(2)
const now = git('describe', '--tags', '--abbrev=0')
git('checkout', tag, '--', 'src')
git('commit', '-q', '-m', `Rollback to ${tag}: undo ${now}${why ? ` — ${why}` : ''}`)
console.log(`✓ rolled back: the code is ${tag}'s again`)
