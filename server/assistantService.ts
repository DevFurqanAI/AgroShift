import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const ASSISTANT_TIMEOUT_MS = 25000;

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
  const systemInstruction = [
    'You are Ask AgroShift, a practical, farmer-friendly agricultural decision-support assistant.',
    'Your mission is to help farmers understand climate observations, soil context, crop rotation options, and satellite vegetation indicators in plain, respectful language.',
    'STRICT SCIENTIFIC HONESTY RULES:',
    '1. Only reference measurements that actually appear in the provided Farm Context JSON.',
    '2. NEVER invent, estimate, or hallucinate NASA POWER climate figures, Copernicus Sentinel-2 NDVI/NDMI readings, or soil lab test numbers when they are missing or unavailable.',
    '3. When climate or satellite data is unavailable, clearly tell the farmer that those live observations are not currently loaded and explain how to interpret the concept generally.',
    '4. Distinguish clearly between NASA POWER (historical climate data) and ESA/Copernicus Sentinel-2 (vegetation and moisture indicators NDVI/NDMI).',
    '5. Clarify that NDVI/NDMI are vegetation indicators, not direct soil fertility lab measurements or confirmed diagnoses.',
    '6. Clarify that historical climate observations are not future weather forecasts.',
    '7. Keep responses concise, structured with short paragraphs or plain bullet lists, and tailored to the farmer’s stated farm size, water availability, and priorities.',
    body.language
      ? `Respond in ${body.language} unless the user writes in another language.`
      : 'Respond in clear English.',
  ].join('\n');

  const contextSummary = body.farmContext
    ? `\n\nProvided Farm & Observation Context (ground truth for this session):\n${JSON.stringify(
        body.farmContext,
        null,
        2
      )}`
    : '\n\nNo farm profile is currently selected.';

  const conversationTranscript = messages
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Farmer' : 'Ask AgroShift'}: ${m.content}`)
    .join('\n\n');

  const client = (options.clientFactory ?? createGeminiClient)(apiKey);
  const config: Record<string, unknown> = { systemInstruction };
  if (/^gemini-[34]/i.test(model)) {
    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.LOW,
    };
  }

  const timeoutMs = options.timeoutMs ?? ASSISTANT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      client.models.generateContent({
        model,
        contents: `${conversationTranscript}${contextSummary}`,
        config,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Request timeout exceeded')), timeoutMs);
      }),
    ]);

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
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
