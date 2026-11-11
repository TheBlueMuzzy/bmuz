// npm run smoke:live: the live page answers and shows the game (live-check.mjs sets LIVE_URL).
const res = await fetch(process.env.LIVE_URL)
const html = await res.text()
const ok = res.status === 200 && /Garden Race/.test(html)
console.log(ok ? 'smoke:live: the live page shows the game' : `smoke:live: HTTP ${res.status}`)
process.exit(ok ? 0 : 1)
