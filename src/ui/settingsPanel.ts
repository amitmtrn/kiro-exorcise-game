/**
 * Settings panel (playtest-polish R7.2, R7.3): opens on the title screen with `O` or a click on the ⚙
 * button; Up / Down select, Enter / Space / click toggle, Esc / O / the Close row leave.
 * Keyboard and mouse / touch only: no motion button (the title screen's raised-hand zones are taken).
 */

import { getSettings, updateSettings } from '../settings/runtime'
import { nextTextScale } from '../settings/settings'
import type { Settings } from '../settings/settings'
import { HUD_FONT_FAMILY } from './hud'
import type { Rect } from './layout'

export const PANEL_ROW_COUNT = 4
/** Row indices. */
export const ROW_CB = 0, ROW_TEXT = 1, ROW_FLASH = 2, ROW_CLOSE = 3

export function rowLabel(row: number, s: Settings): string {
  switch (row) {
    case ROW_CB: return `Colourblind-safe colours: ${s.cb ? 'ON' : 'OFF'}`
    case ROW_TEXT: return `Text size: ${Math.round(s.textScale * 100)}%`
    case ROW_FLASH: return `Reduced flashing: ${s.reducedFlash ? 'ON' : 'OFF'}`
    default: return 'Close  (Esc)'
  }
}

/** Longest label, used to size the panel. */
const WIDEST = 'Colourblind-safe colours: OFF'

/** Panel font px: grows with the canvas and the text scale, never below 16. */
export function panelFontPx(W: number, scale: number): number {
  return Math.max(16, Math.min(28, Math.round(W / 36))) * scale
}

/** The panel rect: centred, wide enough for the longest label, always inside the canvas. */
export function panelRect(W: number, H: number, scale: number): Rect {
  const font = panelFontPx(W, scale)
  const rowH = font * 1.9
  const w = Math.min(0.96 * W, WIDEST.length * font * 0.62 + font * 3)
  const h = Math.min(0.96 * H, rowH * (PANEL_ROW_COUNT + 1) + font)
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

export function rowRect(i: number, W: number, H: number, scale: number): Rect {
  const font = panelFontPx(W, scale)
  const p = panelRect(W, H, scale)
  const rowH = Math.min(font * 1.9, (p.h - font) / (PANEL_ROW_COUNT + 1))
  return { x: p.x + font * 0.5, y: p.y + font * 0.5 + rowH * (i + 1), w: p.w - font, h: rowH }
}

/** The ⚙ button: bottom-left, clear of the motion buttons (top rows), mute (top-right), sound hint (top) and menu text. */
export function gearRect(W: number, H: number): Rect {
  const size = Math.max(28, Math.min(48, Math.round(Math.min(W, H) * 0.075)))
  const m = Math.round(Math.min(W, H) * 0.025)
  return { x: m, y: H - m - size, w: size, h: size }
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export type PanelKey = 'up' | 'down' | 'activate' | 'close'
export function panelKey(key: string): PanelKey | null {
  switch (key) {
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    case 'Enter': case ' ': case 'Spacebar': return 'activate'
    case 'Escape': case 'o': case 'O': return 'close'
    default: return null
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

let open = false
let focus = 0

export function isPanelOpen(): boolean { return open }
export function panelFocus(): number { return focus }
export function openPanel(): void { open = true; focus = 0 }
export function closePanel(): void { open = false }

/** Applies a row: toggles / cycles a setting, or closes. */
export function activateRow(row: number): void {
  const s = getSettings()
  if (row === ROW_CB) updateSettings({ cb: !s.cb })
  else if (row === ROW_TEXT) updateSettings({ textScale: nextTextScale(s.textScale) })
  else if (row === ROW_FLASH) updateSettings({ reducedFlash: !s.reducedFlash })
  else closePanel()
}

/** Keyboard while the panel is open. Always consumes (returns true) so nothing leaks to the title screen. */
export function handlePanelKey(key: string): boolean {
  const k = panelKey(key)
  if (k === 'up') focus = (focus + PANEL_ROW_COUNT - 1) % PANEL_ROW_COUNT
  else if (k === 'down') focus = (focus + 1) % PANEL_ROW_COUNT
  else if (k === 'activate') activateRow(focus)
  else if (k === 'close') closePanel()
  return true
}

/**
 * Pointer: with the panel open a click on a row applies it and a click outside the panel closes it;
 * closed, a click on the gear opens it. Returns true when the click was used.
 */
export function handlePanelPointer(x: number, y: number, W: number, H: number): boolean {
  if (open) {
    const scale = getSettings().textScale
    for (let i = 0; i < PANEL_ROW_COUNT; i++) {
      if (inRect(rowRect(i, W, H, scale), x, y)) { focus = i; activateRow(i); return true }
    }
    if (!inRect(panelRect(W, H, scale), x, y)) closePanel()
    return true
  }
  if (inRect(gearRect(W, H), x, y)) { openPanel(); return true }
  return false
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

export function drawSettingsGear(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas
  const g = gearRect(W, H)
  ctx.save()
  ctx.fillStyle = 'rgba(42, 8, 69, 0.75)'
  ctx.strokeStyle = 'rgba(232, 232, 240, 0.6)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(g.x, g.y, g.w, g.h, 8); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#e8e8f0'
  ctx.font = `${Math.round(g.h * 0.62)}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('⚙', g.x + g.w / 2, g.y + g.h / 2 + 1)
  ctx.restore()
}

export function renderSettingsPanel(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas
  const s = getSettings()
  const scale = s.textScale
  const font = panelFontPx(W, scale)
  const p = panelRect(W, H, scale)
  ctx.save()
  ctx.fillStyle = 'rgba(13, 0, 20, 0.88)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(42, 8, 69, 0.95)'
  ctx.strokeStyle = '#ff6b1a'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 16); ctx.fill(); ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `bold ${font}px ${HUD_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'
  ctx.fillText('⚙ Settings', W / 2, p.y + font * 1.0)
  ctx.textAlign = 'left'
  for (let i = 0; i < PANEL_ROW_COUNT; i++) {
    const r = rowRect(i, W, H, scale)
    if (i === focus) {
      ctx.fillStyle = 'rgba(255, 107, 26, 0.3)'
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill()
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke()
    }
    ctx.font = `${font}px ${HUD_FONT_FAMILY}`
    ctx.fillStyle = '#e8e8f0'
    ctx.fillText(rowLabel(i, s), r.x + font * 0.4, r.y + r.h / 2)
  }
  ctx.restore()
}
