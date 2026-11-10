// paste: the open paste panel (state.paste while its step runs), drawn above the prompt; absent or null when none.
export type BmuzPaste = { step: string; question: string; folder: string }
export type BmuzBand = { text: string; status: string; paste?: BmuzPaste | null }

declare module 'claude-code' {
  interface PluginState {
    bmuz: { band: BmuzBand | null }
  }
}
