// F230: the garden race at Deliver's end with its 1.0 build made — Release starts from here. On top of the developed
// garden (garden-developed-setup.mjs: git, the dev/vertical-slice branch, origin a bare repository in a folder on this
// machine): every earlier milestone released (v0.3.0 the last), the 1.0 milestone "✅ ready to deliver", Deliver's record
// of the 1.0 build (its safety checks passed), STATE's "Itch:" line on the stand-in host, and — the research stand-in —
// today's requirements for each platform as sourced reports (STAND-INS: test fixtures, never real research; their links
// are example.com and are never fetched: BMUZ_SOURCES_OFFLINE=1). Nothing here reaches anything real.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setupDevelopedGarden } from './garden-developed-setup.mjs'
import * as M from '../../plugin/scripts/marks.mjs'

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`)
  return (r.stdout || '').trim()
}

export const ROADMAP_1_0 = `# Garden Race — Roadmap
${M.block('rm:plan', `Release target: 1.0 — musts 5/5 done
## v0.1 — Vertical slice  (→ playable)  ✅ released 2026-11-01 (v0.1.0)
Goal: one full game for two on one phone
- ✅ F01 🧱 Turn engine — draw a card, play one, the turn passes — must:playable
- ✅ F02 🎮 Seed cards — plant sunflowers and roses that bloom over turns — must:playable
- ✅ F03 🎮 Weather cards — rain and hail on a friend's row — must:playable · needs: F01, F02
## v0.2 — Alpha  (→ alpha)  ✅ released 2026-11-04 (v0.2.0)
Goal: every must-have feature, rough
- ✅ F04 🎮 Computer opponent — play alone against the computer — must:alpha · needs: F03
## v0.3 — Beta  (→ beta)  ✅ released 2026-11-08 (v0.3.0)
Goal: finished, polished, tested
## v0.4 — 1.0  (→ 1.0)  ✅ ready to deliver 2026-11-11
Goal: release
- ✅ F05 ✨ Title screen — the game's name and a Play button — must:1.0
## Later

## Ideas`)}
`

// A sourced research report in the research flow's format (check-sources.mjs), for one platform: a STAND-IN.
export function researchReport(topic, needs) {
  const src = needs.map((n, i) => `${i + 1}. Stand-in source ${i + 1} — https://docs.example.com/${encodeURIComponent(topic.split(' ')[0].toLowerCase())}/${i + 1}`)
  return [
    `# Discover (release requirements): ${topic}`,
    '',
    'A TEST FIXTURE standing in for the research flow (F230 tests): not real research, never shown as such.',
    '',
    '## Question',
    `- Research: Release requirements — what ${topic} needs today before a game can be released there`,
    '',
    '## Research questions',
    `1. What does ${topic} require today before a game can be released there?`,
    '',
    '## Findings by question',
    `### 1. What does ${topic} require today before a game can be released there?`,
    ...needs.map((n, i) => `- ${n} [${i + 1}] (one source)`),
    '',
    '## Bricks',
    '### Requirements',
    ...needs.map((n, i) => `- ${n} [${i + 1}] (one source)`),
    '',
    '## Contradictions',
    '- none found',
    '',
    '## Assumption scoreboard',
    '- none: the creative named no fears or important assumptions',
    '',
    '## Surprises',
    '- none found',
    '',
    '## Open questions → probes',
    '- none found',
    '',
    '## On ice',
    '- none',
    '',
    '## So what (draft for Define)',
    '- none drafted',
    '',
    '## Sources',
    ...src,
    '',
  ].join('\n')
}
export const NEEDS = {
  web: ['A public link on a static host · HTTPS', 'The build uploaded to the host · the files of the web build', 'A live check after the deploy · the page loads'],
  itch: ['An itch.io account · free', 'A project page · Kind of project: HTML', 'A cover image · 630×500', 'Screenshots · 3 to 5', 'The build as a zip or a butler upload · index.html at the top', 'A store page text · a short description and the full one'],
  steam: ['A Steamworks developer account · the app fee per game', 'Capsule art · the main capsule at its set size', 'A trailer · one short gameplay video', 'A store page · the short description and About This Game', 'The build uploaded through Steamworks · a depot per platform', "Valve's review of the store page and the build · a few business days", 'A release date · Coming Soon for at least two weeks'],
  phone: ['A developer account with each store · a yearly or one-time fee', 'An app icon · at the stores\' sizes', 'A store listing · a short and a full description', 'An age rating questionnaire', 'A data safety form · what data the game collects', 'A privacy page · a public link', "Each store's review · a few days"],
}
export const TOPICS = { web: 'a web game on its own public link (static hosting, like GitHub Pages)', itch: 'itch.io (an HTML5 game played in the browser)', steam: 'Steam (Steamworks)', phone: 'the Apple App Store and Google Play' }

export function setupReleaseGarden(dir, { port = 0, research = ['web', 'itch', 'steam', 'phone'] } = {}) {
  const out = setupDevelopedGarden(dir, { port })
  writeFileSync(join(dir, '.planning', 'ROADMAP.md'), ROADMAP_1_0)
  const state = join(dir, '.planning', 'STATE.md')
  writeFileSync(state, readFileSync(state, 'utf8').replace('## Key facts\n', `## Key facts\n- Itch: http://127.0.0.1:${port}/itch/garden-race/ · butler test/garden-race:html5\n`).replace('Stage: develop', 'Stage: deliver'))
  writeFileSync(join(dir, 'version.json'), JSON.stringify({ name: 'garden-race', version: '0.3.0', build: 0, history: [] }, null, 2) + '\n')
  // (1.0's checklist, ticked: the privacy page, the store's age and data forms, a full security review — Deliver's 5.3)
  mkdirSync(join(dir, '.planning', 'archive', 'release-checks'), { recursive: true })
  writeFileSync(join(dir, '.planning', 'archive', 'release-checks', '1.0.md'), '# Release check — 1.0\n- [x] Privacy page: privacy.html, linked in Settings\n- [x] Store age and data forms: no data collected\n- [x] Security review: done 2026-11-10\n')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Plan: 1.0 is approved, ready to deliver'])
  git(dir, ['tag', 'v0.3.0'])
  git(dir, ['push', '-q', 'origin', 'dev/vertical-slice'])
  // Deliver's record: the 1.0 build made (5.4's card), every check before it passed
  mkdirSync(join(dir, '.bmuz', 'deliver'), { recursive: true })
  writeFileSync(join(dir, '.bmuz', 'deliver', 'run.json'), JSON.stringify({ milestone: '1.0', title: 'v0.4 — 1.0', stage: '1.0', started: '2026-11-11', branch: 'dev/vertical-slice', go: true, publish: {}, check: { musts: { done: 1, all: 1, open: [] }, bugs: [], checks: [], missing: [] }, standins: [], safety: { secrets: [], unlicensed: [], deps: [], open: [] }, build: { local: 'file:///dist/index.html', share: `http://127.0.0.1:${port}/garden-race/`, tested: 'desktop' } }, null, 2) + '\n')
  // today's research, one sourced report per platform (the stand-in for the research flow), committed as BMUZ would
  mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
  for (const k of research) writeFileSync(join(dir, '.planning', 'research', `release-${k}.md`), researchReport(TOPICS[k], NEEDS[k]))
  if (research.length) { git(dir, ['add', '.planning/research']); git(dir, ['commit', '-q', '-m', 'Release: the platforms\' requirements researched']) }
  return out
}
