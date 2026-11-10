// A stand-in for the gh CLI in tests (ideate-fetch.mjs, BMUZ_GH with BMUZ_TEST=1): answers `repo clone <o>/<r> <dest>
// -- --depth 1 [--branch <ref>]` (writes the repo's files into dest) and `api -H "Accept: application/vnd.github.raw"
// repos/<o>/<r>/contents/<path>[?ref=]` (prints one file) from a JSON world (FAKE_GH_DATA), logging every call
// (FAKE_GH_LOG), so a test can see it stayed read-only. The world: { repos: { "<o>/<r>": { "<path>": "<text>" } } }
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const world = JSON.parse(readFileSync(process.env.FAKE_GH_DATA, 'utf8'))
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args }) + '\n')
const fail = msg => { process.stderr.write(msg + '\n'); process.exit(1) }

if (args[0] === 'repo' && args[1] === 'clone') {
  const files = world.repos[args[2]]
  if (!files) fail(`GraphQL: Could not resolve to a Repository with the name '${args[2]}'.`)
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(args[3], p)), { recursive: true })
    writeFileSync(join(args[3], p), text)
  }
  mkdirSync(join(args[3], '.git'), { recursive: true })
  writeFileSync(join(args[3], '.git', 'HEAD'), 'ref: refs/heads/main')
  process.exit(0)
}
if (args[0] === 'api') {
  const m = String(args[3] || '').match(/^repos\/([^/]+\/[^/]+)\/contents\/([^?]+)/)
  const files = m && world.repos[m[1]]
  const path = m && m[2].split('/').map(decodeURIComponent).join('/')
  if (!files || !(path in files)) fail('gh: Not Found (HTTP 404)')
  process.stdout.write(files[path])
  process.exit(0)
}
fail(`not allowed in tests: ${args.slice(0, 2).join(' ')}`)
