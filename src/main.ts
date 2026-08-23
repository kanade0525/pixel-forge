// スタイルは index.html の <link> で読み込む（描画前にCSS適用しFOUCを防ぐ）
import type { ConvertOptions, DitherMode, DownscaleMode, BayerSize, Palette, PixelImage } from './types'
import { PALETTES, getPalette, hexToPaletteColor } from './palettes/palettes'
import { parsePaletteText } from './palettes/parse'
import { medianCutPalette } from './palettes/adaptive'
import { downscale } from './downscale/downscale'
import { quantizeImage } from './pipeline'
import { makeZip } from './export/zip'

// --- DOM 参照 ---
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el as T
}

const dropzone = $('dropzone')
const fileInput = $<HTMLInputElement>('fileInput')
const newBlankBtn = $<HTMLButtonElement>('newBlank')
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
const bgEdgesBtn = $<HTMLButtonElement>('bgEdges')
const bgColorBtn = $<HTMLButtonElement>('bgColor')
const bgTol = $<HTMLSelectElement>('bgTol')
// フレーム / オニオン / モーダル
const outputFigure = $('outputFigure')
const previewGridEl = outputFigure.parentElement as HTMLElement
const frameBar = $('frameBar')
const framePrev = $<HTMLButtonElement>('framePrev')
const frameNext = $<HTMLButtonElement>('frameNext')
const frameLabel = $('frameLabel')
const frameDup = $<HTMLButtonElement>('frameDup')
const frameBlank = $<HTMLButtonElement>('frameBlank')
const frameDel = $<HTMLButtonElement>('frameDel')
const refMode = $<HTMLSelectElement>('refMode') // 透かし（下絵）: none/source/prev
const onionOpacity = $<HTMLInputElement>('onionOpacity')
const sheetExportBtn = $<HTMLButtonElement>('sheetExport')
const zipExportBtn = $<HTMLButtonElement>('zipExport')
const frameStrip = $('frameStrip')
const playBtn = $<HTMLButtonElement>('playBtn')
const fpsInput = $<HTMLInputElement>('fpsInput')
const addImagesBtn = $<HTMLButtonElement>('addImages')
const addImagesInput = $<HTMLInputElement>('addImagesInput')
// 元画像の背景切り抜き
const bgSrcCut = $<HTMLButtonElement>('bgSrcCut')
const bgSrcReset = $<HTMLButtonElement>('bgSrcReset')
const bgSrcTol = $<HTMLSelectElement>('bgSrcTol')
const openModalBtn = $<HTMLButtonElement>('openModal')
const toEditBtn = $<HTMLButtonElement>('toEdit')
const exportEditBtn = $<HTMLButtonElement>('exportEdit')
const outHint = $('outHint')
// AI生成（Gemini・同一オリジンの /api/generate 経由）
const aiPanel = $<HTMLDetailsElement>('aiPanel')
const aiPrompt = $<HTMLTextAreaElement>('aiPrompt')
const aiUseImage = $<HTMLInputElement>('aiUseImage')
const aiGenerateBtn = $<HTMLButtonElement>('aiGenerate')
const aiStatus = $('aiStatus')
const closeModalBtn = $<HTMLButtonElement>('closeModal')
const editModal = $('editModal')
const modalSlot = $('modalSlot')
// タイルマップ
const tilemapPanel = $('tilemapPanel')
// モードタブ
const appTabs = $('appTabs')
const convertControls = $('convertControls')
const inputFigure = $('inputFigure')
const editorPalette = $('editorPalette')
const infoCard = $('infoCard')
const tilePicker = $('tilePicker')
const mapCanvas = $<HTMLCanvasElement>('mapCanvas')
const mapEmpty = $('mapEmpty')
const mapColsInput = $<HTMLInputElement>('mapCols')
const mapRowsInput = $<HTMLInputElement>('mapRows')
const mapClearBtn = $<HTMLButtonElement>('mapClear')
const mapExportBtn = $<HTMLButtonElement>('mapExport')
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
const canvasWrap = $('canvasWrap')
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
let sourceOriginal: PixelImage | null = null // 背景切り抜き前の原本
let sourceBgCut = false // 元画像の背景切り抜きを適用中か
let customPal: Palette | null = null
// アニメ再生
let playTimer = 0
let playSavedFrame = 0
let playing = false
let lastAdaptive: Palette | null = null
let lastResult: PixelImage | null = null // = frames[currentFrame]（現在編集中のフレーム）

// --- フレーム / モーダル ---
let frames: PixelImage[] = []
let currentFrame = 0
let isModal = false
let sourceJustLoaded = false // 直前に新しい画像が読み込まれたか（frames を作り直す判定用）
let edited = false // 現在のコマを手描き編集したか（単一コマでも再変換で上書きしない保護用）

