/**
 * Colour maths (playtest-polish R8.3), pure and dependency-free: sRGB ↔ linear ↔ XYZ ↔ CIE Lab,
 * colour differences (CIE76, CIEDE2000) and colour-vision-deficiency simulation with the
 * Machado, Oliveira and Fernandes (2009) matrices at severity 1.0, applied in linear RGB.
 */

export type RGB = readonly [number, number, number]
export type Lab = readonly [number, number, number]
export type Deficiency = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'
export const DEFICIENCIES: readonly Deficiency[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia']

/** `#rrggbb` (or `#rgb`) → [0..255] channels. Throws on anything else. */
export function parseHex(hex: string): RGB {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`bad colour: ${hex}`)
  let h = m[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function toHex(rgb: RGB): string {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
}

export function srgbToLinear(c8: number): number {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(l: number): number {
  const c = Math.max(0, Math.min(1, l))
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
}

/** Machado et al. (2009), severity 1.0, rows apply to linear [r, g, b]. */
export const CVD_MATRICES: Readonly<Record<Exclude<Deficiency, 'none'>, readonly [RGB, RGB, RGB]>> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
}

/** How `rgb` looks to a viewer with `kind`. Channels 0..255, not rounded. */
export function simulateCvd(rgb: RGB, kind: Deficiency): RGB {
  if (kind === 'none') return rgb
  const lin = rgb.map(srgbToLinear)
  const m = CVD_MATRICES[kind]
  return m.map((row) => linearToSrgb(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])) as unknown as RGB
}

// D65 white point
const WHITE: RGB = [0.95047, 1, 1.08883]

export function rgbToXyz(rgb: RGB): RGB {
  const [r, g, b] = rgb.map(srgbToLinear)
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ]
}

const EPS = 216 / 24389
const KAPPA = 24389 / 27
function f(t: number): number { return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116 }

export function rgbToLab(rgb: RGB): Lab {
  const [x, y, z] = rgbToXyz(rgb)
  const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => (r * 180) / Math.PI

/** CIEDE2000 (Sharma, Wu and Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2)
  const Cbar7 = Math.pow((C1 + C2) / 2, 7)
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const h1p = C1p === 0 ? 0 : (deg(Math.atan2(b1, a1p)) + 360) % 360
  const h2p = C2p === 0 ? 0 : (deg(Math.atan2(b2, a2p)) + 360) % 360

  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))

  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp /= 2
    else hbp = (hbp + (h1p + h2p < 360 ? 360 : -360)) / 2
  }
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63))
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2))
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh),
  )
}

/** ΔE2000 between two hex colours as seen by a viewer with `kind`. */
export function hexDeltaE(a: string, b: string, kind: Deficiency = 'none'): number {
  return deltaE2000(rgbToLab(simulateCvd(parseHex(a), kind)), rgbToLab(simulateCvd(parseHex(b), kind)))
}

/** Smallest ΔE2000 over normal vision and the three deficiencies. */
export function minHexDeltaE(a: string, b: string): number {
  return Math.min(...DEFICIENCIES.map((d) => hexDeltaE(a, b, d)))
}
