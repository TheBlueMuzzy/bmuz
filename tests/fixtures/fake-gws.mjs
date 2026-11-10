// A stand-in for the gws CLI in tests (ideate-fetch.mjs, BMUZ_GWS with BMUZ_TEST=1): answers drive files get / list /
// export from a JSON world (FAKE_GWS_DATA) and logs every call (FAKE_GWS_LOG), so a test can see it stayed read-only.
// The world: { files: { <id>: { name, mimeType, size?, parent?, text?, owner?: "muzzymade" } } }
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const world = JSON.parse(readFileSync(process.env.FAKE_GWS_DATA, 'utf8'))
const account = process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ? 'muzzymade' : 'personal'
if (process.env.FAKE_GWS_LOG) appendFileSync(process.env.FAKE_GWS_LOG, JSON.stringify({ account, args }) + '\n')
const params = JSON.parse(args[args.indexOf('--params') + 1] || '{}')
const out = args.includes('-o') ? args[args.indexOf('-o') + 1] : null
const [service, resource, method] = args
const visible = f => f && (f.owner || 'personal') === account
const fail = msg => { process.stdout.write(JSON.stringify({ error: { code: 404, message: msg } })); process.exit(1) }
if (service !== 'drive' || resource !== 'files' || !['get', 'list', 'export'].includes(method)) fail(`not allowed in tests: ${args.slice(0, 3).join(' ')}`)
process.stderr.write('Using keyring backend: keyring\n')
if (method === 'list') {
  const parent = (params.q.match(/^'([^']+)' in parents/) || [])[1]
  const files = Object.entries(world.files).filter(([, f]) => f.parent === parent && visible(f)).map(([id, f]) => ({ id, name: f.name, mimeType: f.mimeType, size: f.size }))
  process.stdout.write(JSON.stringify({ files }))
  process.exit(0)
}
const f = world.files[params.fileId]
if (!visible(f)) fail('File not found: ' + params.fileId)
if (method === 'get' && params.alt !== 'media') {
  process.stdout.write(JSON.stringify({ id: params.fileId, name: f.name, mimeType: f.mimeType, size: f.size }))
  process.exit(0)
}
if (method === 'export' && !String(f.mimeType).startsWith('application/vnd.google-apps.')) fail('Export only supports Docs Editors files.')
writeFileSync(join(process.cwd(), out), f.binary ? Buffer.from([0, 1, 2, 3]) : f.text || '')
process.stdout.write(JSON.stringify({ saved_file: out, status: 'success' }))
