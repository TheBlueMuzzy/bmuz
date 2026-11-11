// F219: the developed garden as Deliver finds it — tests/fixtures/garden-developed in a git repository: main as Design
// left it, the dev/vertical-slice work branch with the sprint's commits, and "origin" a bare repository in a folder on
// this machine (never a real remote). The stand-in host's folder is named in the git-ignored .fake-host file and the
// STATE.md Live link points at 127.0.0.1:<port> (tests/fixtures/fake-host.mjs serves it).
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`)
  return (r.stdout || '').trim()
}

export function setupDevelopedGarden(dir, { port = 0, host = `${dir}-host`, origin = `${dir}-origin.git` } = {}) {
  for (const d of [dir, host, origin]) rmSync(d, { recursive: true, force: true })
  mkdirSync(host, { recursive: true })
  cpSync(join(here, 'garden-developed'), dir, { recursive: true })
  const state = join(dir, '.planning', 'STATE.md')
  writeFileSync(state, readFileSync(state, 'utf8').replace('PORT', String(port)))
  writeFileSync(join(dir, '.fake-host'), host)
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'BMUZ test'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'the garden, as Design left it'])
  // the sprint's work, on its branch (code commits named by feature, as Develop makes them)
  git(dir, ['checkout', '-q', '-b', 'dev/vertical-slice'])
  for (const [id, name] of [['F01', 'Turn engine'], ['F02', 'Seed cards'], ['F03', 'Weather cards']]) {
    appendFileSync(join(dir, 'src', 'garden.js'), `// ${id}: ${name}, approved\n`)
    git(dir, ['commit', '-q', '-am', `${id}: done — ${name}`])
  }
  git(dir, ['init', '-q', '--bare', origin])
  git(dir, ['remote', 'add', 'origin', origin])
  git(dir, ['push', '-q', 'origin', 'main', 'dev/vertical-slice'])
  return { dir, host, origin }
}
