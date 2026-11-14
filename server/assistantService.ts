import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  evaluateDomainPolicy,
  selectRelevantFarmContext,
  STANDARD_OUT_OF_SCOPE_REPLY,
} from './domainPolicy.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const ASSISTANT_TIMEOUT_MS = 25000;
const CLASSIFIER_TIMEOUT_MS = 8000;

export { STANDARD_OUT_OF_SCOPE_REPLY };

export interface AssistantMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantRequestBody {
  messages?: AssistantMessageInput[];
  farmContext?: Record<string, unknown> | null;
  language?: string;
}

export interface AssistantStatusPayload {
  available: boolean;
  model: string | null;
  configuredModel: string;
  provider: 'server-gemini';
  reason: string | null;
}

export interface AssistantHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export interface GeminiClientLike {
  models: {
    generateContent: (params: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

export function resolveGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.GEMINI_MODEL?.trim();
  return configured || DEFAULT_GEMINI_MODEL;
}

export function resolveGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return apiKey;
}

export function createGeminiClient(apiKey: string): GeminiClientLike {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'agroshift-assistant',
      },
    },
  }) as unknown as GeminiClientLike;
}

export function getAssistantStatus(
  env: NodeJS.ProcessEnv = process.env
): AssistantStatusPayload {
  const apiKey = resolveGeminiApiKey(env);
  const configuredModel = resolveGeminiModel(env);
  if (!apiKey) {
    return {
      available: false,
      model: null,
      configuredModel,
      provider: 'server-gemini',
      reason: 'GEMINI_API_KEY is not configured on this server.',
    };
  }
  return {
    available: true,
    model: configuredModel,
    configuredModel,
    provider: 'server-gemini',
    reason: null,
  };
}

