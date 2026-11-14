import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAssistantStatus } from '../../server/assistantService.js';

type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (payload: unknown) => void;
};

export default function handler(req: IncomingMessage, res: VercelLikeRes) {
  if (req.method && req.method !== 'GET') {
    const payload = { error: 'Method not allowed' };
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(405).json?.(payload);
      return;
    }
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
    return;
  }

  const statusPayload = getAssistantStatus();
  res.setHeader('Cache-Control', 'no-store');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(200).json?.(statusPayload);
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(statusPayload));
}
