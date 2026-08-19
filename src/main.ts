import './style.css'
import type { ConvertOptions, DitherMode, DownscaleMode, BayerSize, Palette, PixelImage } from './types'
import { PALETTES, getPalette, hexToPaletteColor } from './palettes/palettes'
import { parsePaletteText } from './palettes/parse'
import { medianCutPalette } from './palettes/adaptive'
import { downscale } from './downscale/downscale'
import { quantizeImage } from './pipeline'

// --- DOM 参照 ---
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el as T
}

const dropzone = $('dropzone')
const fileInput = $<HTMLInputElement>('fileInput')
const outW = $<HTMLInputElement>('outW')
const outH = $<HTMLInputElement>('outH')
const paletteSelect = $<HTMLSelectElement>('paletteSelect')
const adaptiveRow = $('adaptiveRow')
const adaptiveCount = $<HTMLSelectElement>('adaptiveCount')
const swatches = $('swatches')
const editorSwatches = $('editorSwatches')
const addColorBtn = $<HTMLButtonElement>('addColor')
const customPaletteText = $<HTMLTextAreaElement>('customPalette')
// エディタ（レタッチ）
const paintColorInput = $<HTMLInputElement>('paintColor')
const editorToolbar = $('editorToolbar')
const undoBtn = $<HTMLButtonElement>('undoBtn')
const redoBtn = $<HTMLButtonElement>('redoBtn')
const flipHBtn = $<HTMLButtonElement>('flipH')
const flipVBtn = $<HTMLButtonElement>('flipV')
const gridToggle = $<HTMLInputElement>('gridToggle')
// フレーム / オニオン / モーダル
const outputFigure = $('outputFigure')
const previewGridEl = outputFigure.parentElement as HTMLElement
const framePrev = $<HTMLButtonElement>('framePrev')
const frameNext = $<HTMLButtonElement>('frameNext')
const frameLabel = $('frameLabel')
const frameDup = $<HTMLButtonElement>('frameDup')
const frameBlank = $<HTMLButtonElement>('frameBlank')
const frameDel = $<HTMLButtonElement>('frameDel')
const refMode = $<HTMLSelectElement>('refMode') // 透かし（下絵）: none/source/prev
const onionOpacity = $<HTMLInputElement>('onionOpacity')
const sheetExportBtn = $<HTMLButtonElement>('sheetExport')
const openModalBtn = $<HTMLButtonElement>('openModal')
const closeModalBtn = $<HTMLButtonElement>('closeModal')
const editModal = $('editModal')
const modalSlot = $('modalSlot')
const applyCustom = $<HTMLButtonElement>('applyCustom')
const customStatus = $('customStatus')
const ditherHelp = $('ditherHelp')
const bayerRow = $('bayerRow')
const bayerSize = $<HTMLSelectElement>('bayerSize')
const serpentineRow = $('serpentineRow')
const serpentine = $<HTMLInputElement>('serpentine')
const strength = $<HTMLInputElement>('strength')
const strengthVal = $('strengthVal')
const downscaleSel = $<HTMLSelectElement>('downscale')
const deltaModeSel = $<HTMLSelectElement>('deltaMode')
const exportScaleSel = $<HTMLSelectElement>('exportScale')
const exportSizeLabel = $('exportSizeLabel')
const exportBtn = $<HTMLButtonElement>('exportBtn')
const srcCanvas = $<HTMLCanvasElement>('srcCanvas')
const outCanvas = $<HTMLCanvasElement>('outCanvas')
const outLabel = $('outLabel')
const emptyState = $('emptyState')
const toast = $('toast')
const infoSrc = $('infoSrc')
const infoOut = $('infoOut')
const infoColors = $('infoColors')
const infoExport = $('infoExport')
const infoTime = $('infoTime')

// iOS Safari 等の canvas 面積上限（概ね 4096²=16.7Mpx）を避けるため、長辺をこの値以下へ縮小して取り込む。
// ドット絵化は最終的に 16〜256px へ縮小するため、2048 で十分な品質。
const SAFE_DIM = 2048
const HARD_MAX_MP = 100 // これを超える巨大画像は取り込み拒否（デコード直後に判定）
const HARD_MAX_AREA = HARD_MAX_MP * 1_000_000