export function classifyAssistantError(err: unknown): {
  status: number;
  code: string;
  error: string;
} {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();
  const statusCode =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : undefined;

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('aborted')
  ) {
    return {
      status: 504,
      code: 'ASSISTANT_TIMEOUT',
      error:
        'The AI assistant took too long to respond. Please try again with a shorter question.',
    };
  }

  if (
    statusCode === 429 ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return {
      status: 429,
      code: 'ASSISTANT_QUOTA_EXCEEDED',
      error:
        'The AI assistant reached its temporary request limit. Please wait a minute and try again.',
    };
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthorized') ||
    lower.includes('unauthenticated')
  ) {
    return {
      status: 502,
      code: 'ASSISTANT_AUTH_ERROR',
      error:
        'The AI service key on the server was rejected or lacks permission. Please verify the server GEMINI_API_KEY setting.',
    };
  }

  if (
    statusCode === 404 ||
    lower.includes('not_found') ||
    lower.includes('is not found for api version') ||
    (lower.includes('model') && lower.includes('not supported'))
  ) {
    return {
      status: 502,
      code: 'ASSISTANT_MODEL_UNSUPPORTED',
      error:
        'The configured AI model is unavailable for this API key. Check the server GEMINI_MODEL configuration.',
    };
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('network')
  ) {
    return {
      status: 502,
      code: 'ASSISTANT_NETWORK_ERROR',
      error:
        'Could not reach the AI service due to a network error. Please try again shortly.',
    };
  }

  return {
    status: 502,
    code: 'ASSISTANT_ERROR',
    error: 'Unable to reach the AI assistant service right now. Please try again shortly.',
  };
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Request timeout exceeded')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function classifyAmbiguousRelevance(
  client: GeminiClientLike,
  model: string,
  latestMessage: string,
  recentMessages: AssistantMessageInput[],
  timeoutMs: number
): Promise<boolean> {
  const classifierInstruction = [
    'You are a strict domain classifier for Ask AgroShift (an agricultural decision-support app).',
    'Classify ONLY whether the user query relates to:',
    '1) farming, crops, crop rotations, seasonal planting, soil, irrigation, rainfall, agricultural climate adaptation, farm management,',
    '2) NASA POWER climate observations, Sentinel-2 / Copernicus NDVI & NDMI vegetation indicators, field health,',
    '3) using AgroShift features or farm-related calculations (area, water, rainfall, temperature conversions).',
    'Queries about general math/algebra unrelated to farming, programming/how AgroShift was programmed, trivia, jokes, stories, sports, politics, or casual chat MUST return {"in_scope":false}.',
    'Do not solve or answer the query. Return strictly JSON: {"in_scope": true} or {"in_scope": false}.',
  ].join('\n');

  const recentPreview = recentMessages
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 160)}`)
    .join('\n');

  const config: Record<string, unknown> = {
    systemInstruction: classifierInstruction,
    responseMimeType: 'application/json',
  };
  if (/^gemini-[34]/i.test(model)) {
    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.LOW,
    };
  }

  const response = await runWithTimeout(
    client.models.generateContent({
      model,
      contents: `Recent context:\n${recentPreview || 'None'}\n\nClassify latest message:\n${latestMessage}`,
      config,
    }),
    Math.min(timeoutMs, CLASSIFIER_TIMEOUT_MS)
  );

  const raw = (response?.text ?? '').trim();
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { in_scope?: unknown };
    if (typeof parsed.in_scope === 'boolean') {
      return parsed.in_scope;
    }
  } catch {
    // Fallback if test stub or model returned plain text
  }

  if (/^\s*(?:false|out_of_scope|out of scope)\b/i.test(raw)) {
    return false;
  }
  return true;
}

export async function handleAssistantRequest(
  rawBody: unknown,
  options: {
    env?: NodeJS.ProcessEnv;
    clientFactory?: (apiKey: string) => GeminiClientLike;
    timeoutMs?: number;
  } = {}
): Promise<AssistantHandlerResult> {
  const env = options.env ?? process.env;
  const apiKey = resolveGeminiApiKey(env);
  if (!apiKey) {
    return {
      status: 503,
      body: {
        code: 'ASSISTANT_UNAVAILABLE',
        error: 'Ask AgroShift AI service is not configured on the server.',
      },
    };
  }

  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as AssistantRequestBody;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const latestUserMessage = [...messages].reverse().find((m) => m?.role === 'user');

  if (!latestUserMessage || !latestUserMessage.content?.trim()) {
    return {
      status: 400,
      body: {
        code: 'INVALID_REQUEST',
        error: 'Please enter a question for Ask AgroShift.',
      },
    };
  }

  const model = resolveGeminiModel(env);
  const evaluation = evaluateDomainPolicy(
    latestUserMessage.content,
    messages,
    body.farmContext
  );

  if (evaluation.decision === 'out_of_scope') {
    return {
      status: 200,
      body: {
        reply: STANDARD_OUT_OF_SCOPE_REPLY,
        model,
        policyDecision: 'out_of_scope',
        reason: evaluation.reason,
      },
    };
  }

  const client = (options.clientFactory ?? createGeminiClient)(apiKey);
  const timeoutMs = options.timeoutMs ?? ASSISTANT_TIMEOUT_MS;

  try {
    if (evaluation.decision === 'ambiguous') {
      const allowed = await classifyAmbiguousRelevance(
        client,
        model,
        latestUserMessage.content,
        messages,
        timeoutMs
      );
      if (!allowed) {
        return {
          status: 200,
          body: {
            reply: STANDARD_OUT_OF_SCOPE_REPLY,
            model,
            policyDecision: 'out_of_scope',
            reason: 'classifier_out_of_scope',
          },
        };
      }
    }

    const relevantContext = selectRelevantFarmContext(
      latestUserMessage.content,
      messages,
      body.farmContext
    );

    const systemInstruction = [
      'You are Ask AgroShift, a strictly domain-specific agricultural decision-support assistant.',
      'ALLOWED TOPICS ONLY: agriculture, crop rotation, crop selection & seasonal planting, soil health, irrigation & water availability, rainfall, agricultural climate adaptation, farm management, NASA POWER historical climate observations, ESA/Copernicus Sentinel-2 NDVI/NDMI vegetation & field-health interpretation, AgroShift rotation/scenario comparison results, using AgroShift features, explaining relevant saved farm information, and farming-related calculations (area, rainfall, temperature, water-demand conversions).',
      `STRICT REFUSAL POLICY: If the request falls outside these topics (unrelated math/algebra, programming or how AgroShift was built, trivia, jokes, stories, sports, politics, or casual chatting), respond ONLY with: "${STANDARD_OUT_OF_SCOPE_REPLY}" — do not solve or engage with the off-topic part.`,
      'STRICT SCIENTIFIC HONESTY RULES:',
      '1. Distinguish evidence categories explicitly whenever referencing farm data: (a) actual satellite/weather measurements (Sentinel-2 NDVI/NDMI, pixel coverage, Open-Meteo), (b) historical climate observations (NASA POWER — never forecasts), (c) farmer-provided information (farm profile, soil inputs, crop history), (d) model-generated screening interpretations (rotation/scenario scores), and (e) missing or unverified information.',
      '2. Only reference farm measurements or profile details when Relevant Farm Context is provided below. Never volunteer or append unsolicited farm summaries for general agricultural questions.',
      '3. Never alter or fabricate NASA POWER figures, Sentinel-2 readings, or soil lab values. When required data is missing or not loaded, state the limitation clearly.',
      '4. Do not assume or diagnose a field as fallow, harvested, planted, irrigated, diseased, or moisture-stressed without supporting evidence. For example, low NDVI such as 0.123 may indicate sparse vegetation, bare soil, or early emergence, and cannot independently confirm crop growth stage.',
      '5. Do not claim guaranteed yields, fixed nitrogen credits, or field-validated agronomic outcomes.',
      '6. Format responses clearly using Markdown headings, bullet lists, compact tables, and KaTeX math notation ($...$ inline or $$...$$ block) for agricultural formulas and unit conversions when helpful.',
      body.language && body.language !== 'en'
        ? `Respond in ${body.language} unless the user writes in English.`
        : 'Respond in clear English.',
    ].join('\n');

    const contextSection = relevantContext
      ? `\n\nRelevant Farm & Session Context (ground truth slices needed for this question):\n${JSON.stringify(
          relevantContext,
          null,
          2
        )}`
      : '\n\nNo farm-specific data is required for this question. Do not append or summarize any saved farm profile details.';

    const conversationTranscript = messages
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Farmer' : 'Ask AgroShift'}: ${m.content}`)
      .join('\n\n');

    const config: Record<string, unknown> = { systemInstruction };
    if (/^gemini-[34]/i.test(model)) {
      config.thinkingConfig = {
        thinkingLevel: ThinkingLevel.LOW,
      };
    }

    const response = await runWithTimeout(
      client.models.generateContent({
        model,
        contents: `${conversationTranscript}${contextSection}`,
        config,
      }),
      timeoutMs
    );

    const replyText = response?.text?.trim();
    if (!replyText) {
      return {
        status: 502,
        body: {
          code: 'EMPTY_RESPONSE',
          error: 'The assistant returned an empty response. Please try asking again.',
        },
      };
    }

    return {
      status: 200,
      body: {
        reply: replyText,
        model,
        policyDecision: 'in_scope',
        farmContextAttached: Boolean(relevantContext),
      },
    };
  } catch (err) {
    const classified = classifyAssistantError(err);
    console.error('[Ask AgroShift] Gemini API error:', classified.code);
    return {
      status: classified.status,
      body: {
        code: classified.code,
        error: classified.error,
      },
    };
  }
}
