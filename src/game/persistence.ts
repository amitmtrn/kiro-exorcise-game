/** Demo mode turns this off: demo scores must never reach localStorage (demo-mode R6.4, more-content R8.5). */
let persist = true
export function setHighScorePersistence(on: boolean): void { persist = on }
export function highScorePersistence(): boolean { return persist }
