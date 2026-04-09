import { NextRequest, NextResponse } from 'next/server';
import { getVaultApiKey } from '@/lib/brain';

/**
 * POST /api/brain/moderation — Content moderation
 *
 * Calls the OpenAI moderation endpoint to classify content for safety.
 * Does NOT fall back to chat models — moderation must use a dedicated
 * moderation model or fail clearly.
 *
 * Accepts JSON body:
 *   - input  (string | string[], required) — text(s) to moderate
 *   - model  (string, optional) — override model (default: omni-moderation-latest)
 *
 * Returns:
 *   { executed, results?, provider, model, error?, capability }
 */

const OPENAI_MODERATION_MODELS = new Set([
  'omni-moderation-latest',
  'omni-moderation-2024-09-26',
  'text-moderation-latest',
  'text-moderation-stable',
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
        { error: 'input is required and must be a string or array of strings', capability: 'moderation' },
        { status: 400 },
      );
    }

    // ── Provider 1: OpenAI Moderation (primary & only) ─────────────────
    const openaiKey = await getVaultApiKey('openai');
    if (openaiKey) {
      const model =
        requestedModel && OPENAI_MODERATION_MODELS.has(requestedModel)
          ? requestedModel
          : 'omni-moderation-latest';

      try {
        const response = await fetch('https://api.openai.com/v1/moderations', {
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
            id?: string;
            model?: string;
            results?: Array<{
              flagged: boolean;
              categories: Record<string, boolean>;
              category_scores: Record<string, number>;
            }>;
          };
          return NextResponse.json({
            executed: true,
            id: data.id,
            results: data.results,
            provider: 'openai',
            model,
            capability: 'moderation',
          });
        } else {
          const errBody = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          console.warn(
            `[brain/moderation] OpenAI ${model} failed: ${errBody?.error?.message ?? response.status}`,
          );
        }
      } catch (err) {
        console.warn(
          '[brain/moderation] OpenAI call failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── No provider available ──────────────────────────────────────────
    // STRICT: Do NOT fall back to a chat model for moderation.
    return NextResponse.json(
      {
        executed: false,
        error:
          'No moderation provider is configured. ' +
          'Add an OpenAI API key via Admin → AI Providers. ' +
          'Moderation requires a dedicated moderation model — chat models are NOT acceptable substitutes.',
        providers_checked: ['openai'],
        capability: 'moderation',
      },
      { status: 503 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', detail: String(err), executed: false, capability: 'moderation' },
      { status: 500 },
    );
  }
}
