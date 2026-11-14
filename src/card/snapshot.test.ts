import { describe, it, expect } from 'vitest'
import { grabMirroredSnapshot, releaseSnapshot, SNAPSHOT_MAX_W } from './snapshot'

function fakeCanvas() {
  const calls: Array<[string, unknown[]]> = []
  const canvas = { width: 0, height: 0 } as unknown as HTMLCanvasElement
  const ctx = {
    canvas,
    save: () => calls.push(['save', []]),
    restore: () => calls.push(['restore', []]),
    translate: (...a: unknown[]) => calls.push(['translate', a]),
    scale: (...a: unknown[]) => calls.push(['scale', a]),
    drawImage: (...a: unknown[]) => calls.push(['drawImage', a]),
  }
  ;(canvas as unknown as { getContext: () => unknown }).getContext = () => ctx
  return { canvas, calls }
}

describe('grabMirroredSnapshot', () => {
  it('draws the video mirrored (scaleX -1), exactly like the live view', () => {
    const { canvas, calls } = fakeCanvas()
    const video = {} as HTMLVideoElement
    const out = grabMirroredSnapshot(video, 1920, 1080, () => canvas)
    expect(out).toBe(canvas)
    expect(calls.find(([n]) => n === 'scale')![1]).toEqual([-1, 1])
    const tr = calls.find(([n]) => n === 'translate')![1]
    expect(tr).toEqual([canvas.width, 0])
    expect(calls.find(([n]) => n === 'drawImage')![1][0]).toBe(video)
  })

  it('keeps the display aspect ratio and caps the width', () => {
    const { canvas } = fakeCanvas()
    grabMirroredSnapshot({} as HTMLVideoElement, 1920, 1080, () => canvas)
    expect(canvas.width).toBeLessThanOrEqual(SNAPSHOT_MAX_W)
    expect(canvas.width / canvas.height).toBeCloseTo(1920 / 1080, 1)
  })

  it('release frees the pixels', () => {
    const { canvas } = fakeCanvas()
    grabMirroredSnapshot({} as HTMLVideoElement, 800, 600, () => canvas)
    releaseSnapshot(canvas)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
})
