import '@sakun/system.css/dist/system.css'
import './style.css'
import type { ConvertOptions, DitherMode, DownscaleMode, BayerSize, Palette, PixelImage } from './types'
import { PALETTES, getPalette, hexToPaletteColor } from './palettes/palettes'
import { parsePaletteText } from './palettes/parse'
import { convert } from './pipeline'

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
const swatches = $('swatches')
const addColorBtn = $<HTMLButtonElement>('addColor')
const swatchColor = $<HTMLInputElement>('swatchColor')
const customPaletteText = $<HTMLTextAreaElement>('customPalette')
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

const MAX_INPUT_DIM = 8192 // これを超える巨大画像は getImageData 失敗の恐れがあり拒否

// --- 状態 ---
let sourceImage: PixelImage | null = null
let customPal: Palette | null = null
let lastResult: PixelImage | null = null
let editingIndex = -1

const DITHER_HELP: Record<DitherMode, string> = {
  none: '最近色へ置換（ディザなし）。色段差（バンディング）が出やすい。',
  ordered: 'ベイヤー行列で規則的に混色。均一・高速でタイル向き。',
  fs: '誤差拡散で自然に混色。階調とディテールに強い。',
}

// --- パレット選択肢を構築 ---
for (const p of PALETTES) {
  const opt = document.createElement('option')
  opt.value = p.id
  opt.textContent = p.name
  paletteSelect.appendChild(opt)
}

function activePalette(): Palette {
  if (paletteSelect.value === '__custom' && customPal) return customPal
  return getPalette(paletteSelect.value) ?? PALETTES[0]
}

const hex = (n: number) => n.toString(16).padStart(2, '0')
const toHex = (c: { r: number; g: number; b: number }) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`

function renderSwatches(pal: Palette): void {
  swatches.innerHTML = ''
  pal.colors.forEach((c, i) => {
    const sw = document.createElement('button')
    sw.type = 'button'
    sw.className = 'swatch'
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`
    sw.setAttribute('role', 'listitem')
    sw.setAttribute('aria-label', `色 ${i + 1}: ${toHex(c)}（クリックで編集）`)
    sw.title = `${toHex(c)}（クリックで編集 / 右クリックで削除）`
    sw.addEventListener('click', () => beginEditColor(i))
    sw.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      deleteColor(i)
    })
    swatches.appendChild(sw)
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

function beginEditColor(index: number): void {
  const pal = ensureCustom()
  editingIndex = index
  swatchColor.value = toHex(pal.colors[index])
  swatchColor.click()
}

swatchColor.addEventListener('input', () => {
  if (!customPal || editingIndex < 0) return
  customPal.colors[editingIndex] = hexToPaletteColor(swatchColor.value)
  renderSwatches(customPal)
  scheduleRender()
})

function deleteColor(index: number): void {
  const pal = ensureCustom()
  if (pal.colors.length <= 1) return // 最低1色は残す
  pal.colors.splice(index, 1)
  refreshCustomLabel()
  renderSwatches(pal)
  scheduleRender()
}

addColorBtn.addEventListener('click', () => {
  const pal = ensureCustom()
  pal.colors.push(hexToPaletteColor('#808080'))
  refreshCustomLabel()
  renderSwatches(pal)
  scheduleRender()
})

// --- オプション読み取り ---
function currentDither(): DitherMode {
  return (document.querySelector('input[name="dither"]:checked') as HTMLInputElement).value as DitherMode
}

function readOptions(): ConvertOptions {
  return {
    targetW: clampInt(outW.value, 1, 256, 16),
    targetH: clampInt(outH.value, 1, 256, 16),
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
    showHint('画像ファイルを選んでください。')
    return
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (bmp.width > MAX_INPUT_DIM || bmp.height > MAX_INPUT_DIM) {
      bmp.close()
      showHint(`画像が大きすぎます（最大 ${MAX_INPUT_DIM}px）。`)
      return
    }
    const cv = document.createElement('canvas')
    cv.width = bmp.width
    cv.height = bmp.height
    const ctx = cv.getContext('2d')
    if (!ctx) throw new Error('canvas 2d コンテキストを取得できません')
    ctx.drawImage(bmp, 0, 0)
    const id = ctx.getImageData(0, 0, bmp.width, bmp.height)
    bmp.close()
    sourceImage = { width: id.width, height: id.height, data: id.data }
    infoSrc.textContent = `${id.width}×${id.height}px`
    emptyState.hidden = true
    drawSource()
    exportBtn.disabled = false
    scheduleRender()
  } catch (err) {
    console.error(err)
    showHint('画像を読み込めませんでした（対応形式・破損をご確認ください）。')
  }
}

function showHint(msg: string): void {
  // 情報カード横のトーストで簡易通知
  showToast(msg)
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
  lastResult = convert(sourceImage, opts)
  const ms = performance.now() - t0

  outLabel.textContent = `${opts.targetW}×${opts.targetH}`
  drawScaled(outCanvas, lastResult, previewZoom(lastResult))

  infoOut.textContent = `${opts.targetW}×${opts.targetH}px`
  infoColors.textContent = `${opts.palette.colors.length}色`
  infoTime.textContent = `${ms.toFixed(1)}ms`
  updateExportSizeLabel()
}

function updateExportSizeLabel(): void {
  const w = clampInt(outW.value, 1, 256, 16)
  const h = clampInt(outH.value, 1, 256, 16)
  const scale = Number(exportScaleSel.value)
  const label = `${w * scale}×${h * scale}px`
  exportSizeLabel.textContent = label
  infoExport.textContent = label
}

function previewZoom(img: PixelImage): number {
  return Math.max(1, Math.min(24, Math.floor(300 / Math.max(img.width, img.height))))
}

function drawScaled(canvas: HTMLCanvasElement, img: PixelImage, zoom: number): void {
  const small = imageToCanvas(img)
  canvas.width = img.width * zoom
  canvas.height = img.height * zoom
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height)
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
  const result = lastResult
  if (!result) return
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
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
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

const rerenderEls = [outW, outH, bayerSize, strength, downscaleSel, deltaModeSel, serpentine]
rerenderEls.forEach((el) => el.addEventListener('input', onControlChange))
exportScaleSel.addEventListener('input', updateExportSizeLabel)
document
  .querySelectorAll('input[name="dither"]')
  .forEach((el) => el.addEventListener('change', onControlChange))
document.querySelectorAll<HTMLElement>('.presets .btn').forEach((chip) =>
  chip.addEventListener('click', () => {
    outW.value = chip.dataset.w ?? '16'
    outH.value = chip.dataset.h ?? '16'
    onControlChange()
  })
)

function onControlChange(): void {
  strengthVal.textContent = Number(strength.value).toFixed(2)
  updateVisibility()
  renderSwatches(activePalette())
  updateExportSizeLabel()
  scheduleRender()
}

paletteSelect.addEventListener('change', () => {
  renderSwatches(activePalette())
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
  renderSwatches(pal)
  scheduleRender()
})

exportBtn.addEventListener('click', exportPng)

// --- 初期表示 ---
renderSwatches(activePalette())
updateVisibility()
updateExportSizeLabel()