// --- タイルマップ ---
let mapCols = 8
let mapRows = 8
let mapData = new Int16Array(mapCols * mapRows).fill(-1) // 各セル = タイル(frame)index、-1=空
let selectedTile = 0 // 選択中タイル（frame index）、-1=消しゴム
let mapPainting = false

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
// コマごとに undo/redo を退避（コマを行き来しても、そのコマの手描き取り消しが消えないように）
const frameHistory = new WeakMap<PixelImage, { undo: Uint8ClampedArray[]; redo: Uint8ClampedArray[] }>()

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
  if (v.trim() === '') return fallback // 空欄は 0 ではなく既定値扱い（幅1pxへの無言丸めを防ぐ）
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// 画像ファイルを PixelImage にデコード（巨大画像は SAFE_DIM 以下へ縮小）。失敗時 null。
async function decodeToPixelImage(
  file: File
): Promise<{ img: PixelImage; origW: number; origH: number } | null> {
  if (!file.type.startsWith('image/')) return null
  let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const origW = bmp.width
  const origH = bmp.height
  if (origW * origH > HARD_MAX_AREA) {
    bmp.close()
    throw new Error('too-large')
  }
  if (origW > SAFE_DIM || origH > SAFE_DIM) {
    const scale = SAFE_DIM / Math.max(origW, origH)
    const resized = await createImageBitmap(bmp, {
      resizeWidth: Math.max(1, Math.round(origW * scale)),
      resizeHeight: Math.max(1, Math.round(origH * scale)),
      resizeQuality: 'high',
    })
    bmp.close()
    bmp = resized
  }
  const cv = document.createElement('canvas')
  cv.width = bmp.width
  cv.height = bmp.height
  const ctx = cv.getContext('2d')
  if (!ctx) {
    bmp.close()
    throw new Error('no-ctx')
  }
  ctx.drawImage(bmp, 0, 0)
  const id = ctx.getImageData(0, 0, bmp.width, bmp.height)
  bmp.close()
  return { img: { width: id.width, height: id.height, data: id.data }, origW, origH }
}

