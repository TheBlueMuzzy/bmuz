export type BmuzBand = { text: string; status: string }

declare module 'claude-code' {
  interface PluginState {
    bmuz: { band: BmuzBand | null }
  }
}
