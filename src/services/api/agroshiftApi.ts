import type {
  AssistantStatusResponse,
  ClimateHistoryResponse,
  FieldAnalyzeRequest,
  FieldAnalyzeResponse,
  RotationCropsResponse,
  RotationPlanRequest,
  RotationPlanResponse,
  ScenarioComparisonResponse,
  ScenarioRotationRequest,
} from '../../types/api';
import { normalizeBaseUrl } from '../../utils/validation';

export const DEFAULT_PRODUCTION_API_URL = 'https://agroshift-backend-o6kr.onrender.com';

export const FARMER_ERROR_MESSAGES = {
  generic:
    "We couldn't retrieve the latest environmental information. Your farm details are safe. Please try again.",
  climate:
    'Climate information is temporarily unavailable. Your farm details are safe. Please try again.',
  fieldHealth:
    "We couldn't analyze this field right now. Your farm details are safe. Please try again.",
  rotation:
    "We couldn't retrieve rotation options right now. Your farm details are safe. Please try again.",
  catalog:
    'Live crop catalog could not be loaded. Showing standard crop options.',
} as const;

export function resolveApiBaseUrl(overrideUrl?: string): string {
  if (overrideUrl) {
    const clean = normalizeBaseUrl(overrideUrl);
    if (clean) return clean;
  }
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const envUrl = normalizeBaseUrl(metaEnv?.VITE_API_BASE_URL || '');
  return envUrl || DEFAULT_PRODUCTION_API_URL;
}

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code: 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'INVALID_RESPONSE';
  readonly technicalDetail?: string;

  constructor(
    farmerMessage: string,
    code: ApiClientError['code'],
    status?: number,
    technicalDetail?: string
  ) {
    super(farmerMessage);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.technicalDetail = technicalDetail;
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  options: RequestInit & {
    timeoutMs?: number;
    farmerErrorMessage?: string;
    preferServerError?: boolean;
  } = {}
): Promise<T> {
  const {
    timeoutMs = 25000,
    signal: externalSignal,
    farmerErrorMessage = FARMER_ERROR_MESSAGES.generic,
    preferServerError = false,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      let safeServerError: string | undefined;
      if (isJson) {
        try {
          const errJson = (await response.json()) as {
            detail?: string;
            error?: string;
            message?: string;
          };
          safeServerError = errJson.error || errJson.detail || errJson.message;
          detail = safeServerError || detail;
        } catch {
          // Keep status detail
        }
      }
      console.error(`[AgroShift API] Request failed (${url}):`, response.status, detail);
      const clientMessage =
        preferServerError && safeServerError ? safeServerError : farmerErrorMessage;
      throw new ApiClientError(clientMessage, 'HTTP_ERROR', response.status, detail);
    }

    if (!isJson) {
      console.error(`[AgroShift API] Non-JSON response (${url}):`, response.status);
      throw new ApiClientError(
        farmerErrorMessage,
        'INVALID_RESPONSE',
        response.status,
        'Non-JSON response body'
      );
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        throw err;
      }
      console.error(`[AgroShift API] Request timed out (${url})`);
      throw new ApiClientError(farmerErrorMessage, 'TIMEOUT', undefined, 'Request timeout');
    }
    console.error(`[AgroShift API] Network failure (${url}):`, err);
    throw new ApiClientError(
      farmerErrorMessage,
      'NETWORK_ERROR',
      undefined,
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function fetchClimateHistory(
  params: {
    latitude: number;
    longitude: number;
    startYear: number;
    endYear: number;
  },
  signal?: AbortSignal,
  baseUrlOverride?: string
): Promise<ClimateHistoryResponse> {
  const baseUrl = resolveApiBaseUrl(baseUrlOverride);
  const query = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    start_year: String(params.startYear),
    end_year: String(params.endYear),
  });

  const data = await fetchJsonWithTimeout<ClimateHistoryResponse>(
    `${baseUrl}/api/v1/climate/history?${query.toString()}`,
    {
      method: 'GET',
      timeoutMs: 30000,
      farmerErrorMessage: FARMER_ERROR_MESSAGES.climate,
      signal,
    }
  );

  if (!data || typeof data !== 'object' || typeof data.data_available !== 'boolean') {
    console.error('[AgroShift API] Invalid climate payload shape:', data);
    throw new ApiClientError(
      FARMER_ERROR_MESSAGES.climate,
      'INVALID_RESPONSE',
      undefined,
      'Missing data_available boolean'
    );
  }

  return {
    ...data,
    monthly: Array.isArray(data.monthly) ? data.monthly : [],
  };
}

