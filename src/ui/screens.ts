/**
 * UI screens — game-over overlay and webcam error screen, injected as HTML
 * into #ui so they sit above the canvases.
 */

const ui = (): HTMLElement => document.getElementById('ui')!

// ─── Game Over ────────────────────────────────────────────────────────────────

let gameOverEl: HTMLElement | null = null

export function showGameOver(score: number, onRestart: () => void): void {
  if (gameOverEl) return // already showing

  const div = document.createElement('div')
  div.className = 'screen-gameover'
  div.innerHTML = `
    <h1>GAME OVER</h1>
    <p class="final-score">Score: ${score}</p>
    <button type="button">Play Again</button>
  `

  div.querySelector('button')!.addEventListener('click', () => {
    hideGameOver()
    onRestart()
  })

  gameOverEl = div
  ui().appendChild(div)
}

export function hideGameOver(): void {
  if (gameOverEl) {
    gameOverEl.remove()
    gameOverEl = null
  }
}

// ─── Webcam error ─────────────────────────────────────────────────────────────

let errorEl: HTMLElement | null = null

export function showWebcamError(onRetry: () => void): void {
  if (errorEl) return

  const div = document.createElement('div')
  div.className = 'screen-error'
  div.innerHTML = `
    <p>👻 Exorcise needs your webcam to work.<br>
    Please allow camera access and try again.</p>
    <button type="button">Try again</button>
  `

  div.querySelector('button')!.addEventListener('click', () => {
    hideWebcamError()
    onRetry()
  })

  errorEl = div
  ui().appendChild(div)
}

export function hideWebcamError(): void {
  if (errorEl) {
    errorEl.remove()
    errorEl = null
  }
}
