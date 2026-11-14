export interface Settings { cb: boolean; textScale: 1 | 1.25 | 1.5; reducedFlash: boolean }
export const DEFAULT_SETTINGS: Settings = { cb: false, textScale: 1, reducedFlash: false }
let current: Settings = DEFAULT_SETTINGS
export function getSettings(): Settings { return current }
