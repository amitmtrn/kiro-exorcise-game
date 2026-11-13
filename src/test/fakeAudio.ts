/**
 * Recording fake of the Web Audio pieces the music engine uses. Params log
 * every scheduling call; nodes record connections and start/stop times.
 */

export interface ParamCall { kind: 'set' | 'linear' | 'exp' | 'cancel'; value?: number; time: number }

export class FakeParam {
  value: number
  calls: ParamCall[] = []
  constructor(v = 1) { this.value = v }
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ kind: 'set', value: v, time: t }); return this }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push({ kind: 'linear', value: v, time: t }); return this }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push({ kind: 'exp', value: v, time: t }); return this }
  cancelScheduledValues(t: number) { this.calls.push({ kind: 'cancel', time: t }); return this }
}

export class FakeNode {
  kind: string
  connections: FakeNode[] = []
  disconnected = false
  startedAt: number | null = null
  stoppedAt: number | null = null
  type = ''
  buffer: unknown = null
  gain = new FakeParam(1)
  frequency = new FakeParam(440)
  Q = new FakeParam(1)
  constructor(kind: string) { this.kind = kind }
  connect(n: FakeNode) { this.connections.push(n); return n }
  disconnect() { this.disconnected = true }
  start(t: number) { this.startedAt = t }
  stop(t: number) { this.stoppedAt = t }
}

export class FakeAudioContext {
  currentTime = 0
  sampleRate = 8000
  state: 'running' | 'suspended' = 'running'
  destination = new FakeNode('destination')
  nodes: FakeNode[] = []
  resumeCalls = 0
  private make(kind: string): FakeNode { const n = new FakeNode(kind); this.nodes.push(n); return n }
  createGain() { return this.make('gain') }
  createOscillator() { return this.make('osc') }
  createBiquadFilter() { return this.make('filter') }
  createBufferSource() { return this.make('noise') }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len), length: len } }
  resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve() }

  /** All nodes of a kind that have been started. */
  started(kind: string): FakeNode[] { return this.nodes.filter(n => n.kind === kind && n.startedAt !== null) }
}

/** Manual interval timer: `fire()` runs every registered callback once. */
export function fakeTimers() {
  const fns = new Map<number, () => void>()
  let id = 0
  return {
    setIntervalFn: (fn: () => void, _ms: number) => { fns.set(++id, fn); return id },
    clearIntervalFn: (i: unknown) => { fns.delete(i as number) },
    fire: () => { for (const f of [...fns.values()]) f() },
    count: () => fns.size,
  }
}
