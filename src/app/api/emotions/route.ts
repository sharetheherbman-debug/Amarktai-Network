/**
 * Public API — Emotion Analysis Endpoint
 *
 * POST /api/emotions  — Analyse text for emotions
 * GET  /api/emotions  — Return available emotion types and model info
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  detectEmotions,
  runEmotionPipeline,
  EMOTION_TYPES,
  EMOTION_MODELS,
  PERSONALITY_TYPES,
  type PersonalityType,
} from '@/lib/emotion-engine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, userId, basePersonality, fullPipeline } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text (string) is required' }, { status: 400 })
    }

    // Quick detection only
    if (!fullPipeline) {
      const analysis = detectEmotions(text)
      return NextResponse.json({ success: true, analysis })
    }

    // Full pipeline (needs userId)
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'userId (string) is required for fullPipeline' },
        { status: 400 },
      )
    }

    const result = runEmotionPipeline(
      userId,
      text,
      (basePersonality as PersonalityType) || 'professional',
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Emotion analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    emotionTypes: EMOTION_TYPES,
    personalityTypes: PERSONALITY_TYPES,
    models: EMOTION_MODELS,
    endpoints: {
      'POST /api/emotions': 'Analyse text for emotions (send { text, userId?, basePersonality?, fullPipeline? })',
      'GET  /api/emotions': 'Return available types and model info',
    },
  })
}
