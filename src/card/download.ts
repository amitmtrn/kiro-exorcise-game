/**
 * Local-only PNG download (exorcist-card R5).
 *
 * canvas.toBlob → object URL → temporary <a download> click → revoke.
 * This module touches no network or storage API: the image never leaves the
 * device and is never persisted.
 */

export interface DownloadDeps {
  URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  document: Pick<Document, 'createElement' | 'body'>
  /** Runs `fn` shortly after the click (the URL must outlive the click). */
  schedule: (fn: () => void) => void
}

export const REVOKE_DELAY_MS = 1000
export const TO_BLOB_TIMEOUT_MS = 5000
export const CARD_FILENAME = 'exorcist-card.png'

export function defaultDownloadDeps(): DownloadDeps {
  return {
    URL,
    document,
    schedule: (fn) => { setTimeout(fn, REVOKE_DELAY_MS) },
  }
}

function toPngBlob(canvas: Pick<HTMLCanvasElement, 'toBlob'>): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const t = setTimeout(() => resolve(null), TO_BLOB_TIMEOUT_MS)
      canvas.toBlob((b) => { clearTimeout(t); resolve(b) }, 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/**
 * Saves the canvas as a PNG through a temporary download link.
 * Resolves true when the click happened, false when nothing could be exported.
 * The object URL is revoked in every case where one was created.
 */
export async function downloadCanvasPng(
  canvas: Pick<HTMLCanvasElement, 'toBlob'>,
  filename: string = CARD_FILENAME,
  deps: DownloadDeps = defaultDownloadDeps(),
): Promise<boolean> {
  const blob = await toPngBlob(canvas)
  if (!blob) return false

  const url = deps.URL.createObjectURL(blob)
  let a: HTMLAnchorElement | null = null
  try {
    a = deps.document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    deps.document.body.appendChild(a)
    a.click()
    return true
  } catch {
    return false
  } finally {
    try { a?.remove() } catch { /* already detached */ }
    deps.schedule(() => deps.URL.revokeObjectURL(url))
  }
}
