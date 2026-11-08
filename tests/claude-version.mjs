// The mod API is early access: the engine is tested on one Claude Code version (claude-version.txt).
// A different version fails this check until the engine's tests have passed on it:
// npm run check:fast + npm run check:headless, then write the new version into claude-version.txt.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const pinned = readFileSync(new URL('../claude-version.txt', import.meta.url), 'utf8').trim()
const running = (execFileSync('claude', ['--version'], { encoding: 'utf8' }).match(/\d+\.\d+\.\d+/) || [''])[0]
if (running !== pinned) {
  console.log(`✘ Claude Code is ${running}; the BMUZ engine was tested on ${pinned}.`)
  console.log('  Run npm run check:fast and npm run check:headless on this version; if they pass, put the new version in claude-version.txt.')
  process.exit(1)
}
console.log(`✔ Claude Code ${running} (the version the engine was tested on)`)
