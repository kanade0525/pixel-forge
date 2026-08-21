// Cloudflare Pages Function: POST /api/generate
// ブラウザは同一オリジンのこのエンドポイントを叩く（外部通信はサーバー側で完結）。
// GEMINI_API_KEY は Cloudflare のシークレット環境変数（リポジトリには置かない）。
import { generateImage, type GenerateRequest } from '../../src/server/gemini'

interface Env {
  GEMINI_API_KEY?: string
  GEMINI_IMAGE_MODEL?: string
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

// Pages Functions のエントリ（全メソッド）。型は Cloudflare 依存を避けて最小限に。
export async function onRequest(ctx: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = ctx
  if (request.method !== 'POST') return json({ error: 'POST のみ対応しています' }, 405)
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'サーバーにAPIキー(GEMINI_API_KEY)が設定されていません' }, 500)
  }
  let body: GenerateRequest
  try {
    body = (await request.json()) as GenerateRequest
  } catch {
    return json({ error: '不正なリクエストです' }, 400)
  }
  const result = await generateImage(env.GEMINI_API_KEY, body, env.GEMINI_IMAGE_MODEL)
  if (!result.ok) return json({ error: result.message }, result.status)
  return json({ image: result.image, mimeType: result.mimeType }, 200)
}
