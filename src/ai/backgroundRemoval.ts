// AI 背景切り抜き（U²-Netp / onnxruntime-web・完全ブラウザ内・自前ホスト）。
// モデルと wasm は同一オリジンから配信（CSP: connect-src 'self'）。初回のみ読み込み、以降キャッシュ。
// Pages は cross-origin isolation 不可（COOP/COEP を付けられない）ため、SharedArrayBuffer が使えない。
// onnxruntime-web 1.19 以降が同梱する wasm は -threaded 版のみで、グルーコードが
// メインスレッドで無条件に shared:true な WebAssembly.Memory を作るため初期化に失敗する
// （numThreads=1 では回避できない）。非スレッド版 wasm を同梱する 1.18.0 に固定し、
// vite.config.ts の ortWasmPlugin が /ort/ へ配る単一スレッド wasm を wasmPaths で明示指定する。
import type * as Ort from 'onnxruntime-web'
import type { PixelImage } from '../types'
import { toModelInput, maskToAlpha, applyAlphaMask, MODEL_SIZE } from './segmentPreprocess'

const BASE = import.meta.env.BASE_URL // 本番 '/pixel-forge/'、dev '/'

let sessionPromise: Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> | null = null

function loadSession(): Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      // wasm EP だけのサブパス。webgl/webgpu を含まず、protobufjs の直接 eval も入らないため
      // CSP に 'unsafe-eval' を足さずに済む（許可しているのは 'wasm-unsafe-eval' のみ）。
      const ort = await import('onnxruntime-web/wasm')
      ort.env.wasm.numThreads = 1 // COOP/COEP 無し環境（GitHub Pages）は単一スレッド
      ort.env.wasm.simd = true // SIMD 非対応環境では ort-wasm.wasm へ自動フォールバック
      ort.env.wasm.proxy = false
      ort.env.wasm.wasmPaths = `${BASE}ort/` // 同一オリジン配信（CSP: default-src 'self'）
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