export async function analyzeFieldHealth(
  payload: FieldAnalyzeRequest,
  signal?: AbortSignal,
  baseUrlOverride?: string
): Promise<FieldAnalyzeResponse> {
  const baseUrl = resolveApiBaseUrl(baseUrlOverride);
  const sanitizedPayload: FieldAnalyzeRequest = {
    latitude: payload.latitude,
    longitude: payload.longitude,
    acres: Math.max(0, Number(payload.acres) || 0),
    polygon_geojson: payload.polygon_geojson ?? null,
    language: payload.language === 'ur' ? 'ur' : 'en',
  };

  const data = await fetchJsonWithTimeout<FieldAnalyzeResponse>(
    `${baseUrl}/api/v1/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sanitizedPayload),
      timeoutMs: 35000,
      farmerErrorMessage: FARMER_ERROR_MESSAGES.fieldHealth,
      signal,
    }
  );

  if (!data || typeof data !== 'object' || typeof data.satellite_available !== 'boolean') {
    console.error('[AgroShift API] Invalid analyze payload shape:', data);
    throw new ApiClientError(
      FARMER_ERROR_MESSAGES.fieldHealth,
      'INVALID_RESPONSE',
      undefined,
      'Unexpected /api/v1/analyze payload'
    );
  }

  return data;
}

export async function fetchRotationCrops(
  signal?: AbortSignal,
  baseUrlOverride?: string
): Promise<RotationCropsResponse> {
  const baseUrl = resolveApiBaseUrl(baseUrlOverride);
  const data = await fetchJsonWithTimeout<RotationCropsResponse>(
    `${baseUrl}/api/v1/rotation/crops`,
    {
      method: 'GET',
      timeoutMs: 20000,
      farmerErrorMessage: FARMER_ERROR_MESSAGES.catalog,
      signal,
    }
  );

  if (!data || !Array.isArray(data.crops)) {
    console.error('[AgroShift API] Invalid rotation crops payload:', data);
    throw new ApiClientError(
      FARMER_ERROR_MESSAGES.catalog,
      'INVALID_RESPONSE',
      undefined,
      'Invalid /api/v1/rotation/crops payload'
    );
  }

  return data;
}

export async function fetchRotationPlan(
  payload: RotationPlanRequest,
  signal?: AbortSignal,
  baseUrlOverride?: string
): Promise<RotationPlanResponse> {
  const baseUrl = resolveApiBaseUrl(baseUrlOverride);
  const data = await fetchJsonWithTimeout<RotationPlanResponse>(
    `${baseUrl}/api/v1/rotation/plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: 35000,
      farmerErrorMessage: FARMER_ERROR_MESSAGES.rotation,
      signal,
    }
  );

  if (!data || typeof data !== 'object' || typeof data.status !== 'string') {
    console.error('[AgroShift API] Invalid rotation plan payload:', data);
    throw new ApiClientError(
      FARMER_ERROR_MESSAGES.rotation,
      'INVALID_RESPONSE',
      undefined,
      'Invalid /api/v1/rotation/plan payload'
    );
  }

  return data;
}

export async function fetchScenarioComparison(
  payload: ScenarioRotationRequest,
  signal?: AbortSignal,
  baseUrlOverride?: string
): Promise<ScenarioComparisonResponse> {
  const baseUrl = resolveApiBaseUrl(baseUrlOverride);
  const data = await fetchJsonWithTimeout<ScenarioComparisonResponse>(
    `${baseUrl}/api/v1/rotation/scenario`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: 35000,
      farmerErrorMessage: FARMER_ERROR_MESSAGES.rotation,
      signal,
    }
  );

  if (!data || typeof data !== 'object' || typeof data.status !== 'string') {
    console.error('[AgroShift API] Invalid rotation scenario payload:', data);
    throw new ApiClientError(
      FARMER_ERROR_MESSAGES.rotation,
      'INVALID_RESPONSE',
      undefined,
      'Invalid /api/v1/rotation/scenario payload'
    );
  }

  return data;
}

export async function getAssistantStatus(
  signal?: AbortSignal
): Promise<AssistantStatusResponse> {
  return fetchJsonWithTimeout<AssistantStatusResponse>('/api/assistant/status', {
    method: 'GET',
    timeoutMs: 8000,
    farmerErrorMessage: 'The assistant is temporarily unavailable. Please try again later.',
    signal,
  });
}

export async function sendAssistantMessage(
  body: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    farmContext: Record<string, unknown> | null;
    language?: string;
  },
  signal?: AbortSignal
): Promise<{ reply: string; model: string }> {
  return fetchJsonWithTimeout<{ reply: string; model: string }>('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 30000,
    farmerErrorMessage: "We couldn't get a response right now. Please try again.",
    preferServerError: true,
    signal,
  });
}
