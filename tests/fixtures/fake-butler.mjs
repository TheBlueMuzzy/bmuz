// F230: the STAND-IN for butler, itch.io's upload tool, in BMUZ's tests (BMUZ_BUTLER points launch.mjs at it). It never
// reaches itch.io: "butler push <folder> <user>/<game>:<channel> --userversion X" copies the folder onto the stand-in
// host (the folder named in the project's git-ignored .fake-host file, served on 127.0.0.1 by fake-host.mjs) under
// itch/<game>/, and logs the call to $BMUZ_FAKE_RELEASE_LOG. FAKE_BUTLER=fail refuses.
import { appendFileSync, cpSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
if (process.env.BMUZ_FAKE_RELEASE_LOG) appendFileSync(process.env.BMUZ_FAKE_RELEASE_LOG, `butler ${args.join(' ')}\n`)
if (process.env.FAKE_BUTLER === 'fail') { console.log('✗ butler refused (a test stand-in told to fail)'); process.exit(1) }
const [cmd, folder, target] = args
if (cmd !== 'push' || !folder || !/^[\w.-]+\/[\w.-]+:[\w.-]+$/.test(target || '')) { console.log('usage: butler push <folder> <user>/<game>:<channel> --userversion X'); process.exit(1) }
if (!existsSync('.fake-host')) { console.log('no .fake-host file: the stand-in host folder is not set'); process.exit(1) }
const game = target.split('/')[1].split(':')[0]
const to = join(readFileSync('.fake-host', 'utf8').trim(), 'itch', game)
cpSync(folder, to, { recursive: true })
console.log(`• pushed ${folder} to ${target} (the stand-in host: ${to})`)
