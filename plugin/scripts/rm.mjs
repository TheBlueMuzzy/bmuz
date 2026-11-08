// Deletes one file (used by the engine's rollback). Missing is fine.
import { rmSync } from 'node:fs'
rmSync(process.argv[2], { force: true })
