// AI 背景切り抜き（U²-Netp / onnxruntime-web・完全ブラウザ内・自前ホスト）。
// モデルと wasm は同一オリジンから配信（CSP: connect-src 'self'）。初回のみ読み込み、以降キャッシュ。
// Pages は cross-origin isolation 不可のため単一スレッド WASM で動かす（SharedArrayBuffer 不要）。
import type * as Ort from 'onnxruntime-web'
import type { PixelImage } from '../types'
import { toModelInput, maskToAlpha, applyAlphaMask, MODEL_SIZE } from './segmentPreprocess'

const BASE = import.meta.env.BASE_URL // 本番 '/pixel-forge/'、dev '/'

let sessionPromise: Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> | null = null

function loadSession(): Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web')
      ort.env.wasm.numThreads = 1 // COOP/COEP 無し環境（GitHub Pages）は単一スレッド
      ort.env.wasm.proxy = false
      // wasm は Vite がバンドルし import.meta.url で解決される（同一オリジン）。wasmPaths は設定しない。
      const session = await ort.InferenceSession.create(`${BASE}models/u2netp.onnx`, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
      return { ort, session }
    })().catch((e) => {
      sessionPromise = null // 失敗時は次回リトライできるよう解除
      throw e
    })
  }
  return sessionPromise
}

export interface AiBgOptions {
  onStatus?: (msg: string) => void
}

/**
 * U²-Netp で被写体マスクを推定し、背景を透明化した新しい画像を返す。
 * 入力は変更しない。失敗時は例外を投げる（呼び出し側で握る）。
 */
export async function removeBackgroundAI(
  img: PixelImage,
  opts: AiBgOptions = {}
): Promise<PixelImage> {
  const { onStatus } = opts
  onStatus?.('AIモデルを読み込み中（初回のみ・数MB）…')
  const { ort, session } = await loadSession()
  onStatus?.('背景を解析中…')
  const input = toModelInput(img, MODEL_SIZE)
  const tensor = new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE])
  const feeds: Record<string, Ort.Tensor> = { [session.inputNames[0]]: tensor }
  const results = await session.run(feeds)
  const maskTensor = results[session.outputNames[0]] // U²-Net の主出力 d0
  const mask = maskTensor.data as Float32Array
  const alpha = maskToAlpha(mask, MODEL_SIZE, MODEL_SIZE, img.width, img.height)
  return applyAlphaMask(img, alpha)
}

/** 任意: モデルを先読みして初回待ちを減らす。 */
export function preloadAiBg(): void {
  void loadSession().catch(() => {})
}
