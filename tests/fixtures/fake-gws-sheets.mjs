// A stand-in for the gws CLI's Sheets calls in tests (tables.mjs, BMUZ_GWS with BMUZ_TEST=1): batchGet reads and
// batchUpdate writes a JSON world (FAKE_GWS_DATA) — never a real Sheet — and every call is logged (FAKE_GWS_LOG).
// The world: { sheets: { <id>: { owner?: "muzzymade", tabs: { <tab>: { values: [[…]], formulas?: [[…]] } } } } }
// formulas: the cells as the FORMULA render shows them ("=B2*2"); a cell with no formula there shows its value.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = process.env.FAKE_GWS_DATA
const world = JSON.parse(readFileSync(file, 'utf8'))
const account = process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ? 'muzzymade' : 'personal'
if (process.env.FAKE_GWS_LOG) appendFileSync(process.env.FAKE_GWS_LOG, JSON.stringify({ account, args }) + '\n')
const arg = name => (args.includes(name) ? JSON.parse(args[args.indexOf(name) + 1] || '{}') : {})
const params = arg('--params')
const fail = msg => { process.stdout.write(JSON.stringify({ error: { code: 404, message: msg } })); process.exit(1) }
const [service, resource, sub, method] = args
if (service !== 'sheets' || resource !== 'spreadsheets' || sub !== 'values' || !['batchGet', 'batchUpdate'].includes(method)) fail(`not allowed in tests: ${args.slice(0, 4).join(' ')}`)
const sheet = world.sheets[params.spreadsheetId]
if (!sheet || (sheet.owner || 'personal') !== account) fail('Requested entity was not found.')
const tabOf = range => String(range).split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'")
const colIndex = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
if (method === 'batchGet') {
  const valueRanges = params.ranges.map(r => {
    const t = sheet.tabs[tabOf(r)]
    if (!t) fail(`Unable to parse range: ${r}`)
    const rows = t.values.map((row, i) => row.map((v, j) => (params.valueRenderOption === 'FORMULA' && t.formulas && t.formulas[i] && t.formulas[i][j] ? t.formulas[i][j] : v)))
    return { range: r, values: rows }
  })
  process.stdout.write(JSON.stringify({ spreadsheetId: params.spreadsheetId, valueRanges }))
  process.exit(0)
}
const body = arg('--json')
if (body.valueInputOption !== 'RAW') fail('tests only write RAW values')
for (const d of body.data) {
  const t = sheet.tabs[tabOf(d.range)]
  const m = String(d.range).split('!')[1].match(/^([A-Z]+)(\d+)$/)
  if (!t || !m) fail(`Unable to parse range: ${d.range}`)
  const r = Number(m[2]) - 1
  const c = colIndex(m[1])
  while (t.values.length <= r) t.values.push([])
  while (t.values[r].length <= c) t.values[r].push('')
  t.values[r][c] = d.values[0][0]
}
writeFileSync(file, JSON.stringify(world, null, 2))
process.stdout.write(JSON.stringify({ spreadsheetId: params.spreadsheetId, totalUpdatedCells: body.data.length }))
