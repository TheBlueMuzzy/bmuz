// Stand-in for merge.mjs <branch>: main, a --no-ff merge, the branch deleted here.
import { called, git } from './lib.mjs'
called('merge')
const branch = process.argv[2]
git('checkout', '-q', 'main')
git('merge', '--no-ff', '-q', '-m', `Merge ${branch} into main`, branch)
git('branch', '-q', '-d', branch)
console.log(`✓ ${branch} merged into main`)
