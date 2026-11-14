import type {
  ApiConnectionInfo,
  AssistantStatusResponse,
  BackendHealthResponse,
  ClimateHistoryResponse,
  FieldAnalyzeRequest,
  FieldAnalyzeResponse,
} from '../../types/api';
import { normalizeBaseUrl } from '../../utils/validation';

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code: 'NOT_CONFIGURED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'INVALID_RESPONSE';

  constructor(
    message: string,
    code: ApiClientError['code'],
    status?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

export function resolveApiConnection(customUrl?: string): ApiConnectionInfo {
  const custom = normalizeBaseUrl(customUrl || '');
  if (custom) {
    return { configured: true, baseUrl: custom, source: 'custom' };
  }
  const envUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || '');
  if (envUrl) {
    return { configured: true, baseUrl: envUrl, source: 'env' };
  }
  return { configured: false, baseUrl: '', source: 'none' };
}

async function fetchJsonWithTimeout<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 20000, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

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
      let detail = `Server returned HTTP ${response.status}`;
      if (isJson) {
        try {
          const errJson = (await response.json()) as { detail?: string; error?: string; message?: string };
          detail = errJson.detail || errJson.error || errJson.message || detail;
        } catch {
          // Keep default detail
        }
      }
      throw new ApiClientError(detail, 'HTTP_ERROR', response.status);
    }

    if (!isJson) {
      throw new ApiClientError(
        'Backend returned a non-JSON response.',
        'INVALID_RESPONSE',
        response.status
      );
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        throw err;
      }
      throw new ApiClientError(
        'The request timed out while waiting for the backend server.',
        'TIMEOUT'
      );
    }
    throw new ApiClientError(
      'Unable to connect to the FastAPI backend. Verify the server is running and CORS allows this origin.',
      'NETWORK_ERROR'
    );
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function checkBackendHealth(
  baseUrl: string,
  signal?: AbortSignal
): Promise<BackendHealthResponse> {
  const clean = normalizeBaseUrl(baseUrl);
  if (!clean) {
    throw new ApiClientError(
      'No FastAPI backend URL is configured (VITE_API_BASE_URL is empty).',
      'NOT_CONFIGURED'
    );
  }
  return fetchJsonWithTimeout<BackendHealthResponse>(`${clean}/`, {
    method: 'GET',
    timeoutMs: 10000,
    signal,
  });
}

export async function fetchClimateHistory(
  baseUrl: string,
  params: {
    latitude: number;
    longitude: number;
    startYear: number;
    endYear: number;
  },
  signal?: AbortSignal
): Promise<ClimateHistoryResponse> {
  const clean = normalizeBaseUrl(baseUrl);
  if (!clean) {
    throw new ApiClientError(
      'No FastAPI backend URL is configured. Configure VITE_API_BASE_URL or add your backend URL in Settings.',
      'NOT_CONFIGURED'
    );
  }

  const query = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    start_year: String(params.startYear),
    end_year: String(params.endYear),
  });

  const data = await fetchJsonWithTimeout<ClimateHistoryResponse>(
    `${clean}/api/v1/climate/history?${query.toString()}`,
    {
      method: 'GET',
      timeoutMs: 25000,
      signal,
    }
  );

  if (!data || typeof data !== 'object' || typeof data.data_available !== 'boolean') {
    throw new ApiClientError(
      'Unexpected climate response format from backend.',
      'INVALID_RESPONSE'
    );
  }

  return data;
}

export async function analyzeFieldHealth(
  baseUrl: string,
  payload: FieldAnalyzeRequest,
  signal?: AbortSignal
): Promise<FieldAnalyzeResponse> {
  const clean = normalizeBaseUrl(baseUrl);
  if (!clean) {
    throw new ApiClientError(
      'No FastAPI backend URL is configured. Configure VITE_API_BASE_URL or add your backend URL in Settings.',
      'NOT_CONFIGURED'
    );
  }

  const data = await fetchJsonWithTimeout<FieldAnalyzeResponse>(
    `${clean}/api/v1/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: 30000,
      signal,
    }
  );

  if (!data || typeof data !== 'object') {
    throw new ApiClientError(
      'Unexpected field analysis response format from backend.',
      'INVALID_RESPONSE'
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
    signal,
  });
}