// --- 画像読み込み（単一。元画像として取り込み変換） ---
async function loadFile(file: File): Promise<void> {
  try {
    const decoded = await decodeToPixelImage(file)
    if (!decoded) {
      showToast('画像ファイルを選んでください。')
      return
    }
    const { img, origW, origH } = decoded
    sourceOriginal = { width: img.width, height: img.height, data: img.data.slice() } // 切り抜き前の原本
    sourceImage = img
    sourceBgCut = false // 新規画像は切り抜き前状態
    sourceJustLoaded = true // 新規画像 → フレームを作り直す
    infoSrc.textContent =
      img.width !== origW || img.height !== origH
        ? `${origW}×${origH}px → ${img.width}×${img.height}px`
        : `${img.width}×${img.height}px`
    emptyState.hidden = true
    document.body.classList.add('has-image')
    bgSrcCut.disabled = false
    bgSrcReset.disabled = false
    // 既定の出力サイズは「元のサイズ」（読み込んだ画像の解像度そのまま）
    outW.value = String(img.width)
    outH.value = String(img.height)
    updateExportSizeLabel()
    drawSource()
    scheduleRender()
  } catch (err) {
    console.error(err)
    showToast(
      String((err as Error).message) === 'too-large'
        ? `画像が大きすぎます（最大 ${HARD_MAX_MP}メガピクセル）。`
        : '画像を読み込めませんでした（対応形式・破損をご確認ください）。'
    )
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
  // フレームへの反映ルール（手描き編集を壊さないため）:
  //  - 新規画像 / フレーム無し / 出力サイズ変更 → フレーム一式を作り直す（編集フラグもクリア）
  //  - 単一フレームで未編集 → 置換（再変換で下地を更新）
  //  - 単一フレームで編集済み / 複数フレーム → コマを上書きしない（設定変更で作画を失わない）
  const sizeChanged =
    frames.length > 0 && (frames[0].width !== result.width || frames[0].height !== result.height)
  if (sourceJustLoaded || frames.length === 0) {
    frames = [result]
    currentFrame = 0
    lastResult = frames[0]
    edited = false
    resetHistory()
  } else if (sizeChanged) {
    // サイズ変更は全コマの作り直し＝破壊的。コマ複数 or 手描き済みなら確認して守る。
    if (
      (frames.length > 1 || edited) &&
      !window.confirm('出力サイズを変えると、今あるコマ／手直しをすべて作り直します。よろしいですか？')
    ) {
      // 取り消し: サイズ入力を現在のコマに戻して中断（silent なコマ消失を防止）
      outW.value = String(frames[0].width)
      outH.value = String(frames[0].height)
      outLabel.textContent = `${frames[0].width}×${frames[0].height}`
      updateExportSizeLabel()
      sourceJustLoaded = false
      return
    }
    frames = [result]
    currentFrame = 0
    lastResult = frames[0]
    edited = false
    resetHistory()
    mapData.fill(-1) // タイルサイズが変わるとマップ配置は無効
  } else if (frames.length === 1 && !edited) {
    frames[0] = result
    currentFrame = 0
    lastResult = frames[0]
    resetHistory()
  } else {
    showToast(
      frames.length > 1
        ? 'コマが複数あるため、変換設定はコマに反映していません（新しい画像を読み込むと最初から作り直します）'
        : '手直し済みのため、変換設定は反映していません（作り直すには画像を読み込み直してください）'
    )
  }
  sourceJustLoaded = false
  const ms = performance.now() - t0

  outLabel.textContent = `${opts.targetW}×${opts.targetH}`
  drawOutput()
  updateFrameUI()

  infoOut.textContent = `${opts.targetW}×${opts.targetH}px`
  infoColors.textContent = `${palette.colors.length}色`
  infoTime.textContent = `${ms.toFixed(1)}ms`
  updateExportSizeLabel()
  // 初回レンダ完了＝lastResult 確定後に編集系を有効化
  exportBtn.disabled = false
  exportEditBtn.disabled = false
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

// 表示ズーム。通常は出力枠の幅いっぱいに、拡大編集モーダル中はビューポートに合わせて大きく。
function editZoom(): number {
  if (!lastResult) return 1
  let maxW: number
  let maxH: number
  if (isModal) {
    maxW = window.innerWidth * 0.9
    maxH = window.innerHeight * 0.78
  } else {
    maxW = (canvasWrap.clientWidth || 360) - 20 // 出力枠の幅に追従
    maxH = window.innerHeight * 0.6
  }
  const z = Math.floor(Math.min(maxW / lastResult.width, maxH / lastResult.height))
  return Math.max(1, Math.min(40, z))
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
  // 透かし（下絵）: 参照画像を薄く下に敷く。元画像 or 前フレーム。（再生中は出さない）
  const rm = playing ? 'none' : refMode.value
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
  stopPlay() // 再生中はどのコマが保存されるか非決定的になるため止める
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
    if (!blob) {
      showToast('保存に失敗しました（拡大率を下げてお試しください）')
      return
    }
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

// 白紙から作る（画像を使わず一から描く）
newBlankBtn.addEventListener('click', () => {
  const w = clampInt(outW.value, 1, 2048, 16)
  const h = clampInt(outH.value, 1, 2048, 16)
  sourceImage = null // 元画像なし
  sourceOriginal = null
  bgSrcCut.disabled = true
  bgSrcReset.disabled = true
  sourceJustLoaded = false
  frames = [blankFrame(w, h)]
  currentFrame = 0
  lastResult = frames[0]

  // 入力プレビューは空に、情報を更新
  srcCanvas.width = 1
  srcCanvas.height = 1
  srcCanvas.style.width = ''
  srcCanvas.style.height = ''
  infoSrc.textContent = '—'
  infoOut.textContent = `${w}×${h}px`
  infoTime.textContent = '—'
  outLabel.textContent = `${w}×${h}`
  emptyState.hidden = true
  document.body.classList.add('has-image')

  // 自動生成は元画像が要るので、白紙では固定パレットへ切替
  if (isAdaptive()) {
    paletteSelect.value = 'endesga32'
    updatePaletteUI()
  }
  const pal = activePalette()
  infoColors.textContent = `${pal.colors.length}色`
  renderPalette(pal)
  if (pal.colors.length) setPaintColor(pal.colors[0].r, pal.colors[0].g, pal.colors[0].b, 0)

  resetHistory()
  drawOutput()
  exportBtn.disabled = false
  exportEditBtn.disabled = false
  flipHBtn.disabled = false
  flipVBtn.disabled = false
  updateExportSizeLabel()
  updateFrameUI()
  edited = false
  setMode('edit') // 白紙は「描き始める」操作 → 編集タブへ着地（ペン＋パレットが揃う）
  showToast(`白紙キャンバス ${w}×${h} を作成しました。編集タブで描けます`)
})

const rerenderEls = [bayerSize, strength, downscaleSel, deltaModeSel, serpentine, adaptiveCount]
rerenderEls.forEach((el) => el.addEventListener('input', onControlChange))
// 出力サイズは確定時(change)のみ反映。keystroke毎に確認ダイアログが出る/途中値で潰れるのを防ぐ。
;[outW, outH].forEach((el) => el.addEventListener('change', onControlChange))
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
exportEditBtn.addEventListener('click', exportPng)
toEditBtn.addEventListener('click', () => setMode('edit'))

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
    // 透明領域を均一化（RGBも0に）。塗りつぶし等の連結判定を安定させる。
    d[i] = 0
    d[i + 1] = 0
    d[i + 2] = 0
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
  if (d[i + 3] !== 0) setPaintColor(d[i], d[i + 1], d[i + 2]) // 透明画素は色を取らない
  selectTool('pencil') // スポイト後はペンに戻す
}

// 塗りつぶし。実際に変化があれば true。
function bucketFill(sx: number, sy: number): boolean {
  if (!lastResult) return false
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
  if (tr === nr && tg === ng && tb === nb && ta === na) return false // 変化なし
  // 開始画素が透明のときは RGB を無視し「透明どうし」を連結（消しゴム跡もまとめて塗れる）
  const transparentFill = ta === 0
  const match = (i: number) =>
    transparentFill
      ? d[i + 3] === 0
      : d[i] === tr && d[i + 1] === tg && d[i + 2] === tb && d[i + 3] === ta
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const i = (y * w + x) * 4
    if (!match(i)) continue
    d[i] = nr
    d[i + 1] = ng
    d[i + 2] = nb
    d[i + 3] = na
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return true
}

// --- 履歴 ---
function pushUndo(): void {
  if (!lastResult) return
  edited = true // 手描き編集が入った → 単一コマでも再変換で上書きしない
  undoStack.push(lastResult.data.slice())
  // 大きいフレームは履歴段数を絞りメモリ肥大を防ぐ（512²超で少なめ）
  const cap = lastResult.width * lastResult.height > 512 * 512 ? 8 : MAX_HISTORY
  while (undoStack.length > cap) undoStack.shift()
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
// 変換タブの出力は「プレビュー専用」。編集は「編集」/「アニメ」タブでのみ有効。
function canPaint(): boolean {
  return document.body.dataset.mode === 'edit' || document.body.dataset.mode === 'anim'
}
outCanvas.addEventListener('pointerdown', (e) => {
  if (!lastResult || !canPaint()) return
  if (playing) stopPlay() // 編集を始めたら再生停止
  const p = eventToPixel(e)
  if (!p) return
  e.preventDefault()
  if (tool === 'eyedropper') {
    pickColor(p.x, p.y)
    return
  }
  if (tool === 'bucket') {
    pushUndo()
    if (bucketFill(p.x, p.y)) drawOutput()
    else {
      undoStack.pop() // 変化なしなら履歴を積まない
      updateUndoRedo()
    }
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
  if (!painting || !lastResult || !canPaint()) return
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
  if (!canPaint()) {
    outCanvas.style.cursor = 'default' // 変換タブ等はプレビュー専用
    return
  }
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

// --- 背景切り抜き ---
function colorDist2(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return dr * dr + dg * dg + db * db
}
// フチから続く背景（周囲と色が近い連結領域）を透明化。変化した画素数を返す。
function removeBackgroundEdges(img: PixelImage, tol: number): number {
  const { width: w, height: h, data: d } = img
  const orig = d.slice()
  const visited = new Uint8Array(w * h)
  const tol2 = tol * tol
  const stack: number[] = []
  let removed = 0
  const seed = (x: number, y: number) => {
    const idx = y * w + x
    if (visited[idx] || d[idx * 4 + 3] === 0) return
    visited[idx] = 1
    d[idx * 4 + 3] = 0
    removed++
    stack.push(idx)
  }
  for (let x = 0; x < w; x++) {
    seed(x, 0)
    seed(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    seed(0, y)
    seed(w - 1, y)
  }
  const near = (a: number, b: number) =>
    colorDist2(
      orig[a * 4],
      orig[a * 4 + 1],
      orig[a * 4 + 2],
      orig[b * 4],
      orig[b * 4 + 1],
      orig[b * 4 + 2]
    ) <= tol2
  while (stack.length) {
    const p = stack.pop()!
    const px = p % w
    const py = (p / w) | 0
    const neigh = [
      [px + 1, py],
      [px - 1, py],
      [px, py + 1],
      [px, py - 1],
    ]
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = ny * w + nx
      if (visited[n] || d[n * 4 + 3] === 0) continue
      if (near(p, n)) {
        visited[n] = 1
        d[n * 4 + 3] = 0
        removed++
        stack.push(n)
      }
    }
  }
  return removed
}
// 指定色に近い画素をすべて透明化（クロマキー）。変化数を返す。
function removeColorKey(img: PixelImage, r: number, g: number, b: number, tol: number): number {
  const d = img.data
  const tol2 = tol * tol
  let removed = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    if (colorDist2(d[i], d[i + 1], d[i + 2], r, g, b) <= tol2) {
      d[i + 3] = 0
      removed++
    }
  }
  return removed
}
bgEdgesBtn.addEventListener('click', () => {
  if (!lastResult) return
  pushUndo()
  const removed = removeBackgroundEdges(lastResult, Number(bgTol.value))
  if (removed > 0) {
    drawOutput()
    showToast(`背景を切り抜きました（${removed}ドット）`)
  } else {
    undoStack.pop()
    updateUndoRedo()
    showToast('フチに切り抜ける背景が見つかりませんでした')
  }
})
bgColorBtn.addEventListener('click', () => {
  if (!lastResult) return
  pushUndo()
  const removed = removeColorKey(lastResult, paint.r, paint.g, paint.b, Number(bgTol.value))
  if (removed > 0) {
    drawOutput()
    showToast(`「描く色」に近い色を消しました（${removed}ドット）`)
  } else {
    undoStack.pop()
    updateUndoRedo()
    showToast('その色に近い画素はありませんでした')
  }
})

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
  stopPlay()
  // 現在のコマの履歴を退避してから移動
  if (lastResult) frameHistory.set(lastResult, { undo: undoStack.slice(), redo: redoStack.slice() })
  currentFrame = Math.max(0, Math.min(frames.length - 1, i))
  lastResult = frames[currentFrame]
  // 移動先コマの履歴を復元（無ければ空）
  const h = frameHistory.get(lastResult)
  undoStack.length = 0
  redoStack.length = 0
  if (h) {
    undoStack.push(...h.undo)
    redoStack.push(...h.redo)
  }
  updateUndoRedo()
  drawOutput()
  updateFrameUI()
}
// 出力キャプションの導線・空状態文言・カーソルを現在のモードと状態から更新
function updateOutputAffordances(): void {
  const mode = document.body.dataset.mode ?? 'convert'
  const has = !!lastResult
  outHint.textContent = mode === 'convert' ? 'プレビュー' : 'クリック/ドラッグで手直し'
  toEditBtn.hidden = !(mode === 'convert' && has) // 変換タブでのみ「編集へ」CTA
  // 全画面編集ボタンは編集/アニメのみ。モーダル表示中は重複防止で隠す
  openModalBtn.hidden = isModal || !((mode === 'edit' || mode === 'anim') && has)
  emptyState.textContent =
    mode === 'convert'
      ? '左で画像を読み込むと、ここに変換結果が表示されます'
      : mode === 'edit'
        ? '「変換」タブで画像を読み込むか「白紙から作る」で始めましょう'
        : '「画像を複数追加」で連番画像を取り込むか、「変換」タブで1枚作るとコマになります'
  updateCanvasCursor() // 描ける/描けないでカーソルを切替
}

function updateFrameUI(): void {
  const n = frames.length
  frameLabel.textContent = n === 0 ? '—' : `${currentFrame + 1} / ${n}`
  const has = n > 0 && !!lastResult
  framePrev.disabled = currentFrame <= 0
  frameNext.disabled = currentFrame >= n - 1
  frameDel.disabled = n <= 1
  frameDup.disabled = !has
  frameBlank.disabled = !has
  sheetExportBtn.disabled = !has
  zipExportBtn.disabled = !has
  openModalBtn.disabled = !has
  playBtn.disabled = n < 2 // 再生は2コマ以上
  // アニメのタイムライン（サムネ）
  if (document.body.dataset.mode === 'anim') renderFrameStrip()
  // タイルマップのタイル一覧はコマ数に追従
  if (frames.length === 0) selectedTile = -1
  else if (selectedTile >= frames.length) selectedTile = 0
  if (document.body.dataset.mode === 'tilemap') {
    renderTilePicker()
    drawMap()
    mapExportBtn.disabled = !tileDims()
  }
  updateOutputAffordances()
}

framePrev.addEventListener('click', () => gotoFrame(currentFrame - 1))
frameNext.addEventListener('click', () => gotoFrame(currentFrame + 1))
frameDup.addEventListener('click', () => {
  if (!lastResult) return
  frames.splice(currentFrame + 1, 0, copyFrame(lastResult))
  mapAdjustInsert(currentFrame + 1)
  gotoFrame(currentFrame + 1)
})
frameBlank.addEventListener('click', () => {
  if (!lastResult) return
  frames.splice(currentFrame + 1, 0, blankFrame(lastResult.width, lastResult.height))
  mapAdjustInsert(currentFrame + 1)
  gotoFrame(currentFrame + 1)
})
frameDel.addEventListener('click', () => {
  if (frames.length <= 1) return
  mapAdjustDelete(currentFrame)
  frames.splice(currentFrame, 1)
  gotoFrame(Math.min(currentFrame, frames.length - 1))
})
refMode.addEventListener('change', () => {
  onionOpacity.disabled = refMode.value === 'none' // 透かしなしのとき濃さは無効
  drawOutput()
})
onionOpacity.addEventListener('input', drawOutput)

// --- 元画像の背景切り抜き（変換前に適用＝輪郭がきれい） ---
function applySourceBgCut(): void {
  if (!sourceOriginal) return
  sourceImage = {
    width: sourceOriginal.width,
    height: sourceOriginal.height,
    data: sourceOriginal.data.slice(),
  }
  const removed = removeBackgroundEdges(sourceImage, Number(bgSrcTol.value))
  sourceBgCut = true
  sourceJustLoaded = true // 下地が変わったので作り直す
  drawSource()
  scheduleRender()
  showToast(removed > 0 ? '元画像の背景を切り抜きました' : 'フチに切り抜ける背景が見つかりませんでした')
}
bgSrcCut.addEventListener('click', applySourceBgCut)
bgSrcTol.addEventListener('change', () => {
  if (sourceBgCut) applySourceBgCut() // 切り抜き済みなら強さ変更で再適用
})
bgSrcReset.addEventListener('click', () => {
  if (!sourceOriginal) return
  sourceImage = {
    width: sourceOriginal.width,
    height: sourceOriginal.height,
    data: sourceOriginal.data.slice(),
  }
  sourceBgCut = false
  sourceJustLoaded = true
  drawSource()
  scheduleRender()
  showToast('元画像に戻しました')
})

// --- 複数画像をコマとして一括追加（アニメ素材） ---
addImagesBtn.addEventListener('click', () => addImagesInput.click())
addImagesInput.addEventListener('change', () => {
  const files = addImagesInput.files
  if (files && files.length) void addImagesAsFrames(Array.from(files))
  addImagesInput.value = ''
})
async function addImagesAsFrames(files: File[]): Promise<void> {
  const opts = readOptions()
  const w = frames.length ? frames[0].width : opts.targetW
  const h = frames.length ? frames[0].height : opts.targetH
  let pal: Palette | null = isAdaptive() ? lastAdaptive : opts.palette
  let added = 0
  for (const file of files) {
    let decoded: { img: PixelImage } | null = null
    try {
      decoded = await decodeToPixelImage(file)
    } catch {
      decoded = null
    }
    if (!decoded) continue
    const small = downscale(decoded.img, w, h, opts.downscale)
    if (isAdaptive() && !pal) {
      pal = medianCutPalette(small, Number(adaptiveCount.value))
      lastAdaptive = pal
      renderPalette(pal)
    }
    frames.push(quantizeImage(small, { ...opts, palette: pal ?? opts.palette }))
    added++
  }
  if (added === 0) {
    showToast('追加できる画像がありませんでした')
    return
  }
  currentFrame = frames.length - added // 最初に追加したコマへ
  lastResult = frames[currentFrame]
  document.body.classList.add('has-image')
  resetHistory()
  drawOutput()
  updateFrameUI()
  exportBtn.disabled = false
  exportEditBtn.disabled = false
  flipHBtn.disabled = false
  flipVBtn.disabled = false
  showToast(`${added}枚をコマとして追加（全${frames.length}コマ）`)
}

// --- アニメ再生 ---
function stopPlay(): void {
  if (!playing) return
  clearInterval(playTimer)
  playTimer = 0
  playing = false
  currentFrame = Math.min(playSavedFrame, frames.length - 1)
  lastResult = frames[currentFrame]
  playBtn.textContent = '▶ 再生'
  drawOutput()
  updateFrameUI()
}
function startPlay(): void {
  if (frames.length < 2) return
  playSavedFrame = currentFrame
  playing = true
  playBtn.textContent = '■ 停止'
  const fps = Math.max(1, Math.min(30, Number(fpsInput.value) || 8))
  let i = 0
  playTimer = window.setInterval(() => {
    currentFrame = i % frames.length
    lastResult = frames[currentFrame]
    drawOutput()
    i++
  }, 1000 / fps)
}
playBtn.addEventListener('click', () => (playing ? stopPlay() : startPlay()))
fpsInput.addEventListener('change', () => {
  if (playing) {
    stopPlay()
    startPlay()
  }
})

// --- タイムライン（コマのサムネ一覧） ---
function renderFrameStrip(): void {
  frameStrip.innerHTML = ''
  frames.forEach((f, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'frame-thumb' + (i === currentFrame ? ' active' : '')
    btn.title = `コマ ${i + 1}`
    const cv = imageToCanvas(f)
    cv.style.width = '44px'
    cv.style.height = `${Math.round((44 * f.height) / f.width)}px`
    const num = document.createElement('span')
    num.className = 'frame-thumb-num'
    num.textContent = String(i + 1)
    btn.appendChild(cv)
    btn.appendChild(num)
    btn.addEventListener('click', () => {
      stopPlay()
      gotoFrame(i)
    })
    frameStrip.appendChild(btn)
  })
}

// スプライトシート書き出し（全フレームを横並び）
sheetExportBtn.addEventListener('click', () => {
  if (frames.length === 0) return
  stopPlay()
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
    if (!blob) {
      showToast('保存に失敗しました（画像が大きすぎる可能性）')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(`${name} を保存しました`)
  }, 'image/png')
})

// 1コマを（拡大率を反映した）PNGのバイト列に。
function frameToPngBytes(f: PixelImage, scale: number): Uint8Array {
  const out = document.createElement('canvas')
  out.width = f.width * scale
  out.height = f.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(imageToCanvas(f), 0, 0, out.width, out.height)
  const url = out.toDataURL('image/png')
  const b64 = url.split(',')[1] ?? ''
  // 空/失敗(data:,)を無言で0バイトPNGとして格納しない。呼び出し側でまとめてエラー通知する。
  if (!b64 || url === 'data:,') throw new Error('encode-failed')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// 全コマを個別PNGにして1つのZIPで保存（コマ単位でまとめてダウンロード）
zipExportBtn.addEventListener('click', () => {
  if (frames.length === 0) return
  stopPlay()
  const scale = Number(exportScaleSel.value)
  const pad = String(frames.length).length
  try {
    const entries = frames.map((f, i) => ({
      name: `frame_${String(i + 1).padStart(pad, '0')}_${f.width}x${f.height}.png`,
      data: frameToPngBytes(f, scale),
    }))
    const zip = makeZip(entries)
    const blob = new Blob([zip], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pixelforge_frames_${frames.length}f_x${scale}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(`${frames.length}コマを個別PNGにしてZIP保存しました`)
  } catch {
    showToast('ZIP保存に失敗しました（コマ数・拡大率を下げてお試しください）')
  }
})

// ============================================================
// AI生成（Google Gemini・同一オリジンの /api/generate 経由）
// 生成画像は既存の縮小＋量子化パイプラインでドット絵化してから取り込む。
// ============================================================
function pixelImageToBase64Png(img: PixelImage): { b64: string; mime: string } {
  const url = imageToCanvas(img).toDataURL('image/png')
  return { b64: url.split(',')[1] ?? '', mime: 'image/png' }
}

async function base64ToPixelImage(b64: string, mime: string): Promise<PixelImage> {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: mime })
  let bmp = await createImageBitmap(blob)
  if (bmp.width > SAFE_DIM || bmp.height > SAFE_DIM) {
    const scale = SAFE_DIM / Math.max(bmp.width, bmp.height)
    const r = await createImageBitmap(blob, {
      resizeWidth: Math.max(1, Math.round(bmp.width * scale)),
      resizeHeight: Math.max(1, Math.round(bmp.height * scale)),
      resizeQuality: 'high',
    })
    bmp.close()
    bmp = r
  }
  const cv = document.createElement('canvas')
  cv.width = bmp.width
  cv.height = bmp.height
  const ctx = cv.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  const id = ctx.getImageData(0, 0, bmp.width, bmp.height)
  bmp.close()
  return { width: id.width, height: id.height, data: id.data }
}

// localStorage 例外安全ラッパ（Safariプライベート等で throw することがある）
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
    /* 保存不可の環境では黙って諦める（毎回入力にフォールバック） */
  }
}

// /api/generate 呼び出し（保存済みアクセスコードがあればヘッダに載せる）
function callGenerate(body: { prompt: string; image?: string; mimeType?: string }): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const code = lsGet('pf_access_code')
  if (code) headers['x-access-code'] = code
  return fetch('/api/generate', { method: 'POST', headers, body: JSON.stringify(body) })
}

