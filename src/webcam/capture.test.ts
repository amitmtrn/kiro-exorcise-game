import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initWebcam, stopWebcam, drawWebcamFrame } from './capture'

describe('initWebcam', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects when getUserMedia throws', async () => {
    const error = new Error('Permission denied')
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(error),
      },
    })

    await expect(initWebcam()).rejects.toThrow('Permission denied')
  })

  it('rejects when getUserMedia is unavailable', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined })

    await expect(initWebcam()).rejects.toThrow()
  })
})

describe('drawWebcamFrame', () => {
  it('applies a horizontal mirror transform and draws the video', () => {
    const translate = vi.fn()
    const scale = vi.fn()
    const drawImage = vi.fn()
    const save = vi.fn()
    const restore = vi.fn()

    const ctx = {
      canvas: { width: 640, height: 480 },
      save,
      restore,
      translate,
      scale,
      drawImage,
    } as unknown as CanvasRenderingContext2D

    const video = {} as HTMLVideoElement

    drawWebcamFrame(ctx, video)

    expect(save).toHaveBeenCalledOnce()
    // Must translate to the right edge before flipping
    expect(translate).toHaveBeenCalledWith(640, 0)
    expect(scale).toHaveBeenCalledWith(-1, 1)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480)
    expect(restore).toHaveBeenCalledOnce()
  })
})

describe('stopWebcam', () => {
  it('stops every track and detaches the stream', () => {
    const stop = vi.fn()
    const video = { srcObject: { getTracks: () => [{ stop }, { stop }] } } as unknown as HTMLVideoElement
    stopWebcam(video)
    expect(stop).toHaveBeenCalledTimes(2)
    expect(video.srcObject).toBeNull()
  })

  it('is safe when nothing is attached', () => {
    const video = { srcObject: null } as unknown as HTMLVideoElement
    expect(() => stopWebcam(video)).not.toThrow()
  })
})

describe('initWebcam cleanup', () => {
  it('releases the stream when play() rejects after permission was granted', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
    const video = {
      srcObject: null as unknown, playsInline: false, muted: false,
      addEventListener: (t: string, f: () => void) => { if (t === 'loadedmetadata') f() },
      play: () => Promise.reject(new Error('play blocked')),
    }
    vi.stubGlobal('document', { createElement: () => video })
    await expect(initWebcam()).rejects.toThrow('play blocked')
    expect(stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    vi.unstubAllGlobals()
  })
})
