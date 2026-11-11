// npm run deploy: the STAND-IN host of BMUZ's tests. It copies dist/ into a folder on this machine (named in the
// git-ignored .fake-host file), which tests/fixtures/fake-host.mjs serves on 127.0.0.1. Nothing leaves this machine.
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
if (!existsSync('.fake-host')) { console.log('no .fake-host file: the stand-in host folder is not set'); process.exit(1) }
const target = join(readFileSync('.fake-host', 'utf8').trim(), 'garden-race')
cpSync('dist', target, { recursive: true })
console.log(`deployed dist/ to the stand-in host (${target})`)