let aiBusy = false
function aiSetBusy(busy: boolean, msg: string): void {
  aiBusy = busy
  aiGenerateBtn.disabled = busy
  aiStatus.textContent = msg
}

async function aiGenerate(): Promise<void> {
  if (aiBusy) return
  const prompt = aiPrompt.value.trim()
  if (!prompt) {
    showToast('プロンプトを入力してください')
    aiPrompt.focus()
    return
  }
  const body: { prompt: string; image?: string; mimeType?: string } = { prompt }
  if (aiUseImage.checked && lastResult) {
    const { b64, mime } = pixelImageToBase64Png(lastResult)
    body.image = b64
    body.mimeType = mime
  }
  aiSetBusy(true, '生成中…（数秒〜十数秒）')
  try {
    let resp = await callGenerate(body)
    // アクセスコードが必要なら一度だけ入力を求めて再試行
    if (resp.status === 401) {
      const e = (await resp.clone().json().catch(() => ({}))) as { needCode?: boolean }
      if (e.needCode) {
        const code = window.prompt('アクセスコードを入力してください（管理者から共有されたコード）')
        if (code) {
          lsSet('pf_access_code', code)
          resp = await callGenerate(body)
        }
      }
    }
    const j = (await resp.json().catch(() => ({}))) as { image?: string; mimeType?: string; error?: string }
    if (!resp.ok || !j.image) {
      aiSetBusy(false, '')
      showToast('AI生成: ' + (j.error || `失敗しました (${resp.status})`))
      return
    }
    const raw = await base64ToPixelImage(j.image, j.mimeType || 'image/png')
    // 生成画像を現在の出力サイズへドット絵化
    const opts = readOptions()
    const w = frames.length ? frames[0].width : opts.targetW
    const h = frames.length ? frames[0].height : opts.targetH
    const small = downscale(raw, w, h, opts.downscale)
    let pal = opts.palette
    if (isAdaptive()) {
      pal = medianCutPalette(small, Number(adaptiveCount.value))
      lastAdaptive = pal
      renderPalette(pal)
    }
    const dot = quantizeImage(small, { ...opts, palette: pal })
    const mode =
      (document.querySelector('input[name="aiResult"]:checked') as HTMLInputElement | null)?.value ?? 'frame'
    if (mode === 'ref') {
      // 透かし下絵に（なぞり描き用。高解像度の生画像を元画像として設定）
      sourceImage = raw
      sourceOriginal = { width: raw.width, height: raw.height, data: raw.data.slice() }
      sourceBgCut = false
      bgSrcCut.disabled = false
      bgSrcReset.disabled = false
      drawSource()
      refMode.value = 'source'
      onionOpacity.disabled = false
      drawOutput()
      showToast('AIで生成し、透かし下絵に設定しました')
    } else {
      // コマとして追加
      if (frames.length === 0) {
        frames = [dot]
        currentFrame = 0
      } else {
        frames.splice(currentFrame + 1, 0, dot)
        mapAdjustInsert(currentFrame + 1)
        currentFrame += 1
      }
      lastResult = frames[currentFrame]
      edited = true
      document.body.classList.add('has-image')
      resetHistory()
      drawOutput()
      updateFrameUI()
      exportBtn.disabled = false
      exportEditBtn.disabled = false
      flipHBtn.disabled = false
      flipVBtn.disabled = false
      showToast('AIで生成し、コマを追加しました')
    }
    aiSetBusy(false, '')
  } catch {
    aiSetBusy(false, '')
    showToast('AI生成に失敗しました（ネットワーク／サーバーのキー設定をご確認ください）')
  }
}
aiGenerateBtn.addEventListener('click', () => void aiGenerate())

