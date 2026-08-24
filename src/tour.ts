// 外部ライブラリ非依存の軽量ガイドツアー（スポットライト＋吹き出し）。
// 設計方針（操作を妨げない）:
//  - 暗転マスクは pointer-events:none。下の要素は常にクリック/操作できる（全画面ブロックしない）。
//  - いつでも「スキップ / ×閉じる / Esc」で終了できる。強制しない。
//  - 初回のみ自動起動（localStorage）。以後は「? 使い方」ボタンから任意起動。
//  - 各ステップで対象モードへ自動切替し、対象要素をスポットライト。
//  - モバイルは吹き出しを画面下部のシートとして出す。

type Mode = 'convert' | 'edit' | 'anim' | 'tilemap'
interface Step {
  mode: Mode
  selector: string
  title: string
  body: string
}

const DONE_KEY = 'pf_tour_done'

const STEPS: Step[] = [
  {
    mode: 'convert',
    selector: '#appTabs',
    title: '全体の流れ',
    body: '上のタブは左から「変換 → 編集 → アニメ → タイルマップ」。同じ絵を引き継いで進む1本の流れです。各項目の見出しにある「?」で、いつでも詳しい説明が読めます。',
  },
  {
    mode: 'convert',
    selector: '#dropzone',
    title: 'まず画像を入れる',
    body: '写真やイラストをドラッグ＆ドロップ（または「白紙から作る」）。ここが出発点です。',
  },
  {
    mode: 'convert',
    selector: '#paletteSelect',
    title: '色とドットの粗さ',
    body: '迷ったら色は「画像から自動生成」、サイズは初期のままでOK。変更はすぐ右のプレビューに反映されます。',
  },
  {
    mode: 'convert',
    selector: '.tab[data-mode="edit"]',
    title: '手直しは「編集」タブで',
    body: '変換した絵をペンなどで直すのが「編集」タブ（最初から常にあります）。画像を読み込むと、出力の上に「編集タブで手直し」ボタンも現れ、そこからも移動できます。',
  },
  {
    mode: 'edit',
    selector: '#toolRail',
    title: 'ドットを描く・直す',
    body: 'ペン／消しゴム／塗りつぶし／直線などで1マスずつ調整。ホイールやピンチで拡大できます。',
  },
  {
    mode: 'anim',
    selector: '#frameBar',
    title: 'コマを増やす → アニメ／タイルへ',
    body: '「コマを複製」で少しずつ動かせばパラパラアニメに。増やしたコマは「タイルマップ」でそのまま並べられます。',
  },
]

// localStorage 例外安全（Safariプライベート等）
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 保存不可でも致命的でないので無視 */
  }
}

let gotoMode: (m: Mode) => void = () => {}
let index = 0
let root: HTMLElement | null = null
let spot: HTMLElement | null = null
let tip: HTMLElement | null = null
let ro: ResizeObserver | null = null
let raf = 0
let launcher: HTMLElement | null = null

function isMobile(): boolean {
  return window.innerWidth <= 820
}

function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

function buildDom(): void {
  root = el('div', 'tour-root')
  root.id = 'tourRoot'

  spot = el('div', 'tour-spot')
  spot.setAttribute('aria-hidden', 'true')

  tip = el('div', 'tour-tip')
  tip.setAttribute('role', 'dialog')
  tip.setAttribute('aria-modal', 'false')
  tip.setAttribute('aria-label', '使い方ガイド')

  root.appendChild(spot)
  root.appendChild(tip)
  document.body.appendChild(root)
}

function renderTip(): void {
  if (!tip) return
  const step = STEPS[index]
  const total = STEPS.length
  const dots = STEPS.map((_, i) => `<span class="tour-dot${i === index ? ' on' : ''}"></span>`).join('')
  tip.innerHTML = `
    <button class="tour-close" type="button" aria-label="閉じる">×</button>
    <div class="tour-title">${step.title}</div>
    <div class="tour-body">${step.body}</div>
    <div class="tour-foot">
      <span class="tour-progress" aria-live="polite">${index + 1} / ${total}</span>
      <span class="tour-dots" aria-hidden="true">${dots}</span>
      <span class="tour-actions">
        <button class="tour-skip" type="button">スキップ</button>
        <button class="tour-prev" type="button"${index === 0 ? ' disabled' : ''}>戻る</button>
        <button class="tour-next" type="button">${index === total - 1 ? '完了' : '次へ'}</button>
      </span>
    </div>`
  tip.querySelector('.tour-close')!.addEventListener('click', () => end())
  tip.querySelector('.tour-skip')!.addEventListener('click', () => end())
  tip.querySelector('.tour-prev')!.addEventListener('click', () => go(index - 1))
  tip.querySelector('.tour-next')!.addEventListener('click', () => {
    if (index === total - 1) end()
    else go(index + 1)
  })
}