// --- 状態 ---
let sourceImage: PixelImage | null = null
let customPal: Palette | null = null
let lastAdaptive: Palette | null = null
let lastResult: PixelImage | null = null // = frames[currentFrame]（現在編集中のフレーム）

// --- フレーム / モーダル ---
let frames: PixelImage[] = []
let currentFrame = 0
let isModal = false

// --- レタッチ・エディタ状態 ---
type Tool = 'pencil' | 'eraser' | 'bucket' | 'eyedropper'
let tool: Tool = 'pencil'
let paint = { r: 0, g: 0, b: 0 } // 描く色
let selectedSwatch = -1 // 選択中スウォッチの index（同色重複でも1つだけ強調）
let showGrid = false
let painting = false
let paintInitialized = false
let lastPx = -1
let lastPy = -1
const undoStack: Uint8ClampedArray[] = []
const redoStack: Uint8ClampedArray[] = []
const MAX_HISTORY = 40

const DITHER_HELP: Record<DitherMode, string> = {
  none: 'いちばん近い色に置き換えます。輪郭くっきりで、小さいドット絵はこれが基本。',
  ordered: '規則的な網目模様を重ねて中間色を表現します。均一でレトロな質感。',
  fs: 'ドットを細かく散らして自然に色を混ぜます。写真やグラデーション向き。',
}

// --- パレット選択肢を構築（先頭に「画像から自動生成」） ---
const adaptiveOpt = document.createElement('option')
adaptiveOpt.value = '__adaptive'
adaptiveOpt.textContent = '画像から自動生成'
paletteSelect.appendChild(adaptiveOpt)
for (const p of PALETTES) {
  const opt = document.createElement('option')
  opt.value = p.id
  opt.textContent = p.name
  paletteSelect.appendChild(opt)
}
paletteSelect.value = '__adaptive' // 既定はどんな画像にも合う自動生成

const FALLBACK_PALETTE = getPalette('endesga32') ?? PALETTES[0]

function activePalette(): Palette {
  if (paletteSelect.value === '__custom' && customPal) return customPal
  if (paletteSelect.value === '__adaptive') return lastAdaptive ?? FALLBACK_PALETTE
  return getPalette(paletteSelect.value) ?? PALETTES[0]
}

function isAdaptive(): boolean {
  return paletteSelect.value === '__adaptive'
}

function updatePaletteUI(): void {
  adaptiveRow.hidden = !isAdaptive()
}

const hex = (n: number) => n.toString(16).padStart(2, '0')
const toHex = (c: { r: number; g: number; b: number }) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`

function renderSwatches(pal: Palette): void {
  swatches.innerHTML = ''
  pal.colors.forEach((c, i) => {
    const sw = document.createElement('button')
    sw.type = 'button'
    sw.className = 'swatch'
    // 左（変換用）パレットは描く色の選択リングを出さない（編集側と連動させない）
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`
    sw.setAttribute('role', 'listitem')
    sw.setAttribute('aria-label', `変換色 ${i + 1}: ${toHex(c)}（右クリックで削除）`)
    sw.title = `${toHex(c)} — この色に変換されます（右クリックで削除）`
    sw.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      deleteColor(i)
    })
    swatches.appendChild(sw)
  })
}

// index を渡すとそのスウォッチを選択状態に（同色重複対策）。省略時は最初の一致 or 非選択。
function setPaintColor(r: number, g: number, b: number, index = -1): void {
  paint = { r, g, b }
  paintColorInput.value = toHex(paint)
  const cur = activePalette()
  selectedSwatch =
    index >= 0 ? index : cur.colors.findIndex((c) => c.r === r && c.g === g && c.b === b)
  renderSwatchesActiveOnly(cur)
}

