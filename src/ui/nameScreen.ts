/**
 * Name screen (more-content R9): the default name is already saved; the player may change it with
 * three motion buttons (◀ / OK / ▶, layout.ts `name` / `name2p`) or the keyboard. One instance per
 * area: 1P uses the whole canvas, 2P one instance per half with that half's motion points.
 */

import type { NameEntry } from '../game/nameEntry'
import { PICK_LEN } from '../game/nameEntry'
import { areaButtons, fitFontPx, nameStepOf, TEXT_BAND_1P } from './layout'
import type { Seat } from '../game/halves'
import { ButtonSet } from './buttonSet'
import { EntryLock, updateExclusive } from './motionButton'
import type { PointSource } from './motionButton'
import { TITLE_FONT_FAMILY } from './fonts'
import { scaled } from './textScale'
import { getPalette } from './palette'

export const NAME_TITLE = 'NAME YOUR HUNTER'
export const NAME_HINT = '◀ ▶ pick a letter • OK next • or type, Enter • M is a letter here'
export const NAME_HINT_2P = '◀ ▶ letter • OK next'
export const WAITING_TEXT = 'Waiting for the other player…'

export interface NameInfo { score: number; rank: number }
export type NameAction = { kind: 'step'; dir: -1 | 1 } | { kind: 'ok' }

export class NameScreen {
  private set: ButtonSet
  private lock = new EntryLock()

  constructor(private seat: Seat | null = null, source: PointSource | null = null) {
    this.set = new ButtonSet(source)
  }

  /** Call when the screen is (re)entered: fresh buttons and a new entry lock-out. */
  reset(): void { this.lock.reset(); this.set.clear() }

  /**
   * Draws the screen into `ctx` (the whole canvas in 1P, one half in 2P) and returns the action of
   * the button that fired this frame, if any. At most one action per frame (`updateExclusive`).
   */
  render(ctx: CanvasRenderingContext2D, entry: NameEntry, now: number, info: NameInfo): NameAction | null {
    const { width: W, height: H } = ctx.canvas
    const half = this.seat !== null
    ctx.save()
    ctx.fillStyle = 'rgba(13,0,20,0.9)'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const P = getPalette()
    const band = half ? [0.25, 0.75] : TEXT_BAND_1P
    const bandW = (band[1] - band[0]) * W
    const textTop = half ? 0.47 : 0

    if (entry.done) {
      ctx.font = `bold ${Math.round(fitFontPx(WAITING_TEXT, scaled(20), 0.9 * W, 12))}px sans-serif`
      ctx.fillStyle = '#e8e8f0'
      ctx.fillText(WAITING_TEXT, W / 2, H * 0.6)
      ctx.restore()
      return null
    }

    // 1P: title and name in the central band above the button rows; 2P: everything below the rows.
    const y = (f: number) => H * (textTop + (half ? (1 - textTop) * f : f))
    ctx.font = `${Math.round(fitFontPx(NAME_TITLE, scaled(half ? 26 : 34), half ? 0.9 * W : bandW, 12))}px ${TITLE_FONT_FAMILY}`
    ctx.fillStyle = P.score
    ctx.fillText(NAME_TITLE, W / 2, half ? y(0.1) : H * 0.1)

    const shown = entry.touched ? entry.text.padEnd(PICK_LEN, '_').slice(0, Math.max(PICK_LEN, entry.text.length)) : entry.text
    const namePx = Math.round(fitFontPx(shown, scaled(half ? 44 : 56), half ? 0.8 * W : bandW, 16))
    ctx.font = `bold ${namePx}px monospace`
    ctx.fillStyle = '#e8e8f0'
    const nameY = half ? y(0.32) : H * 0.27
    ctx.fillText(shown, W / 2, nameY)
    if (entry.touched) {
      // underline the letter the arrows change
      const glyph = namePx * 0.6
      const x0 = W / 2 - (shown.length * glyph) / 2 + entry.cursor * glyph
      ctx.fillStyle = P.score
      ctx.fillRect(x0 + 2, nameY + namePx * 0.55, glyph - 4, 4)
    }

    const sub = info.rank > 0 ? `Score ${info.score} • #${info.rank}` : `Score ${info.score}`
    ctx.font = `${Math.round(fitFontPx(sub, scaled(20), half ? 0.9 * W : 0.6 * W, 12))}px sans-serif`
    ctx.fillStyle = 'rgba(232,232,240,0.8)'
    ctx.fillText(sub, W / 2, half ? y(0.55) : H * 0.55)
    const hint = half ? NAME_HINT_2P : NAME_HINT
    ctx.font = `${Math.round(fitFontPx(hint, scaled(16), half ? 0.9 * W : 0.6 * W, 11))}px sans-serif`
    ctx.fillText(hint, W / 2, half ? y(0.72) : H * 0.63)

    const specs = areaButtons(half ? 'name2p' : 'name', W, H, this.seat)
    const buttons = this.set.sync(specs)
    const live = this.lock.touch(now)
    const won = updateExclusive(buttons, now, live)
    for (const b of buttons) b.render(ctx, now)
    ctx.restore()
    if (won < 0) return null
    const step = nameStepOf(specs[won])
    return step === 0 ? { kind: 'ok' } : { kind: 'step', dir: step }
  }
}
