// Stand-in for live-check.mjs: FAKE_LIVE_CHECK=fail is a page that doesn't show the new version; otherwise the pass is
// recorded in .planning/live-pass (the last tag and STATE's Live link).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { called, git } from './lib.mjs'
called('live-check')
const live = (readFileSync('.planning/STATE.md', 'utf8').match(/Live:\s*(\S+)/) || [])[1]
const tag = git('describe', '--tags', '--abbrev=0')
mkdirSync('.planning', { recursive: true })
writeFileSync('.planning/live-pass', `${git('rev-parse', 'HEAD')}\n${tag} ${live}\n`)
console.log(`✓ ${live} is public and shows ${tag}`)
