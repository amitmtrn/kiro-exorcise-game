/**
 * High-score table rows and drawing (more-content R10). Row selection is pure; drawing uses the text
 * scale (through `fitFontPx` and `scaled`) and the palette, and stays inside the box it is given.
 */

import type { ScoreEntry } from '../game/highScores'
import { fitFontPx } from './layout'
import { scaled } from './textScale'
import { getPalette } from './palette'

export interface TableRow {
  rank: number
  name: string
  score: number
  stage: number
  mode: '1P' | '2P'
  /** The player's own entry from this run. */
  own: boolean
}

export const PAGE_SIZE = 5
export const PAGE_MS = 4000
export const TITLE_HEADING = 'HIGH SCORES'

function row(e: ScoreEntry, i: number, ownIds: readonly string[]): TableRow {
  return { rank: i + 1, name: e.name, score: e.score, stage: e.stage, mode: e.mode, own: ownIds.includes(e.id) }
}

/** Number of pages of the title-screen table (0 for an empty table). */
export function pageCount(table: readonly ScoreEntry[], perPage = PAGE_SIZE): number {
  return Math.ceil(table.length / perPage)
}

/** Page shown at `now` (screen clock): pages switch every PAGE_MS. */
export function pageAt(table: readonly ScoreEntry[], now: number, perPage = PAGE_SIZE): number {
  const n = pageCount(table, perPage)
  return n <= 1 ? 0 : Math.floor(Math.max(0, now) / PAGE_MS) % n
}

/** Rows of one page of the title-screen table. */
export function tableRows(table: readonly ScoreEntry[], page: number, perPage = PAGE_SIZE): TableRow[] {
  return table.slice(page * perPage, page * perPage + perPage).map((e, i) => row(e, page * perPage + i, []))
}

/** End screens: the top 5, plus the player's own entries below them with their rank when outside the top 5. */
export function endRows(table: readonly ScoreEntry[], ownIds: readonly string[], top = PAGE_SIZE): TableRow[] {
  const rows = table.slice(0, top).map((e, i) => row(e, i, ownIds))
  table.forEach((e, i) => { if (i >= top && ownIds.includes(e.id)) rows.push(row(e, i, ownIds)) })
  return rows
}

export function rowText(r: TableRow): string {
  return `${String(r.rank).padStart(2, ' ')}. ${r.name.padEnd(8, ' ')}  ${String(r.score).padStart(7, ' ')}  S${r.stage} ${r.mode}`
}

export interface Box { x: number; y: number; w: number; h: number }

/** Draws a heading and rows inside `box`. Own rows are highlighted with a ▶ marker and the score colour. */
export function drawTable(ctx: CanvasRenderingContext2D, rows: readonly TableRow[], box: Box, heading?: string): void {
  if (rows.length === 0) return
  const lines = rows.length + (heading ? 1 : 0)
  const lineH = box.h / lines
  const longest = Math.max(...rows.map((r) => rowText(r).length + 2), heading ? heading.length : 0)
  const px = Math.round(fitFontPx('x'.repeat(longest), Math.min(lineH * 0.8, scaled(22)), box.w, 10))
  const P = getPalette()
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowBlur = 0
  let y = box.y + lineH / 2
  if (heading) {
    ctx.font = `bold ${px}px sans-serif`
    ctx.fillStyle = P.score
    ctx.fillText(heading, box.x + box.w / 2, y)
    y += lineH
  }
  ctx.font = `${px}px monospace`
  for (const r of rows) {
    ctx.fillStyle = r.own ? P.score : 'rgba(232,232,240,0.85)'
    ctx.fillText(`${r.own ? '▶ ' : '  '}${rowText(r)}`, box.x + box.w / 2, y)
    y += lineH
  }
  ctx.restore()
}
