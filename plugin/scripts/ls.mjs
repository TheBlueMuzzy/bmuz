// Lists the files a "writes" pattern matches (used by the engine's checkpoint and rollback): one folder, a * file
// name, like content/data/*.json. Prints a JSON list of project-relative paths. A missing folder is an empty list.
//   node ls.mjs <project folder> <pattern>
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const [dir, pattern] = process.argv.slice(2)
const at = pattern.lastIndexOf('/')
const folder = at < 0 ? '' : pattern.slice(0, at)
const name = pattern.slice(at + 1)
const re = new RegExp(`^${name.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
let found = []
try {
  found = readdirSync(join(dir, folder), { withFileTypes: true }).filter(e => e.isFile() && re.test(e.name)).map(e => (folder ? `${folder}/${e.name}` : e.name))
} catch (e) {
  found = []
}
process.stdout.write(JSON.stringify(found.sort()))
