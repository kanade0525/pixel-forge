// Gemini 画像生成の共有コア（フレームワーク非依存）。
// Cloudflare Pages Functions（本番プロキシ）と Vite dev ミドルウェア（ローカル）の
// 双方から呼ばれる。API キーはこの関数の呼び出し側（サーバー側）が env から渡す。
// クライアントには一切キーを出さない（＝ブラウザは同一オリジンの /api/generate を叩くだけ）。

export interface GenerateRequest {
  prompt: string
  image?: string // 下絵(img2img)用の base64（data: プレフィックスなし）
  mimeType?: string // 例 image/png
}

export interface GenerateOk {
  ok: true
  image: string // 生成画像の base64（data: プレフィックスなし）
  mimeType: string
}
export interface GenerateErr {
  ok: false
  status: number
  message: string
}
export type GenerateResult = GenerateOk | GenerateErr

// Nano Banana。無料枠が大きく画像編集(img2img)対応。env で差し替え可能。
const DEFAULT_MODEL = 'gemini-2.5-flash-image'
const MAX_PROMPT = 2000
const MAX_IMAGE_B64 = 9_000_000 // 下絵 base64 の上限（およそ 6.7MB のバイナリ相当）

interface GeminiInlineData {
  data?: string
  mime_type?: string
  mimeType?: string
}
interface GeminiPart {
  text?: string
  inline_data?: GeminiInlineData
  inlineData?: GeminiInlineData
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

export async function generateImage(
  apiKey: string,
  req: GenerateRequest,
  model: string = DEFAULT_MODEL
): Promise<GenerateResult> {
  const prompt = (req.prompt ?? '').trim()
  if (!prompt) return { ok: false, status: 400, message: 'プロンプトを入力してください' }
  if (prompt.length > MAX_PROMPT) return { ok: false, status: 400, message: 'プロンプトが長すぎます' }
  if (req.image && req.image.length > MAX_IMAGE_B64)
    return { ok: false, status: 413, message: '下絵の画像が大きすぎます' }

  const parts: GeminiPart[] = [{ text: prompt }]
  if (req.image) {
    parts.push({ inline_data: { mime_type: req.mimeType || 'image/png', data: req.image } })
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        // 画像を返させる。モデルによっては ['TEXT','IMAGE'] が必要な場合がある。
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    })
  } catch {
    return { ok: false, status: 502, message: 'AIサービスに接続できませんでした' }
  }

  if (!resp.ok) {
    let detail = ''
    try {
      const j = (await resp.json()) as GeminiResponse
      detail = j?.error?.message ?? ''
    } catch {
      /* body 解釈失敗は無視 */
    }
    // キー不正等はそのままステータスを返す（401/403/429 など）
    return { ok: false, status: resp.status, message: detail || `AIサービスエラー (${resp.status})` }
  }

  let data: GeminiResponse
  try {
    data = (await resp.json()) as GeminiResponse
  } catch {
    return { ok: false, status: 502, message: 'AIサービスの応答を解釈できませんでした' }
  }

  const cand = data.candidates?.[0]
  const outParts = cand?.content?.parts ?? []
  for (const p of outParts) {
    const inl = p.inline_data ?? p.inlineData
    if (inl?.data) {
      return { ok: true, image: inl.data, mimeType: inl.mime_type ?? inl.mimeType ?? 'image/png' }
    }
  }
  const reason = cand?.finishReason ?? data.promptFeedback?.blockReason
  return {
    ok: false,
    status: 422,
    message: reason ? `画像が生成されませんでした（${reason}）` : '画像が生成されませんでした',
  }
}
