// npm run build: the web page with the version in it, into dist/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const version = JSON.parse(readFileSync('version.json', 'utf8')).version
mkdirSync('dist', { recursive: true })
writeFileSync('dist/index.html', readFileSync('web/index.html', 'utf8').replace('{{version}}', version))
console.log(`built dist/index.html (version ${version})`)
