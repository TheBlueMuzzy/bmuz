// The STAND-IN host for BMUZ's Deliver tests (F219): serves one folder on 127.0.0.1 only, so a "live" build can be
// checked without anything public. A fixture's deploy script copies its build into the folder.
//   node tests/fixtures/fake-host.mjs <folder> <port>      (prints "listening <port>", runs until it is stopped)
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'

const [root, port] = process.argv.slice(2)
createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
  if (path.split(/[/\\]/).includes('..')) { res.writeHead(403).end(); return }
  let file = join(root, path)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream' }).end(readFileSync(file))
}).listen(Number(port), '127.0.0.1', () => console.log(`listening ${port}`))