// 編集エリア側のスウォッチ（描く色の候補・クリックで選択のみ）
function renderEditorSwatches(pal: Palette): void {
  editorSwatches.innerHTML = ''
  pal.colors.forEach((c, i) => {
    const sw = document.createElement('button')
    sw.type = 'button'
    sw.className = 'swatch'
    if (i === selectedSwatch) sw.classList.add('active')
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`
    sw.setAttribute('role', 'listitem')
    sw.setAttribute('aria-label', `色 ${i + 1}: ${toHex(c)}`)
    sw.title = `${toHex(c)}`
    sw.addEventListener('click', () => setPaintColor(c.r, c.g, c.b, i))
    editorSwatches.appendChild(sw)
  })
}

// 左パネルと編集エリアの両スウォッチを更新
function renderPalette(pal: Palette): void {
  renderSwatches(pal)
  renderEditorSwatches(pal)
}

// スウォッチの active 表示だけ更新（再生成せず軽量に・両コンテナ）
function renderSwatchesActiveOnly(pal: Palette): void {
  // 選択リングは編集側パレットのみ（左の変換用パレットには出さない）
  const nodes = editorSwatches.querySelectorAll<HTMLElement>('.swatch')
  pal.colors.forEach((_c, i) => {
    const node = nodes[i]
    if (!node) return
    node.classList.toggle('active', i === selectedSwatch)
  })
}

// 現在のパレットを編集可能な自作パレットへ引き上げる
function ensureCustom(): Palette {
  if (paletteSelect.value === '__custom' && customPal) return customPal
  const base = activePalette()
  customPal = { id: '__custom', name: `自作パレット (${base.colors.length}色)`, colors: [...base.colors] }
  let opt = Array.from(paletteSelect.options).find((o) => o.value === '__custom')
  if (!opt) {
    opt = document.createElement('option')
    opt.value = '__custom'
    paletteSelect.appendChild(opt)
  }
  opt.textContent = customPal.name
  paletteSelect.value = '__custom'
  return customPal
}

function refreshCustomLabel(): void {
  if (!customPal) return
  customPal.name = `自作パレット (${customPal.colors.length}色)`
  const opt = Array.from(paletteSelect.options).find((o) => o.value === '__custom')
  if (opt) opt.textContent = customPal.name
}

function deleteColor(index: number): void {
  const pal = ensureCustom()
  if (pal.colors.length <= 1) {
    showToast('最低1色は必要です')
    return
  }
  pal.colors.splice(index, 1)
  refreshCustomLabel()
  renderPalette(pal)
  scheduleRender()
}

// 現在の描く色をパレットへ追加
addColorBtn.addEventListener('click', () => {
  const pal = ensureCustom()
  pal.colors.push(hexToPaletteColor(toHex(paint)))
  refreshCustomLabel()
  renderPalette(pal)
  scheduleRender()
})

// --- オプション読み取り ---
function currentDither(): DitherMode {
  return (document.querySelector('input[name="dither"]:checked') as HTMLInputElement).value as DitherMode
}

function readOptions(): ConvertOptions {
  return {
    targetW: clampInt(outW.value, 1, 2048, 16),
    targetH: clampInt(outH.value, 1, 2048, 16),
    downscale: downscaleSel.value as DownscaleMode,
    palette: activePalette(),
    dither: currentDither(),
    bayerSize: Number(bayerSize.value) as BayerSize,
    deltaMode: deltaModeSel.value as '76' | '2000',
    strength: Number(strength.value),
    serpentine: serpentine.checked,
  }
}

function clampInt(v: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// --- 画像読み込み ---
async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    showToast('画像ファイルを選んでください。')
    return
  }
  try {
    let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const origW = bmp.width
    const origH = bmp.height
    if (origW * origH > HARD_MAX_AREA) {
      bmp.close()
      showToast(`画像が大きすぎます（最大 ${HARD_MAX_MP}メガピクセル）。`)
      return
    }
    // 長辺が SAFE_DIM を超える場合は取り込み時に縮小（iOS の canvas 面積上限による無音破綻を防ぐ）
    if (origW > SAFE_DIM || origH > SAFE_DIM) {
      const scale = SAFE_DIM / Math.max(origW, origH)
      const rw = Math.max(1, Math.round(origW * scale))
      const rh = Math.max(1, Math.round(origH * scale))
      const resized = await createImageBitmap(bmp, {
        resizeWidth: rw,
        resizeHeight: rh,
        resizeQuality: 'high',
      })
      bmp.close()
      bmp = resized
    }
    const cv = document.createElement('canvas')
    cv.width = bmp.width
    cv.height = bmp.height
    const ctx = cv.getContext('2d')
    if (!ctx) throw new Error('canvas 2d コンテキストを取得できません')
    ctx.drawImage(bmp, 0, 0)
    const id = ctx.getImageData(0, 0, bmp.width, bmp.height)
    const w = bmp.width
    const h = bmp.height
    bmp.close()
    sourceImage = { width: id.width, height: id.height, data: id.data }
    infoSrc.textContent =
      w !== origW || h !== origH ? `${origW}×${origH}px → ${w}×${h}px` : `${w}×${h}px`
    emptyState.hidden = true
    document.body.classList.add('has-image')
    drawSource()
    scheduleRender() // 初回レンダ完了時に保存ボタンを有効化する
  } catch (err) {
    console.error(err)
    showToast('画像を読み込めませんでした（対応形式・破損をご確認ください）。')
  }
}

function drawSource(): void {
  if (!sourceImage) return
  srcCanvas.width = sourceImage.width
  srcCanvas.height = sourceImage.height
  const maxDim = 300
  const scale = Math.min(maxDim / sourceImage.width, maxDim / sourceImage.height, 1)
  srcCanvas.style.width = `${Math.round(sourceImage.width * scale)}px`
  srcCanvas.style.height = `${Math.round(sourceImage.height * scale)}px`
  srcCanvas.getContext('2d')!.putImageData(toImageData(sourceImage), 0, 0)
}

// --- 変換とプレビュー（rAF デバウンス） ---
let rafId = 0
function scheduleRender(): void {
  if (!sourceImage) return
  if (rafId) return
  outCanvas.setAttribute('aria-busy', 'true')
  rafId = requestAnimationFrame(() => {
    rafId = 0
    try {
      render()
    } catch (err) {
      console.error(err)
      showToast('変換に失敗しました。')
    }
    outCanvas.setAttribute('aria-busy', 'false')
  })
}

function render(): void {
  if (!sourceImage) return
  const opts = readOptions()
  const t0 = performance.now()
  const small = downscale(sourceImage, opts.targetW, opts.targetH, opts.downscale)

  // 自動生成パレットは縮小後の画像から作る（画像内の代表色にフィット）
  let palette = opts.palette
  if (isAdaptive()) {
    palette = medianCutPalette(small, Number(adaptiveCount.value))
    lastAdaptive = palette
    renderPalette(palette)
  }

  // 初回は描く色をパレット先頭色にしておく（黒固定より編集しやすい）
  if (!paintInitialized && palette.colors.length) {
    const c0 = palette.colors[0]
    setPaintColor(c0.r, c0.g, c0.b, 0)
    paintInitialized = true
  }

  const result = quantizeImage(small, { ...opts, palette })
  // フレームに反映（サイズ変更時はフレーム一式をリセット、それ以外は現在フレームを置換）
  if (frames.length === 0 || frames[0].width !== result.width || frames[0].height !== result.height) {
    frames = [result]
    currentFrame = 0
  } else {
    frames[currentFrame] = result
  }
  lastResult = frames[currentFrame]
  const ms = performance.now() - t0

  outLabel.textContent = `${opts.targetW}×${opts.targetH}`
  resetHistory() // 再変換で編集内容は破棄される
  drawOutput()
  updateFrameUI()

  infoOut.textContent = `${opts.targetW}×${opts.targetH}px`
  infoColors.textContent = `${palette.colors.length}色`
  infoTime.textContent = `${ms.toFixed(1)}ms`
  updateExportSizeLabel()
  // 初回レンダ完了＝lastResult 確定後に編集系を有効化
  exportBtn.disabled = false
  flipHBtn.disabled = false
  flipVBtn.disabled = false
}

function updateExportSizeLabel(): void {
  const w = clampInt(outW.value, 1, 2048, 16)
  const h = clampInt(outH.value, 1, 2048, 16)
  const scale = Number(exportScaleSel.value)
  const label = `${w * scale}×${h * scale}px`
  exportSizeLabel.textContent = label
  infoExport.textContent = sourceImage ? label : '—'
}

// 表示ズーム。通常は最大300px、拡大編集モーダル中はビューポートに合わせて大きく。
function editZoom(): number {
  if (!lastResult) return 1
  const maxDim = isModal
    ? Math.min(window.innerWidth * 0.6, window.innerHeight * 0.78)
    : 320
  return Math.max(1, Math.min(40, Math.floor(maxDim / Math.max(lastResult.width, lastResult.height))))
}

let currentZoom = 1
function drawOutput(): void {
  if (!lastResult) return
  currentZoom = editZoom()
  const zoom = currentZoom
  outCanvas.width = lastResult.width * zoom
  outCanvas.height = lastResult.height * zoom
  const ctx = outCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, outCanvas.width, outCanvas.height)
  // 透かし（下絵）: 参照画像を薄く下に敷く。元画像 or 前フレーム。
  const rm = refMode.value
  const alpha = Number(onionOpacity.value)
  if (rm === 'source' && sourceImage) {
    ctx.globalAlpha = alpha
    ctx.imageSmoothingEnabled = true // 写真はなめらかに敷く（位置合わせの下絵用）
    ctx.drawImage(imageToCanvas(sourceImage), 0, 0, outCanvas.width, outCanvas.height)
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = 1
  } else if (rm === 'prev' && currentFrame > 0 && frames[currentFrame - 1]) {
    ctx.globalAlpha = alpha
    ctx.drawImage(imageToCanvas(frames[currentFrame - 1]), 0, 0, outCanvas.width, outCanvas.height)
    ctx.globalAlpha = 1
  }
  ctx.drawImage(imageToCanvas(lastResult), 0, 0, outCanvas.width, outCanvas.height)
  if (showGrid && zoom >= 4) drawGrid()
}

function drawGrid(): void {
  if (!lastResult) return
  const ctx = outCanvas.getContext('2d')!
  ctx.strokeStyle = 'rgba(128,128,128,0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= lastResult.width; x++) {
    const px = x * currentZoom + 0.5
    ctx.moveTo(px, 0)
    ctx.lineTo(px, outCanvas.height)
  }
  for (let y = 0; y <= lastResult.height; y++) {
    const py = y * currentZoom + 0.5
    ctx.moveTo(0, py)
    ctx.lineTo(outCanvas.width, py)
  }
  ctx.stroke()
}

function imageToCanvas(img: PixelImage): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d')!.putImageData(toImageData(img), 0, 0)
  return c
}

function toImageData(img: PixelImage): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height)
}

// --- 書き出し ---
function exportPng(): void {
  // 保留中の描画があれば先に確定させ、ラベル表示とダウンロード内容の食い違いを防ぐ
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
    try {
      render()
    } catch (err) {
      console.error(err)
    }
    outCanvas.setAttribute('aria-busy', 'false')
  }
  const result = lastResult
  if (!result) {
    showToast('先に画像を読み込んでください')
    return
  }
  const scale = Number(exportScaleSel.value)
  const small = imageToCanvas(result)
  const out = document.createElement('canvas')
  out.width = result.width * scale
  out.height = result.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, out.width, out.height)

  const name = `pixelforge_${result.width}x${result.height}_x${scale}.png`
  out.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    // ダウンロード開始前に revoke するとブラウザによっては失敗するため次tickへ遅延
    setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(`${name} を保存しました`)
  }, 'image/png')
}

// --- トースト ---
let toastTimer = 0
function showToast(msg: string): void {
  toast.textContent = msg
  toast.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.hidden = true), 2600)
}

// --- UI イベント ---
function updateVisibility(): void {
  const dither = currentDither()
  bayerRow.hidden = dither !== 'ordered'
  serpentineRow.hidden = dither !== 'fs'
  ditherHelp.textContent = DITHER_HELP[dither]
}

;['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault()
    dropzone.classList.add('dragover')
  })
)
;['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault()
    dropzone.classList.remove('dragover')
  })
)
dropzone.addEventListener('drop', (e) => {
  const dt = (e as DragEvent).dataTransfer
  if (dt?.files?.[0]) void loadFile(dt.files[0])
})
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) void loadFile(fileInput.files[0])
})

const rerenderEls = [outW, outH, bayerSize, strength, downscaleSel, deltaModeSel, serpentine, adaptiveCount]
rerenderEls.forEach((el) => el.addEventListener('input', onControlChange))
exportScaleSel.addEventListener('input', updateExportSizeLabel)
document
  .querySelectorAll('input[name="dither"]')
  .forEach((el) => el.addEventListener('change', onControlChange))
document.querySelectorAll<HTMLElement>('.presets .btn[data-w]').forEach((chip) =>
  chip.addEventListener('click', () => {
    outW.value = chip.dataset.w ?? '16'
    outH.value = chip.dataset.h ?? '16'
    onControlChange()
  })
)

// 「元のサイズ」: 読み込んだ画像の解像度そのままで変換・編集（縮小しない）
$<HTMLButtonElement>('origSize').addEventListener('click', () => {
  if (!sourceImage) {
    showToast('先に画像を読み込んでください')
    return
  }
  outW.value = String(sourceImage.width)
  outH.value = String(sourceImage.height)
  onControlChange()
})

function onControlChange(): void {
  strengthVal.textContent = Number(strength.value).toFixed(2)
  updateVisibility()
  updateExportSizeLabel()
  scheduleRender()
}

paletteSelect.addEventListener('change', () => {
  updatePaletteUI()
  if (isAdaptive()) swatches.innerHTML = '' // 生成後に render() で埋める
  else renderPalette(activePalette())
  scheduleRender()
})

applyCustom.addEventListener('click', () => {
  const pal = parsePaletteText(customPaletteText.value, '自作パレット')
  if (!pal) {
    customStatus.textContent = '色が見つかりません'
    return
  }
  customPal = pal
  let opt = Array.from(paletteSelect.options).find((o) => o.value === '__custom')
  if (!opt) {
    opt = document.createElement('option')
    opt.value = '__custom'
    paletteSelect.appendChild(opt)
  }
  opt.textContent = `自作パレット (${pal.colors.length}色)`
  paletteSelect.value = '__custom'
  customStatus.textContent = `${pal.colors.length}色を読み込みました`
  renderPalette(pal)
  scheduleRender()
})

exportBtn.addEventListener('click', exportPng)

// ============================================================
// レタッチ・エディタ（出力画像をピクセル単位で編集）
// ============================================================

function eventToPixel(e: PointerEvent): { x: number; y: number } | null {
  if (!lastResult) return null
  const rect = outCanvas.getBoundingClientRect()
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * lastResult.width)
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * lastResult.height)
  if (x < 0 || y < 0 || x >= lastResult.width || y >= lastResult.height) return null
  return { x, y }
}

function paintPixel(x: number, y: number): void {
  if (!lastResult) return
  const i = (y * lastResult.width + x) * 4
  const d = lastResult.data
  if (tool === 'eraser') {
    d[i + 3] = 0
  } else {
    d[i] = paint.r
    d[i + 1] = paint.g
    d[i + 2] = paint.b
    d[i + 3] = 255
  }
}

// 2点間を線で塗る（ドラッグ時の隙間防止・Bresenham）
function strokeLine(x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (;;) {
    paintPixel(x, y)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

function pickColor(x: number, y: number): void {
  if (!lastResult) return
  const i = (y * lastResult.width + x) * 4
  const d = lastResult.data
  if (d[i + 3] === 0) return // 透明はスポイトしない
  setPaintColor(d[i], d[i + 1], d[i + 2])
  selectTool('pencil') // スポイト後はペンに戻す
}

function bucketFill(sx: number, sy: number): void {
  if (!lastResult) return
  const w = lastResult.width
  const h = lastResult.height
  const d = lastResult.data
  const si = (sy * w + sx) * 4
  const tr = d[si]
  const tg = d[si + 1]
  const tb = d[si + 2]
  const ta = d[si + 3]
  const nr = tool === 'eraser' ? tr : paint.r
  const ng = tool === 'eraser' ? tg : paint.g
  const nb = tool === 'eraser' ? tb : paint.b
  const na = tool === 'eraser' ? 0 : 255
  if (tr === nr && tg === ng && tb === nb && ta === na) return // 変化なし
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const i = (y * w + x) * 4
    if (d[i] !== tr || d[i + 1] !== tg || d[i + 2] !== tb || d[i + 3] !== ta) continue
    d[i] = nr
    d[i + 1] = ng
    d[i + 2] = nb
    d[i + 3] = na
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
}

// --- 履歴 ---
function pushUndo(): void {
  if (!lastResult) return
  undoStack.push(lastResult.data.slice())
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack.length = 0
  updateUndoRedo()
}
function undo(): void {
  if (!lastResult || undoStack.length === 0) return
  redoStack.push(lastResult.data.slice())
  lastResult.data.set(undoStack.pop()!)
  drawOutput()
  updateUndoRedo()
}
function redo(): void {
  if (!lastResult || redoStack.length === 0) return
  undoStack.push(lastResult.data.slice())
  lastResult.data.set(redoStack.pop()!)
  drawOutput()
  updateUndoRedo()
}
function resetHistory(): void {
  undoStack.length = 0
  redoStack.length = 0
  updateUndoRedo()
}
function updateUndoRedo(): void {
  undoBtn.disabled = undoStack.length === 0
  redoBtn.disabled = redoStack.length === 0
}

// --- ポインタ操作 ---
outCanvas.addEventListener('pointerdown', (e) => {
  if (!lastResult) return
  const p = eventToPixel(e)
  if (!p) return
  e.preventDefault()
  if (tool === 'eyedropper') {
    pickColor(p.x, p.y)
    return
  }
  if (tool === 'bucket') {
    pushUndo()
    bucketFill(p.x, p.y)
    drawOutput()
    return
  }
  pushUndo()
  painting = true
  lastPx = p.x
  lastPy = p.y
  outCanvas.setPointerCapture(e.pointerId)
  paintPixel(p.x, p.y)
  drawOutput()
})
outCanvas.addEventListener('pointermove', (e) => {
  if (!painting || !lastResult) return
  const p = eventToPixel(e)
  if (!p) return
  strokeLine(lastPx, lastPy, p.x, p.y)
  lastPx = p.x
  lastPy = p.y
  drawOutput()
})
const endStroke = () => {
  painting = false
}
outCanvas.addEventListener('pointerup', endStroke)
outCanvas.addEventListener('pointercancel', endStroke)

// --- ツール選択 ---
function selectTool(t: Tool): void {
  tool = t
  editorToolbar.querySelectorAll<HTMLElement>('.tool').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === t)
  })
  updateCanvasCursor()
}
editorToolbar.querySelectorAll<HTMLElement>('.tool').forEach((btn) => {
  btn.addEventListener('click', () => selectTool(btn.dataset.tool as Tool))
})
// ツール別カーソル（SVGデータURI・ホットスポット付き）
const CURSORS: Record<Tool, { svg: string; hx: number; hy: number; fb: string }> = {
  pencil: {
    svg: "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><path d='M2 16l1-4L12 3l3 3L7 15z' fill='#ffd54a' stroke='#000'/><path d='M11 4l3 3' stroke='#000'/></svg>",
    hx: 1,
    hy: 16,
    fb: 'crosshair',
  },
  eraser: {
    svg: "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><rect x='2' y='6' width='12' height='8' rx='1.5' fill='#ff9a9a' stroke='#000'/></svg>",
    hx: 8,
    hy: 10,
    fb: 'cell',
  },
  bucket: {
    svg: "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><path d='M3 9l6-6 6 6-6 6z' fill='#7fb0ff' stroke='#000'/><path d='M15 12c1.2 1.2 1.2 3 0 3s-1.2-1.8 0-3z' fill='#7fb0ff' stroke='#000'/></svg>",
    hx: 9,
    hy: 15,
    fb: 'copy',
  },
  eyedropper: {
    svg: "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><path d='M2 16l1-3 8-8 2 2-8 8z' fill='#bde0fe' stroke='#000'/><rect x='11' y='1' width='5' height='4' rx='1' transform='rotate(45 13 3)' fill='#999' stroke='#000'/></svg>",
    hx: 1,
    hy: 16,
    fb: 'crosshair',
  },
}
function updateCanvasCursor(): void {
  const c = CURSORS[tool]
  outCanvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(c.svg)}") ${c.hx} ${c.hy}, ${c.fb}`
}

paintColorInput.addEventListener('input', () => {
  const c = hexToPaletteColor(paintColorInput.value)
  setPaintColor(c.r, c.g, c.b)
})
gridToggle.addEventListener('change', () => {
  showGrid = gridToggle.checked
  drawOutput()
})
undoBtn.addEventListener('click', undo)
redoBtn.addEventListener('click', redo)

// --- 反転（左右／上下） ---
function flipHorizontal(): void {
  if (!lastResult) return
  const { width: w, height: h, data: d } = lastResult
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w >> 1; x++) {
      const a = (y * w + x) * 4
      const b = (y * w + (w - 1 - x)) * 4
      for (let k = 0; k < 4; k++) {
        const t = d[a + k]
        d[a + k] = d[b + k]
        d[b + k] = t
      }
    }
  }
}
function flipVertical(): void {
  if (!lastResult) return
  const { width: w, height: h, data: d } = lastResult
  const row = w * 4
  const tmp = new Uint8ClampedArray(row)
  for (let y = 0; y < h >> 1; y++) {
    const top = y * row
    const bot = (h - 1 - y) * row
    tmp.set(d.subarray(top, top + row))
    d.copyWithin(top, bot, bot + row)
    d.set(tmp, bot)
  }
}
flipHBtn.addEventListener('click', () => {
  if (!lastResult) return
  pushUndo()
  flipHorizontal()
  drawOutput()
})
flipVBtn.addEventListener('click', () => {
  if (!lastResult) return
  pushUndo()
  flipVertical()
  drawOutput()
})
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
    e.preventDefault()
    redo()
  }
})

