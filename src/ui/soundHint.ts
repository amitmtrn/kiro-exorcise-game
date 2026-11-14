/** Shows the sound hint while audio is locked and hides it after `ms` (motion-ui-ergonomics R6.2). */
export function createSoundHintController(
  setHidden: (hidden: boolean) => void,
  ms: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): (locked: boolean) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (locked) => {
    setHidden(!locked)
    timers.clear(timer)
    if (locked) timer = timers.set(() => setHidden(true), ms)
  }
}
