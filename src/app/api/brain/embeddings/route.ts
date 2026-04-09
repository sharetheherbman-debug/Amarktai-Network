import { NextRequest, NextResponse } from 'next/server';
import { getVaultApiKey } from '@/lib/brain';

/**
 * POST /api/brain/embeddings — Create text embeddings
 *
 * Calls the OpenAI embeddings endpoint (text-embedding-3-small → text-embedding-ada-002 fallback),
 * or HuggingFace as a second fallback.
 *
 * Accepts JSON body:
 *   - input  (string | string[], required) — text(s) to embed
 *   - model  (string, optional) — override model (default: text-embedding-3-small)
 *
 * Returns:
 *   { executed, embeddings?, provider, model, dimensions?, error?, capability }
 */

const OPENAI_EMBEDDING_MODELS = new Set([
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input, model: requestedModel } = body as {
      input?: string | string[];
      model?: string;
    };

    if (!input || (typeof input !== 'string' && !Array.isArray(input))) {
      return NextResponse.json(
        { error: 'input is required and must be a string or array of strings', capability: 'embeddings' },
        { status: 400 },
      );
    }

    // ── Provider 1: OpenAI Embeddings (primary) ────────────────────────
    const openaiKey = await getVaultApiKey('openai');
    if (openaiKey) {
      const model =
        requestedModel && OPENAI_EMBEDDING_MODELS.has(requestedModel)
          ? requestedModel
          : 'text-embedding-3-small';

      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, input }),
          signal: AbortSignal.timeout(30_000),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            data?: Array<{ embedding?: number[]; index?: number }>;
            model?: string;
            usage?: { prompt_tokens?: number; total_tokens?: number };
          };
          const embeddings = data.data?.map((d) => d.embedding) ?? [];
          return NextResponse.json({
            executed: true,
            embeddings,
            provider: 'openai',
            model,
            dimensions: embeddings[0]?.length ?? 0,
            usage: data.usage,
            capability: 'embeddings',
          });
        } else {
          const errBody = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          console.warn(
            `[brain/embeddings] OpenAI ${model} failed: ${errBody?.error?.message ?? response.status}`,
          );
        }
      } catch (err) {
        console.warn(
          '[brain/embeddings] OpenAI call failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── No provider available ──────────────────────────────────────────
    return NextResponse.json(
      {
        executed: false,
        error:
          'No embeddings provider is configured. ' +
          'Add an OpenAI API key via Admin → AI Providers.',
        providers_checked: ['openai'],
        capability: 'embeddings',
      },
      { status: 503 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', detail: String(err), executed: false, capability: 'embeddings' },
      { status: 500 },
    );
  }
}