// ============================================================
// フレーム（アニメ用）＋ オニオンスキン ＋ 拡大モーダル
// ============================================================
function copyFrame(f: PixelImage): PixelImage {
  return { width: f.width, height: f.height, data: f.data.slice() }
}
function blankFrame(w: number, h: number): PixelImage {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
}
function gotoFrame(i: number): void {
  currentFrame = Math.max(0, Math.min(frames.length - 1, i))
  lastResult = frames[currentFrame]
  resetHistory()
  drawOutput()
  updateFrameUI()
}
function updateFrameUI(): void {
  const n = frames.length
  frameLabel.textContent = `${n === 0 ? 0 : currentFrame + 1} / ${n}`
  const has = n > 0 && !!lastResult
  framePrev.disabled = currentFrame <= 0
  frameNext.disabled = currentFrame >= n - 1
  frameDel.disabled = n <= 1
  frameDup.disabled = !has
  frameBlank.disabled = !has
  sheetExportBtn.disabled = !has
  openModalBtn.disabled = !has
}

framePrev.addEventListener('click', () => gotoFrame(currentFrame - 1))
frameNext.addEventListener('click', () => gotoFrame(currentFrame + 1))
frameDup.addEventListener('click', () => {
  if (!lastResult) return
  frames.splice(currentFrame + 1, 0, copyFrame(lastResult))
  gotoFrame(currentFrame + 1)
})
frameBlank.addEventListener('click', () => {
  if (!lastResult) return
  frames.splice(currentFrame + 1, 0, blankFrame(lastResult.width, lastResult.height))
  gotoFrame(currentFrame + 1)
})
frameDel.addEventListener('click', () => {
  if (frames.length <= 1) return
  frames.splice(currentFrame, 1)
  gotoFrame(Math.min(currentFrame, frames.length - 1))
})
refMode.addEventListener('change', drawOutput)
onionOpacity.addEventListener('input', drawOutput)

