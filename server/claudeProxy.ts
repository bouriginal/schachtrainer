import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { buildExplainPrompt, SYSTEM_PROMPT, validateExplainRequest } from '../src/core/coach/llm/prompt.ts'

/**
 * Vite-Plugin: lokaler Proxy für "Genauer erklären".
 * Der API-Key (ANTHROPIC_API_KEY in .env, ohne VITE_-Präfix) bleibt im Node-Prozess
 * und gelangt nie in den Browser-Code.
 *
 *   GET  /api/coach/status   → { available: boolean }
 *   POST /api/coach/explain  → { text } oder { error }
 */
export const CLAUDE_MODEL = 'claude-opus-5-5'

export function claudeProxy(apiKey: string | undefined): Plugin {
  const client = apiKey ? new Anthropic({ apiKey }) : null

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? ''
    if (url === '/api/coach/status' && req.method === 'GET') {
      return json(res, 200, { available: !!client, model: CLAUDE_MODEL })
    }
    if (url !== '/api/coach/explain') return next()
    if (req.method !== 'POST') return json(res, 405, { error: 'Nur POST erlaubt' })
    if (!client) return json(res, 503, { error: 'Kein API-Key: Lege ANTHROPIC_API_KEY in der Datei .env an und starte den Server neu.' })

    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return json(res, 400, { error: 'Ungültige Anfrage' })
    }
    const request = validateExplainRequest(body)
    if (!request) return json(res, 400, { error: 'Ungültige Anfrage' })

    try {
      const response = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        // Bei einer Ablehnung durch Sicherheitsfilter automatisch auf ein Ersatzmodell ausweichen
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildExplainPrompt(request) }],
      })
      if (response.stop_reason === 'refusal') {
        return json(res, 502, { error: 'Claude hat diese Anfrage abgelehnt.' })
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n')
        .trim()
      return json(res, 200, { text })
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json(res, 401, { error: 'Der API-Key ist ungültig.' })
      if (e instanceof Anthropic.RateLimitError) return json(res, 429, { error: 'Zu viele Anfragen – bitte kurz warten.' })
      if (e instanceof Anthropic.APIConnectionError) return json(res, 502, { error: 'Keine Verbindung zur Claude-API.' })
      if (e instanceof Anthropic.APIError) return json(res, 502, { error: `Claude-API-Fehler (${e.status ?? '?'}).` })
      console.error('[claudeProxy]', e)
      return json(res, 500, { error: 'Unerwarteter Fehler.' })
    }
  }

  return {
    name: 'schachtrainer-claude-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
  }
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage, limit = 16_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8')
      if (data.length > limit) {
        reject(new Error('zu groß'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
