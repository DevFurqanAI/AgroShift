import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAssistantRequest } from '../server/assistantService.js';

type VercelLikeReq = IncomingMessage & { body?: unknown };
type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (payload: unknown) => void;
};

function sendJson(res: VercelLikeRes, statusCode: number, payload: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json?.(payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: VercelLikeReq): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
    return req.body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req: VercelLikeReq, res: VercelLikeRes) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed' });
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readJsonBody(req);
  } catch {
    sendJson(res, 400, {
      code: 'INVALID_JSON',
      error: 'Invalid JSON request body.',
    });
    return;
  }

  const result = await handleAssistantRequest(parsedBody);
  sendJson(res, result.status, result.body);
}