// 拡大編集モーダル: 出力figureをモーダルへ移動して大きく編集
function openModal(): void {
  if (isModal || !lastResult) return
  modalSlot.appendChild(outputFigure)
  openModalBtn.hidden = true // モーダル内では「拡大編集」リンクを隠す（重複防止）
  editModal.hidden = false
  isModal = true
  drawOutput()
}
function closeModal(): void {
  previewGridEl.appendChild(outputFigure) // 入力figureの後ろ（2番目）に戻る
  openModalBtn.hidden = false
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
// 未保存の作業（手描き・複数コマ・タイル配置）があればリロード/離脱前に確認
window.addEventListener('beforeunload', (e) => {
  const hasWork = edited || frames.length > 1 || mapData.some((v) => v >= 0)
  if (hasWork) {
    e.preventDefault()
    e.returnValue = ''
  }
})
// 画面サイズ変更で出力ズームを追従
let resizeRaf = 0
window.addEventListener('resize', () => {
  if (resizeRaf) return
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    if (lastResult) drawOutput()
    if (document.body.dataset.mode === 'tilemap') drawMap()
  })
})

// ============================================================
// タイルマップ（各コマをタイルとして格子に並べる）
// ============================================================
function tileDims(): { w: number; h: number } | null {
  if (frames.length === 0) return null
  return { w: frames[0].width, h: frames[0].height }
}

