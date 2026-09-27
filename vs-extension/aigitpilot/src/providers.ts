// AI provider calls. No VS Code imports, so tests can load it directly.
import * as http from 'http';
import * as https from 'https';

export type ProviderId = 'ollama' | 'groq' | 'gemini' | 'openrouter';

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  ollama: 'Ollama', groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter',
};

export interface ProviderSettings {
  provider: ProviderId;
  model: string;
  apiKey: string;
  ollamaUrl: string;
}

export interface ChatPrompt { system: string; user: string }

export type ErrorKind = 'unreachable' | 'auth' | 'rateLimit' | 'model' | 'timeout' | 'cancelled' | 'other';

export class ProviderError extends Error {
  constructor(message: string, readonly kind: ErrorKind, readonly status?: number) { super(message); }
}

const TIMEOUT_MS = 120_000;
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const CHAT_URL = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

interface HttpResult { status: number; body: string }

function request(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: object, signal?: AbortSignal): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ProviderError('Cancelled.', 'cancelled')); return; }
    const target = new URL(url);
    const data = body === undefined ? undefined : JSON.stringify(body);
    const allHeaders: Record<string, string | number> = { ...headers };
    if (data !== undefined) {
      allHeaders['Content-Type'] = 'application/json';
      allHeaders['Content-Length'] = Buffer.byteLength(data);
    }
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.request(target, { method, headers: allHeaders }, res => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { out += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new ProviderError(`No answer within ${TIMEOUT_MS / 1000} seconds.`, 'timeout')), TIMEOUT_MS);
    const onAbort = () => req.destroy(new ProviderError('Cancelled.', 'cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); });
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof ProviderError) { reject(err); return; }
      const offline = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(err.code ?? '');
      reject(new ProviderError(`Cannot reach ${target.host} (${err.code ?? err.message}).`, offline ? 'unreachable' : 'other'));
    });
    if (data !== undefined) { req.write(data); }
    req.end();
  });
}

function failure(label: string, r: HttpResult): ProviderError {
  let detail = '';
  try {
    const j = JSON.parse(r.body);
    detail = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message ?? '';
  } catch { detail = r.body.trim().slice(0, 200); }
  let kind: ErrorKind = 'other';
  if (r.status === 401 || r.status === 403 || /api[ _-]?key/i.test(detail)) { kind = 'auth'; }
  else if (r.status === 429) { kind = 'rateLimit'; }
  else if (r.status === 404 || /model/i.test(detail) && /not (found|valid|exist)|does not exist|invalid|decommissioned|deprecated/i.test(detail)) { kind = 'model'; }
  return new ProviderError(`${label} answered ${r.status}${detail ? `: ${detail}` : '.'}`, kind, r.status);
}

function parse(label: string, r: HttpResult): any {
  if (r.status < 200 || r.status >= 300) { throw failure(label, r); }
  try { return JSON.parse(r.body); }
  catch { throw new ProviderError(`${label} sent a reply that is not JSON.`, 'other', r.status); }
}

function authHeaders(s: ProviderSettings): Record<string, string> {
  switch (s.provider) {
    case 'ollama': return {};
    case 'gemini': return { 'x-goog-api-key': s.apiKey };
    case 'openrouter': return { Authorization: `Bearer ${s.apiKey}`, 'X-Title': 'AI Git Pilot' };
    default: return { Authorization: `Bearer ${s.apiKey}` };
  }
}

function requireKey(s: ProviderSettings): void {
  if (s.provider !== 'ollama' && !s.apiKey) {
    throw new ProviderError(`No ${PROVIDER_LABEL[s.provider]} API key is saved.`, 'auth');
  }
}

const ollamaBase = (s: ProviderSettings) => s.ollamaUrl.replace(/\/+$/, '');
const geminiModel = (s: ProviderSettings) => encodeURIComponent(s.model.replace(/^models\//, ''));

export async function complete(s: ProviderSettings, p: ChatPrompt, signal?: AbortSignal): Promise<string> {
  requireKey(s);
  const label = PROVIDER_LABEL[s.provider];
  const messages = [{ role: 'system', content: p.system }, { role: 'user', content: p.user }];

  if (s.provider === 'ollama') {
    const j = parse(label, await request('POST', `${ollamaBase(s)}/api/chat`, {},
      { model: s.model, messages, stream: false, options: { temperature: 0.3 } }, signal));
    return j.message?.content ?? '';
  }

  if (s.provider === 'gemini') {
    const j = parse(label, await request('POST', `${GEMINI_API}/models/${geminiModel(s)}:generateContent`, authHeaders(s), {
      systemInstruction: { parts: [{ text: p.system }] },
      contents: [{ role: 'user', parts: [{ text: p.user }] }],
      generationConfig: { temperature: 0.3 },
    }, signal));
    const parts: { text?: string; thought?: boolean }[] = j.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter(part => !part.thought).map(part => part.text ?? '').join('');
    if (!text && j.promptFeedback?.blockReason) {
      throw new ProviderError(`Gemini blocked the request (${j.promptFeedback.blockReason}).`, 'other');
    }
    return text;
  }

  const j = parse(label, await request('POST', CHAT_URL[s.provider], authHeaders(s),
    { model: s.model, messages, temperature: 0.3, max_tokens: 1024 }, signal));
  return j.choices?.[0]?.message?.content ?? '';
}

const byNewest = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

/** Chat models the provider offers right now (for Ollama: the ones already pulled). */
export async function listModels(s: ProviderSettings, signal?: AbortSignal): Promise<string[]> {
  const label = PROVIDER_LABEL[s.provider];
  switch (s.provider) {
    case 'ollama': {
      const j = parse(label, await request('GET', `${ollamaBase(s)}/api/tags`, {}, undefined, signal));
      return (j.models ?? []).map((m: { name: string }) => m.name).sort();
    }
    case 'groq': {
      requireKey(s);
      const j = parse(label, await request('GET', 'https://api.groq.com/openai/v1/models', authHeaders(s), undefined, signal));
      return (j.data ?? [])
        .filter((m: { id: string; active?: boolean }) => m.active !== false && !/whisper|tts|guard|orpheus|playai|distil/i.test(m.id))
        .map((m: { id: string }) => m.id).sort();
    }
    case 'openrouter': {
      const j = parse(label, await request('GET', 'https://openrouter.ai/api/v1/models', {}, undefined, signal));
      type Model = { id: string; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[] } };
      return (j.data ?? [])
        .filter((m: Model) => (m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'))
          && (m.architecture?.output_modalities?.includes('text') ?? true))
        .map((m: Model) => m.id).sort();
    }
    case 'gemini': {
      requireKey(s);
      const j = parse(label, await request('GET', `${GEMINI_API}/models?pageSize=1000`, authHeaders(s), undefined, signal));
      return (j.models ?? [])
        .filter((m: { name: string; supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent')
          && /gemini/.test(m.name) && !/image|tts|embedding|live|audio/i.test(m.name))
        .map((m: { name: string }) => m.name.replace(/^models\//, '')).sort(byNewest);
    }
  }
}
