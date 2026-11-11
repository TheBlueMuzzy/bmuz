// Stand-in for release.mjs <kind> "<summary>" [--stage=x]: version.json bumped, committed with every changed
// .planning/* and *.md file (as the real one does), tagged. FAKE_RELEASE=fail refuses before changing anything;
// FAKE_RELEASE=die-after-tag tags and then exits 1, as a timeout or a crash right after the tag would.
import { writeFileSync } from 'node:fs'
import { called, git, readJson } from './lib.mjs'
const how = called('release')
const [kind, summary] = process.argv.slice(2)
const v = readJson('version.json')
const p = v.version.split('.').map(Number)
const at = { update: 2, milestone: 1, stage: 1, major: 0 }[kind]
p[at] += 1
for (let i = at + 1; i < 3; i++) p[i] = 0
v.version = p.join('.')
v.build = 0
v.history = [...(v.history || []), { version: v.version, summary }]
writeFileSync('version.json', JSON.stringify(v, null, 2) + '\n')
const changed = git('status', '--porcelain', '-z', '--untracked-files=all').split('\0').filter(Boolean).map(l => l.slice(3)).filter(f => /^\.planning\//.test(f) || /\.md$/.test(f))
git('add', '--', 'version.json', ...changed)
git('commit', '-q', '-m', `Release v${v.version}: ${summary}`)
git('tag', '-a', `v${v.version}`, '-m', `v${v.version}: ${summary}`)
console.log(`✓ Release v${v.version} committed and tagged`)
if (how === 'die-after-tag') process.exit(1)