function renderTilePicker(): void {
  tilePicker.innerHTML = ''
  const eraser = document.createElement('button')
  eraser.type = 'button'
  eraser.className = 'tile-thumb tile-eraser' + (selectedTile < 0 ? ' active' : '')
  eraser.title = '空（配置を消す）'
  eraser.textContent = '空'
  eraser.addEventListener('click', () => {
    selectedTile = -1
    renderTilePicker()
  })
  tilePicker.appendChild(eraser)
  frames.forEach((f, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tile-thumb' + (selectedTile === i ? ' active' : '')
    btn.title = `タイル ${i + 1}`
    const cv = imageToCanvas(f)
    cv.style.width = '40px'
    cv.style.height = `${Math.round((40 * f.height) / f.width)}px`
    btn.appendChild(cv)
    btn.addEventListener('click', () => {
      selectedTile = i
      renderTilePicker()
    })
    tilePicker.appendChild(btn)
  })
}

function mapZoom(): number {
  const dims = tileDims()
  if (!dims) return 1
  const maxDim = 640
  return Math.max(1, Math.min(20, Math.floor(maxDim / Math.max(mapCols * dims.w, mapRows * dims.h))))
}

function drawMap(): void {
  const dims = tileDims()
  mapEmpty.hidden = !!dims
  if (!dims) {
    mapCanvas.width = 1
    mapCanvas.height = 1
    return
  }
  const z = mapZoom()
  const cw = dims.w * z
  const ch = dims.h * z
  mapCanvas.width = mapCols * cw
  mapCanvas.height = mapRows * ch
  const ctx = mapCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height)
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const t = mapData[r * mapCols + c]
      if (t >= 0 && t < frames.length) {
        ctx.drawImage(imageToCanvas(frames[t]), c * cw, r * ch, cw, ch)
      }
    }
  }
  ctx.strokeStyle = 'rgba(128,128,128,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c <= mapCols; c++) {
    const x = c * cw + 0.5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, mapCanvas.height)
  }
  for (let r = 0; r <= mapRows; r++) {
    const y = r * ch + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(mapCanvas.width, y)
  }
  ctx.stroke()
}

