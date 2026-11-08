export const meta = {
  name: 'hello-flow',
  description: 'Test flow: writes the hello page for the game name it is given',
}
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = { name: a } } }
const name = (a && a.name) || 'NO-NAME'
const out = (a && a.out) || 'hello.html'
const stall = a && a.stallTest
const prompt = stall
  ? `This is a freeze test. Call the Bash tool in the FOREGROUND (do not set run_in_background, do not use Monitor) with the command "ping -n ${stall} 127.0.0.1 > /dev/null" and timeout ${stall * 1000 + 60000}, and wait for it to return. Only after it returns, use the Write tool to create ${out} containing exactly <h1>Hello ${name}</h1>. Reply with the word written.`
  : `Use the Write tool to create the file ${out} (relative to the current working directory) containing exactly: <h1>Hello ${name}</h1>. Then reply with just the word written.`
const said = await agent(prompt, { model: 'haiku', label: 'write the hello page' })
return { wrote: out, name, said }
