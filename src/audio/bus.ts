/**
 * Master bus (playtest-polish R5): every SFX and the music feed one master gain (volume and mute),
 * then a gentle bus compressor, then a brickwall-ish limiter, then the destination.
 *
 *   sources → [per-sound gain] → master gain → bus compressor → limiter → destination
 */

/** Gentle bus compressor: glues stacked sounds together. */
export const BUS_COMP = { threshold: -18, knee: 12, ratio: 3, attack: 0.01, release: 0.25 } as const
/** Limiter: high ratio, fast attack, no knee. */
export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const

export interface MasterBus {
  /** Everything connects here; mute and volume act on its gain. */
  input: GainNode
  comp: DynamicsCompressorNode | null
  limiter: DynamicsCompressorNode | null
}

function configure(node: DynamicsCompressorNode, s: { threshold: number; knee: number; ratio: number; attack: number; release: number }): void {
  node.threshold.value = s.threshold
  node.knee.value = s.knee
  node.ratio.value = s.ratio
  node.attack.value = s.attack
  node.release.value = s.release
}

/** Builds the chain. Without `createDynamicsCompressor` the master gain feeds the destination directly (R5.3). */
export function buildMasterBus(ctx: AudioContext): MasterBus {
  const input = ctx.createGain()
  if (typeof ctx.createDynamicsCompressor !== 'function') {
    input.connect(ctx.destination)
    return { input, comp: null, limiter: null }
  }
  const comp = ctx.createDynamicsCompressor()
  configure(comp, BUS_COMP)
  const limiter = ctx.createDynamicsCompressor()
  configure(limiter, LIMITER)
  input.connect(comp)
  comp.connect(limiter)
  limiter.connect(ctx.destination)
  return { input, comp, limiter }
}
