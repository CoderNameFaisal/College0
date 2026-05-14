/** Google Gemini generateContent + embedContent (REST v1beta). */

/** Default chat/JSON model: 2.0 Flash is deprecated with free-tier limit 0 — use 2.5 family. */
function defaultModel(): string {
  return Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-2.5-flash-lite'
}

function embeddingModel(): string {
  return Deno.env.get('GEMINI_EMBEDDING_MODEL')?.trim() || 'gemini-embedding-001'
}

/** 768-dim matches `vector(768)` in Postgres (see migration). */
function embeddingDim(): number {
  const n = Number(Deno.env.get('GEMINI_EMBEDDING_DIM') ?? '768')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 768
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  error?: { message?: string }
}

async function readGeminiHttpError(res: Response, modelLabel: string): Promise<string> {
  const raw = await res.text()
  try {
    const j = JSON.parse(raw) as {
      error?: { code?: number; message?: string; status?: string }
    }
    const msg = j.error?.message ?? raw
    const code = j.error?.code
    if (code === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) {
      const hint =
        modelLabel.startsWith('gemini-embedding') || modelLabel.includes('embedding')
          ? `Set Edge secret GEMINI_EMBEDDING_MODEL (e.g. gemini-embedding-001) and billing if needed.`
          : `Set Edge secret GEMINI_MODEL to a current model such as gemini-2.5-flash-lite or gemini-2.5-flash; enable billing in Google AI / Cloud if you need higher limits.`
      return [
        msg,
        ` (Gemini ${code ?? res.status}: quota/rate limit. Model: ${modelLabel}. ${hint} See https://ai.google.dev/gemini-api/docs/rate-limits )`,
      ].join('')
    }
    return msg
  } catch {
    return raw || `${res.status} ${res.statusText}`
  }
}

/** Single text embedding for RAG queries (cosine search in pgvector). */
export async function geminiEmbedText(opts: {
  apiKey: string
  text: string
  taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'
}): Promise<number[]> {
  const model = embeddingModel()
  const dim = embeddingDim()
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
  )
  url.searchParams.set('key', opts.apiKey)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: opts.text }] },
      taskType: opts.taskType ?? 'RETRIEVAL_QUERY',
      outputDimensionality: dim,
    }),
  })
  if (!res.ok) throw new Error(await readGeminiHttpError(res, model))
  const json = (await res.json()) as {
    embedding?: { values?: number[] }
    error?: { message?: string }
  }
  const values = json.embedding?.values
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(json.error?.message ?? 'Gemini embedContent returned no embedding.values')
  }
  if (values.length !== dim) {
    throw new Error(`Expected embedding length ${dim}, got ${values.length} (check GEMINI_EMBEDDING_MODEL / GEMINI_EMBEDDING_DIM)`)
  }
  return values
}

function extractText(json: GeminiGenerateContentResponse): string {
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text === 'string' && text.trim()) return text
  throw new Error(json.error?.message ?? 'Gemini returned no text (empty or blocked candidates)')
}

export async function geminiGenerateText(opts: {
  apiKey: string
  systemInstruction: string
  userMessage: string
  temperature?: number
}): Promise<string> {
  const model = defaultModel()
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  )
  url.searchParams.set('key', opts.apiKey)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
      },
    }),
  })
  if (!res.ok) throw new Error(await readGeminiHttpError(res, model))
  return extractText(await res.json())
}

/** Asks the model for JSON; uses responseMimeType when supported. */
export async function geminiGenerateJson(opts: {
  apiKey: string
  systemInstruction: string
  userMessage: string
  temperature?: number
}): Promise<string> {
  const model = defaultModel()
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  )
  url.searchParams.set('key', opts.apiKey)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        responseMimeType: 'application/json',
      },
    }),
  })
  if (!res.ok) throw new Error(await readGeminiHttpError(res, model))
  return extractText(await res.json())
}