// スプライトシート書き出し（全フレームを横並び）
sheetExportBtn.addEventListener('click', () => {
  if (frames.length === 0) return
  const scale = Number(exportScaleSel.value)
  const w = frames[0].width
  const h = frames[0].height
  const sheet = document.createElement('canvas')
  sheet.width = w * frames.length * scale
  sheet.height = h * scale
  const ctx = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  frames.forEach((f, i) => {
    ctx.drawImage(imageToCanvas(f), i * w * scale, 0, w * scale, h * scale)
  })
  const name = `pixelforge_sheet_${frames.length}f_${w}x${h}_x${scale}.png`
  sheet.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(`${name} を保存しました`)
  }, 'image/png')
})

// 拡大編集モーダル: 出力figureをモーダルへ移動して大きく編集
function openModal(): void {
  if (!lastResult) return
  modalSlot.appendChild(outputFigure)
  editModal.hidden = false
  isModal = true
  drawOutput()
}
function closeModal(): void {
  previewGridEl.appendChild(outputFigure) // 入力figureの後ろ（2番目）に戻る
  editModal.hidden = true
  isModal = false
  drawOutput()
}
openModalBtn.addEventListener('click', openModal)
closeModalBtn.addEventListener('click', closeModal)
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeModal() // 背景クリックで閉じる
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isModal) closeModal()
})

// --- 初期表示 ---
updatePaletteUI()
updateVisibility()
updateExportSizeLabel()
setPaintColor(paint.r, paint.g, paint.b)
updateCanvasCursor()
updateUndoRedo()
updateFrameUI()
if (!isAdaptive()) renderPalette(activePalette())
