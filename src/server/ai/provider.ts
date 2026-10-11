import { z, type ZodType } from 'zod';
import { env } from '../config';
import { HttpError } from '../lib/errors';
import { errMessage, log } from '../lib/log';

export interface Usage { tokensIn: number; tokensOut: number }
export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  schemaDescription: string;
  maxTokens: number;
}
export interface JsonResult<T> { data: T; usage: Usage }

/** The only thing the rest of the app knows about AI. Swap the provider with environment variables. */
export interface AiProvider {
  name: string;
  model: string;
  generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
}

/** Thrown for failures that retrying won't fix (bad key, refused request, unusable output). */
export class AiError extends Error {
  constructor(message: string, public retryable = false) { super(message); }
}

const jsonSchemaOf = (schema: ZodType) => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _drop;
  return rest;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const timeout = env().AI_TIMEOUT_MS;
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 300);
      const transient = res.status === 429 || res.status >= 500 || res.status === 408;
      if (!transient) throw new AiError(res.status === 401 || res.status === 403 ? 'The AI provider rejected the API key.' : `The AI provider rejected the request (${res.status}).`);
      last = new AiError(`AI provider returned ${res.status}: ${text}`, true);
    } catch (e) {
      if (e instanceof AiError && !e.retryable) throw e;
      last = e instanceof AiError ? e : new AiError(e instanceof Error && e.name === 'TimeoutError' ? 'The AI provider took too long to respond.' : `Could not reach the AI provider: ${errMessage(e)}`, true);
    }
    log.warn('ai_retry', { attempt: attempt + 1, message: errMessage(last) });
    await sleep(1500 * 2 ** attempt);
  }
  throw last instanceof AiError ? last : new AiError(errMessage(last), true);
}

function anthropic(apiKey: string, model: string, baseUrl?: string): AiProvider {
  return {
    name: 'anthropic', model,
    async generateJson<T>(req: JsonRequest<T>) {
      const res = await post(`${baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, {
        model, max_tokens: req.maxTokens, system: req.system,
        messages: [{ role: 'user', content: req.user }],
        tools: [{ name: req.schemaName, description: req.schemaDescription, input_schema: jsonSchemaOf(req.schema) }],
        tool_choice: { type: 'tool', name: req.schemaName },
      }) as { content?: { type: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string };
      const block = res.content?.find((c) => c.type === 'tool_use');
      if (!block) throw new AiError('The AI returned no structured output.');
      if (res.stop_reason === 'max_tokens') throw new AiError(`The AI response was cut off (${req.schemaName}). Try fewer cards or questions.`);
      return { data: parse(req.schema, block.input), usage: { tokensIn: res.usage?.input_tokens ?? 0, tokensOut: res.usage?.output_tokens ?? 0 } };
    },
  };
}

function openai(name: string, apiKey: string, model: string, baseUrl: string): AiProvider {
  return {
    name, model,
    async generateJson<T>(req: JsonRequest<T>) {
      const res = await post(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { authorization: `Bearer ${apiKey}` }, {
        model, ...(name === 'openai' ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }),
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
        response_format: { type: 'json_schema', json_schema: { name: req.schemaName, schema: jsonSchemaOf(req.schema), strict: false } },
      }) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const choice = res.choices?.[0];
      if (!choice?.message?.content) throw new AiError('The AI returned no structured output.');
      if (choice.finish_reason === 'length') throw new AiError(`The AI response was cut off (${req.schemaName}). Try fewer cards or questions.`);
      let raw: unknown;
      try { raw = JSON.parse(choice.message.content); } catch { throw new AiError('The AI returned malformed JSON.', true); }
      return { data: parse(req.schema, raw), usage: { tokensIn: res.usage?.prompt_tokens ?? 0, tokensOut: res.usage?.completion_tokens ?? 0 } };
    },
  };
}

function parse<T>(schema: ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new AiError(`The AI output did not match the expected format (${r.error.issues[0]?.path.join('.') || 'root'}: ${r.error.issues[0]?.message}).`, true);
  return r.data;
}

let override: AiProvider | null = null;
/** Test seam only — production code never calls this. */
export const __setProviderForTests = (p: AiProvider | null) => { override = p; };

export function getProvider(modelOverride?: string): AiProvider {
  if (override) return override;
  const e = env();
  if (!e.AI_PROVIDER || !e.AI_API_KEY) throw new HttpError(503, 'ai_not_configured', 'AI generation isn’t set up yet. Add AI_PROVIDER and AI_API_KEY to the server environment.');
  switch (e.AI_PROVIDER) {
    case 'anthropic': return anthropic(e.AI_API_KEY, modelOverride ?? e.AI_MODEL ?? 'claude-sonnet-5-5', e.AI_BASE_URL);
    case 'openai': return openai('openai', e.AI_API_KEY, modelOverride ?? e.AI_MODEL ?? 'gpt-4.1-mini', e.AI_BASE_URL ?? 'https://api.openai.com/v1');
    case 'openai-compatible':
      if (!e.AI_BASE_URL || !(modelOverride ?? e.AI_MODEL)) throw new HttpError(503, 'ai_not_configured', 'AI_BASE_URL and AI_MODEL are required for an OpenAI-compatible provider.');
      return openai('openai-compatible', e.AI_API_KEY, (modelOverride ?? e.AI_MODEL)!, e.AI_BASE_URL);
  }
}

export const aiConfigured = () => !!override || (!!env().AI_PROVIDER && !!env().AI_API_KEY);
