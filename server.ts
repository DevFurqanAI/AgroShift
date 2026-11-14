import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface AssistantMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantRequestBody {
  messages?: AssistantMessageInput[];
  farmContext?: Record<string, unknown> | null;
  language?: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/assistant/status', (_req, res) => {
    const client = getGeminiClient();
    res.json({
      available: Boolean(client),
      model: client ? 'gemini-4-hydrogen' : null,
      provider: 'server-gemini',
    });
  });

  app.post('/api/assistant', async (req, res) => {
    const client = getGeminiClient();
    if (!client) {
      res.status(503).json({
        code: 'ASSISTANT_UNAVAILABLE',
        error: 'Ask AgroShift AI service is not configured on the server.',
      });
      return;
    }

    const body = (req.body || {}) as AssistantRequestBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user');

    if (!latestUserMessage || !latestUserMessage.content?.trim()) {
      res.status(400).json({
        code: 'INVALID_REQUEST',
        error: 'Please enter a question for Ask AgroShift.',
      });
      return;
    }

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
      body.language ? `Respond in ${body.language} unless the user writes in another language.` : 'Respond in clear English.',
    ].join('\n');

    const contextSummary = body.farmContext
      ? `\n\nProvided Farm & Observation Context (ground truth for this session):\n${JSON.stringify(body.farmContext, null, 2)}`
      : '\n\nNo farm profile is currently selected.';

    const conversationTranscript = messages
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Farmer' : 'Ask AgroShift'}: ${m.content}`)
      .join('\n\n');

    try {
      const response = await client.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${conversationTranscript}${contextSummary}`,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({
          code: 'EMPTY_RESPONSE',
          error: 'The assistant returned an empty response. Please try asking again.',
        });
        return;
      }

      res.json({
        reply: replyText,
        model: 'gemini-4-hydrogen',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant request failed';
      console.error('[Ask AgroShift] Gemini API error:', message);
      res.status(502).json({
        code: 'ASSISTANT_ERROR',
        error: 'Unable to reach the AI assistant service right now. Please try again shortly.',
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgroShift server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AgroShift server:', err);
  process.exit(1);
});
