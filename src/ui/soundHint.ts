/** Shows the sound hint while audio is locked and hides it after `ms` (motion-ui-ergonomics R6.2). */
export function createSoundHintController(
  setHidden: (hidden: boolean) => void,
  ms: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = {
    // arrow wrappers: browsers throw 'Illegal invocation' when a global is called with another `this`
    set: (f, ms) => setTimeout(f, ms),
    clear: (t) => clearTimeout(t),
  },
): (locked: boolean) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (locked) => {
    setHidden(!locked)
    timers.clear(timer)
    if (locked) timer = timers.set(() => setHidden(true), ms)
  }
}