function resizeMap(): void {
  const c = clampInt(mapColsInput.value, 1, 64, 8)
  const r = clampInt(mapRowsInput.value, 1, 64, 8)
  const next = new Int16Array(c * r).fill(-1)
  for (let y = 0; y < Math.min(r, mapRows); y++) {
    for (let x = 0; x < Math.min(c, mapCols); x++) {
      next[y * c + x] = mapData[y * mapCols + x]
    }
  }
  mapCols = c
  mapRows = r
  mapData = next
  drawMap()
}

function mapCellFromEvent(e: PointerEvent): { c: number; r: number } | null {
  const rect = mapCanvas.getBoundingClientRect()
  const c = Math.floor(((e.clientX - rect.left) / rect.width) * mapCols)
  const r = Math.floor(((e.clientY - rect.top) / rect.height) * mapRows)
  if (c < 0 || r < 0 || c >= mapCols || r >= mapRows) return null
  return { c, r }
}
function placeTile(c: number, r: number, tile: number): void {
  mapData[r * mapCols + c] = tile
  drawMap()
}
// コマの挿入/削除に合わせて mapData（フレームindex参照）を補正し、配置の化け/消失を防ぐ。
function mapAdjustInsert(at: number): void {
  for (let i = 0; i < mapData.length; i++) if (mapData[i] >= at) mapData[i] += 1
}
function mapAdjustDelete(at: number): void {
  for (let i = 0; i < mapData.length; i++) {
    if (mapData[i] === at) mapData[i] = -1
    else if (mapData[i] > at) mapData[i] -= 1
  }
}

