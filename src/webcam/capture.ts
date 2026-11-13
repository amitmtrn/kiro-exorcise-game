/**
 * Webcam capture — requests getUserMedia, draws a mirrored frame each tick.
 */

/** Requests webcam access and returns a ready <video> element. */
export async function initWebcam(): Promise<HTMLVideoElement> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true })

  const video = document.createElement('video')
  try {
    video.srcObject = stream
    video.playsInline = true
    video.muted = true

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('Video element error')), { once: true })
    })

    await video.play()
    return video
  } catch (err) {
    stopWebcam(video) // don't keep the camera lit when setup fails after permission was granted
    throw err
  }
}

/** Stops every track and detaches the stream so the camera is released before a retry. */
export function stopWebcam(video: HTMLVideoElement): void {
  const src = video.srcObject
  if (src && typeof (src as MediaStream).getTracks === 'function') {
    (src as MediaStream).getTracks().forEach((t) => t.stop())
  }
  video.srcObject = null
}

/**
 * Draws the current webcam frame onto the given canvas context, mirrored
 * horizontally so the player's movements feel natural (like a mirror).
 */
export function drawWebcamFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  const { width, height } = ctx.canvas
  ctx.save()
  // Flip horizontally: translate to right edge, scale x by -1
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  ctx.restore()
}
