import './style.css'
import type { ConvertOptions, DitherMode, DownscaleMode, BayerSize, Palette, PixelImage } from './types'
import { PALETTES, getPalette } from './palettes/palettes'
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
const customPalette = $<HTMLTextAreaElement>('customPalette')
const applyCustom = $<HTMLButtonElement>('applyCustom')
const customStatus = $('customStatus')
const bayerRow = $('bayerRow')
const bayerSize = $<HTMLSelectElement>('bayerSize')
const serpentineRow = $('serpentineRow')
const serpentine = $<HTMLInputElement>('serpentine')
const strength = $<HTMLInputElement>('strength')
const strengthVal = $('strengthVal')
const downscaleSel = $<HTMLSelectElement>('downscale')
const deltaModeSel = $<HTMLSelectElement>('deltaMode')
const exportScaleSel = $<HTMLSelectElement>('exportScale')
const exportBtn = $<HTMLButtonElement>('exportBtn')
const srcCanvas = $<HTMLCanvasElement>('srcCanvas')
const outCanvas = $<HTMLCanvasElement>('outCanvas')
const outLabel = $('outLabel')
const hint = $('hint')

// --- 状態 ---
let sourceImage: PixelImage | null = null
let customPal: Palette | null = null
let lastResult: PixelImage | null = null

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

function renderSwatches(pal: Palette): void {
  swatches.innerHTML = ''
  for (const c of pal.colors) {
    const sw = document.createElement('div')
    sw.className = 'swatch'
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`
    sw.title = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
    swatches.appendChild(sw)
  }
}

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
  if (!file.type.startsWith('image/')) return
  const bmp = await createImageBitmap(file)
  const cv = document.createElement('canvas')
  cv.width = bmp.width
  cv.height = bmp.height
  const ctx = cv.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  const id = ctx.getImageData(0, 0, bmp.width, bmp.height)
  sourceImage = { width: id.width, height: id.height, data: id.data }
  bmp.close()
  drawSource()
  exportBtn.disabled = false
  hint.textContent = `入力: ${sourceImage.width}×${sourceImage.height}px`
  render()
}

function drawSource(): void {
  if (!sourceImage) return
  const maxDim = 320
  const scale = Math.min(maxDim / sourceImage.width, maxDim / sourceImage.height, 1)
  srcCanvas.width = sourceImage.width
  srcCanvas.height = sourceImage.height
  srcCanvas.style.width = `${Math.round(sourceImage.width * scale)}px`
  srcCanvas.style.height = `${Math.round(sourceImage.height * scale)}px`
  srcCanvas.getContext('2d')!.putImageData(toImageData(sourceImage), 0, 0)
}

// --- 変換とプレビュー ---
function render(): void {
  if (!sourceImage) return
  const opts = readOptions()
  lastResult = convert(sourceImage, opts)
  outLabel.textContent = `${opts.targetW}×${opts.targetH}`
  drawScaled(outCanvas, lastResult, previewZoom(lastResult))
}

function previewZoom(img: PixelImage): number {
  return Math.max(1, Math.min(24, Math.floor(320 / Math.max(img.width, img.height))))
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
  if (!lastResult) return
  const scale = Number(exportScaleSel.value)
  const small = imageToCanvas(lastResult)
  const out = document.createElement('canvas')
  out.width = lastResult.width * scale
  out.height = lastResult.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, out.width, out.height)

  out.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pixelforge_${lastResult!.width}x${lastResult!.height}_x${scale}.png`
    a.click()
    URL.revokeObjectURL(a.href)
  }, 'image/png')
}

// --- UI イベント ---
function updateVisibility(): void {
  const dither = currentDither()
  bayerRow.hidden = dither !== 'ordered'
  serpentineRow.hidden = dither !== 'fs'
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
document
  .querySelectorAll('input[name="dither"]')
  .forEach((el) => el.addEventListener('change', onControlChange))
document.querySelectorAll('.chip').forEach((chip) =>
  chip.addEventListener('click', () => {
    outW.value = (chip as HTMLElement).dataset.w ?? '16'
    outH.value = (chip as HTMLElement).dataset.h ?? '16'
    onControlChange()
  })
)

function onControlChange(): void {
  strengthVal.textContent = Number(strength.value).toFixed(2)
  updateVisibility()
  renderSwatches(activePalette())
  render()
}

paletteSelect.addEventListener('change', () => {
  renderSwatches(activePalette())
  render()
})

applyCustom.addEventListener('click', () => {
  const pal = parsePaletteText(customPalette.value, '自作パレット')
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
  render()
})

exportBtn.addEventListener('click', exportPng)

// 初期表示
renderSwatches(activePalette())
updateVisibility()