mapCanvas.addEventListener('pointerdown', (e) => {
  if (!tileDims()) return
  const cell = mapCellFromEvent(e)
  if (!cell) return
  e.preventDefault()
  mapPainting = true
  mapCanvas.setPointerCapture(e.pointerId)
  placeTile(cell.c, cell.r, selectedTile)
})
mapCanvas.addEventListener('pointermove', (e) => {
  if (!mapPainting) return
  const cell = mapCellFromEvent(e)
  if (cell) placeTile(cell.c, cell.r, selectedTile)
})
const endMap = () => {
  mapPainting = false
}
mapCanvas.addEventListener('pointerup', endMap)
mapCanvas.addEventListener('pointercancel', endMap)
mapCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  const cell = mapCellFromEvent(e as unknown as PointerEvent)
  if (cell) placeTile(cell.c, cell.r, -1)
})
mapColsInput.addEventListener('input', resizeMap)
mapRowsInput.addEventListener('input', resizeMap)
mapClearBtn.addEventListener('click', () => {
  const hasTiles = mapData.some((v) => v >= 0)
  if (hasTiles && !window.confirm('マップを全部空にします。よろしいですか？')) return
  mapData.fill(-1)
  drawMap()
})
mapExportBtn.addEventListener('click', () => {
  const dims = tileDims()
  if (!dims) {
    showToast('先にコマ（タイル）を用意してください')
    return
  }
  if (!mapData.some((v) => v >= 0)) {
    showToast('タイルが1つも配置されていません')
    return
  }
  const scale = Number(exportScaleSel.value)
  const cw = dims.w * scale
  const ch = dims.h * scale
  const out = document.createElement('canvas')
  out.width = mapCols * cw
  out.height = mapRows * ch
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const t = mapData[r * mapCols + c]
      if (t >= 0 && t < frames.length) ctx.drawImage(imageToCanvas(frames[t]), c * cw, r * ch, cw, ch)
    }
  }
  const name = `pixelforge_map_${mapCols}x${mapRows}_tile${dims.w}x${dims.h}_x${scale}.png`
  out.toBlob((blob) => {
    if (!blob) {
      showToast('保存に失敗しました（サイズを小さくしてお試しください）')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(`${name} を保存しました`)
  }, 'image/png')
})
// ============================================================
// モード切替（タブ）: 変換 / 編集 / アニメ / タイルマップ
// ============================================================
type Mode = 'convert' | 'edit' | 'anim' | 'tilemap'
function setMode(mode: Mode): void {
  if (mode !== 'anim') stopPlay() // アニメ以外へ移ったら再生停止
  document.body.dataset.mode = mode
  // 各モードで表示する要素（hidden 属性で切替）
  const show = {
    convert: { controls: 1, input: 1, tools: 0, palette: 0, frameBar: 0, tilemap: 0, output: 1, info: 1 },
    edit: { controls: 0, input: 0, tools: 1, palette: 1, frameBar: 0, tilemap: 0, output: 1, info: 0 },
    anim: { controls: 0, input: 0, tools: 1, palette: 1, frameBar: 1, tilemap: 0, output: 1, info: 1 },
    tilemap: { controls: 0, input: 0, tools: 0, palette: 0, frameBar: 0, tilemap: 1, output: 0, info: 0 },
  }[mode]
  convertControls.hidden = !show.controls
  inputFigure.hidden = !show.input
  editorToolbar.hidden = !show.tools
  editorPalette.hidden = !show.palette
  aiPanel.hidden = !show.palette // AI生成は編集/アニメで表示（パレットと同条件）
  frameBar.hidden = !show.frameBar
  tilemapPanel.hidden = !show.tilemap
  outputFigure.hidden = !show.output
  infoCard.hidden = !show.info

  appTabs.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === mode)
  })

  updateOutputAffordances() // 出力キャプションの導線・空状態文言・カーソル

  // モードに応じて描画を更新
  if (mode === 'anim') {
    renderFrameStrip()
  }
  if (mode === 'tilemap') {
    if (selectedTile >= frames.length) selectedTile = frames.length ? 0 : -1
    renderTilePicker()
    drawMap()
    mapExportBtn.disabled = !tileDims() // タイル未用意なら空マップを書き出せない
  } else if (lastResult) {
    requestAnimationFrame(() => drawOutput()) // レイアウト確定後に幅追従で再描画
  }
}
appTabs.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
  t.addEventListener('click', () => setMode(t.dataset.mode as Mode))
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
setMode('convert') // 初期は「変換」モード