// 対象要素の矩形からスポットライトと吹き出しを配置
function position(): void {
  if (!spot || !tip) return
  const step = STEPS[index]
  const target = document.querySelector<HTMLElement>(step.selector)
  const rect = target?.getBoundingClientRect()
  const visible = !!rect && rect.width > 0 && rect.height > 0

  if (visible && rect) {
    const pad = 6
    spot.style.display = 'block'
    spot.style.left = `${rect.left - pad}px`
    spot.style.top = `${rect.top - pad}px`
    spot.style.width = `${rect.width + pad * 2}px`
    spot.style.height = `${rect.height + pad * 2}px`
  } else {
    // 対象が無い/隠れている → スポットライト無しで中央に案内（フォールバック）
    spot.style.display = 'none'
  }

  if (isMobile()) {
    tip.classList.add('tour-tip--sheet')
    tip.style.left = ''
    tip.style.top = ''
    return
  }
  tip.classList.remove('tour-tip--sheet')
  const tw = tip.offsetWidth || 320
  const th = tip.offsetHeight || 160
  const margin = 12
  let left: number
  let top: number
  if (visible && rect) {
    // 下 → 上 の順で空きを探す
    if (rect.bottom + margin + th <= window.innerHeight) top = rect.bottom + margin
    else if (rect.top - margin - th >= 0) top = rect.top - margin - th
    else top = Math.max(margin, (window.innerHeight - th) / 2)
    left = rect.left + rect.width / 2 - tw / 2
  } else {
    top = (window.innerHeight - th) / 2
    left = (window.innerWidth - tw) / 2
  }
  left = Math.max(margin, Math.min(window.innerWidth - tw - margin, left))
  top = Math.max(margin, Math.min(window.innerHeight - th - margin, top))
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
}

function schedulePosition(): void {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    position()
  })
}

function observeTarget(): void {
  ro?.disconnect()
  const target = document.querySelector<HTMLElement>(STEPS[index].selector)
  if (target && 'ResizeObserver' in window) {
    ro = new ResizeObserver(() => schedulePosition())
    ro.observe(target)
  }
}

function go(i: number): void {
  index = Math.max(0, Math.min(STEPS.length - 1, i))
  const step = STEPS[index]
  gotoMode(step.mode)
  renderTip()
  // モード切替後はレイアウト確定に rAF を数回待ってから配置
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(step.selector)
      target?.scrollIntoView({ block: 'center', inline: 'nearest' })
      requestAnimationFrame(() => {
        position()
        observeTarget()
        ;(tip?.querySelector('.tour-next') as HTMLElement | null)?.focus()
      })
    })
  })
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    end()
  } else if (e.key === 'ArrowRight') {
    go(index + 1)
  } else if (e.key === 'ArrowLeft') {
    go(index - 1)
  }
}

export function startTour(): void {
  if (root) return // 多重起動防止
  index = 0
  buildDom()
  window.addEventListener('resize', schedulePosition)
  window.addEventListener('scroll', schedulePosition, true) // ネストしたスクロールも拾う
  window.addEventListener('keydown', onKey)
  launcher?.setAttribute('aria-expanded', 'true')
  go(0)
}

function end(): void {
  window.removeEventListener('resize', schedulePosition)
  window.removeEventListener('scroll', schedulePosition, true)
  window.removeEventListener('keydown', onKey)
  ro?.disconnect()
  ro = null
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  root?.remove()
  root = null
  spot = null
  tip = null
  lsSet(DONE_KEY, '1')
  launcher?.setAttribute('aria-expanded', 'false')
  launcher?.focus()
}

// 初期化: 「? 使い方」ボタンの配線＋初回自動起動
export function initTour(setMode: (m: Mode) => void): void {
  gotoMode = setMode
  launcher = document.getElementById('tourStart')
  launcher?.addEventListener('click', () => {
    if (root) end()
    else startTour()
  })
  // 初回のみ自動起動（未操作のとき）。操作を先に始めたら自動起動しない。
  if (!lsGet(DONE_KEY)) {
    let cancelled = false
    const cancel = () => {
      cancelled = true
    }
    // 最初の実操作を検知したら自動起動を取りやめ（押し付けない）
    window.addEventListener('pointerdown', cancel, { once: true, capture: true })
    window.setTimeout(() => {
      window.removeEventListener('pointerdown', cancel, { capture: true } as EventListenerOptions)
      if (!cancelled && !root) startTour()
    }, 900)
  }
}
