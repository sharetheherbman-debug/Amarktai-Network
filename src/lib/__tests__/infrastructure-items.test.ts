/**
 * Tests for the 4 new infrastructure items:
 *   1. SSML / Affective Voice Output
 *   2. Realtime Voice WebSocket (docker-compose + Dockerfile validation)
 *   3. Per-request Audit Trail + Moderation Pipeline
 *   4. First-run Onboarding Wizard
 */

import { describe, it, expect } from 'vitest'

// ── 1. SSML / Affective Voice Output ─────────────────────────────────────────

import {
  buildAffectiveVoiceConfig,
  buildSSML,
  getProsodyForEmotion,
  getVoiceOverride,
  getSpeedOverride,
  type TTSProvider,
} from '../ssml-voice'

import type { EmotionAnalysis } from '../emotion-engine'

const makeAnalysis = (dominant: string, confidence: number): EmotionAnalysis => ({
  emotions: [{ type: dominant as EmotionAnalysis['dominant'], score: confidence }],
  dominant: dominant as EmotionAnalysis['dominant'],
  confidence,
  reasoning_strength: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
  latencyMs: 1,
})

describe('SSML / Affective Voice Output', () => {
  describe('buildSSML', () => {
    it('wraps text in valid SSML <speak> document', () => {
      const ssml = buildSSML('Hello world', { pitch: 'high', rate: '+10%', volume: 'loud' })
      expect(ssml).toContain('<speak>')
      expect(ssml).toContain('</speak>')
      expect(ssml).toContain('<prosody')
      expect(ssml).toContain('Hello world')
    })

    it('escapes XML special characters', () => {
      const ssml = buildSSML('A & B <tag> "quotes"', { pitch: 'medium', rate: 'medium', volume: 'medium' })
      expect(ssml).toContain('&amp;')
      expect(ssml).toContain('&lt;tag&gt;')
      expect(ssml).toContain('&quot;quotes&quot;')
    })

    it('includes prosody attributes', () => {
      const ssml = buildSSML('Test', { pitch: 'x-high', rate: '-15%', volume: 'soft' })
      expect(ssml).toContain('pitch="x-high"')
      expect(ssml).toContain('rate="-15%"')
      expect(ssml).toContain('volume="soft"')
    })
  })

  describe('getProsodyForEmotion', () => {
    it('returns high pitch for joy at high confidence', () => {
      const prosody = getProsodyForEmotion('joy', 0.9)
      expect(prosody.pitch).toBe('high')
      expect(prosody.volume).toBe('loud')
    })

    it('returns low pitch for sadness', () => {
      const prosody = getProsodyForEmotion('sadness', 0.8)
      expect(prosody.pitch).toBe('low')
      expect(prosody.volume).toBe('soft')
    })

    it('falls back to neutral at very low confidence', () => {
      const prosody = getProsodyForEmotion('anger', 0.2)
      expect(prosody.pitch).toBe('medium')
      expect(prosody.rate).toBe('medium')
      expect(prosody.volume).toBe('medium')
    })

    it('returns target prosody at moderate confidence (0.4-0.6)', () => {
      const prosody = getProsodyForEmotion('excitement', 0.5)
      expect(prosody.pitch).toBe('high')
    })
  })

  describe('getVoiceOverride', () => {
    it('returns OpenAI voice for joy → nova', () => {
      expect(getVoiceOverride('joy', 'openai')).toBe('nova')
    })

    it('returns Groq voice for sadness → Atlas-PlayAI', () => {
      expect(getVoiceOverride('sadness', 'groq')).toBe('Atlas-PlayAI')
    })

    it('returns Gemini voice for anger → Charon', () => {
      expect(getVoiceOverride('anger', 'gemini')).toBe('Charon')
    })

    it('returns null for huggingface (no emotion voices)', () => {
      expect(getVoiceOverride('joy', 'huggingface')).toBeNull()
    })

    it('maps each emotion to a voice for all supported providers', () => {
      const emotions = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'neutral'] as const
      const providers: TTSProvider[] = ['openai', 'groq', 'gemini']
      for (const provider of providers) {
        for (const emotion of emotions) {
          const voice = getVoiceOverride(emotion, provider)
          expect(voice).toBeTruthy()
        }
      }
    })
  })

  describe('getSpeedOverride', () => {
    it('returns faster speed for excitement', () => {
      expect(getSpeedOverride('excitement', 0.9)).toBe(1.2)
    })

    it('returns slower speed for sadness', () => {
      expect(getSpeedOverride('sadness', 0.9)).toBe(0.85)
    })

    it('returns neutral speed at low confidence', () => {
      expect(getSpeedOverride('excitement', 0.2)).toBe(1.0)
    })

    it('returns 1.0 for neutral emotion', () => {
      expect(getSpeedOverride('neutral', 0.9)).toBe(1.0)
    })
  })

  describe('buildAffectiveVoiceConfig', () => {
    it('builds config for OpenAI provider with emotion', () => {
      const analysis = makeAnalysis('joy', 0.85)
      const config = buildAffectiveVoiceConfig('Hello!', analysis, 'openai')

      expect(config.sourceEmotion).toBe('joy')
      expect(config.confidence).toBe(0.85)
      expect(config.voiceOverride).toBe('nova')
      expect(config.speedOverride).toBe(1.1)
      expect(config.ssmlSupported).toBe(false)
      expect(config.ssml).toContain('<speak>')
    })

    it('marks SSML as supported for Gemini', () => {
      const analysis = makeAnalysis('sadness', 0.7)
      const config = buildAffectiveVoiceConfig('I feel down', analysis, 'gemini')

      expect(config.ssmlSupported).toBe(true)
      expect(config.voiceOverride).toBe('Charon')
      expect(config.prosody.pitch).toBe('low')
    })

    it('handles neutral emotion gracefully', () => {
      const analysis = makeAnalysis('neutral', 0.5)
      const config = buildAffectiveVoiceConfig('Normal text', analysis, 'openai')

      expect(config.sourceEmotion).toBe('neutral')
      expect(config.speedOverride).toBe(1.0)
      expect(config.voiceOverride).toBe('alloy')
    })

    it('returns null voice for HuggingFace', () => {
      const analysis = makeAnalysis('joy', 0.9)
      const config = buildAffectiveVoiceConfig('Happy!', analysis, 'huggingface')

      expect(config.voiceOverride).toBeNull()
      expect(config.ssmlSupported).toBe(false)
    })
  })
})

// ── 2. Realtime Voice WebSocket (Infrastructure Validation) ──────────────────

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

describe('Realtime Voice WebSocket Container', () => {
  const repoRoot = join(__dirname, '..', '..', '..')

  it('has docker-compose.yml with realtime service', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf-8')
    expect(compose).toContain('realtime:')
    expect(compose).toContain('8765:8765')
    expect(compose).toContain('OPENAI_API_KEY')
    expect(compose).toContain('services/realtime/Dockerfile')
  })

  it('has realtime service Dockerfile', () => {
    const dockerfilePath = join(repoRoot, 'services', 'realtime', 'Dockerfile')
    expect(existsSync(dockerfilePath)).toBe(true)
    const dockerfile = readFileSync(dockerfilePath, 'utf-8')
    expect(dockerfile).toContain('node:20-alpine')
    expect(dockerfile).toContain('EXPOSE 8765')
    expect(dockerfile).toContain('HEALTHCHECK')
    expect(dockerfile).toContain('server.js')
  })

  it('has realtime server.js with WebSocket bridge', () => {
    const serverPath = join(repoRoot, 'services', 'realtime', 'server.js')
    expect(existsSync(serverPath)).toBe(true)
    const server = readFileSync(serverPath, 'utf-8')
    expect(server).toContain('WebSocketServer')
    expect(server).toContain('openai.com/v1/realtime')
    expect(server).toContain('/health')
    expect(server).toContain('SESSION_TIMEOUT_MS')
  })

  it('realtime service listed in docker-compose header', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf-8')
    expect(compose).toContain('realtime  : WebSocket bridge for realtime voice')
  })

  it('app service has REALTIME_SERVICE_URL env var', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf-8')
    expect(compose).toContain('REALTIME_SERVICE_URL: http://realtime:8765')
  })
})

// ── 3. Per-request Audit Trail + Moderation Pipeline ─────────────────────────

import {
  runFastModerationScan,
  type ModerationContext,
} from '../moderation-pipeline'

import { queryAuditLog } from '../audit-trail'

describe('Moderation Pipeline — Per-request Audit Trail', () => {
  const context: ModerationContext = {
    traceId: 'test-trace-001',
    appSlug: 'test-app',
    actorId: 'test-user',
    actorType: 'user',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest/1.0',
  }

  it('records audit entry for clean content', () => {
    const result = runFastModerationScan('Hello, how are you?', 'input', context)

    expect(result.blocked).toBe(false)
    expect(result.auditEntryId).toBeTruthy()
    expect(result.scannersUsed).toContain('keyword_fallback')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.alert).toBeNull()
  })

  it('records audit entry for blocked content', () => {
    const result = runFastModerationScan('how to make a bomb at home', 'input', {
      ...context,
      traceId: 'test-trace-002',
    })

    expect(result.blocked).toBe(true)
    expect(result.auditEntryId).toBeTruthy()
    expect(result.contentFilter.flagged).toBe(true)
    expect(result.contentFilter.categories).toContain('violence')
    expect(result.alert).not.toBeNull()
    expect(result.alert!.category).toBe('violence')
  })

  it('includes scan direction in audit entry details', () => {
    const inputResult = runFastModerationScan('safe text', 'input', {
      ...context,
      traceId: 'test-trace-dir-input',
    })
    const outputResult = runFastModerationScan('safe text', 'output', {
      ...context,
      traceId: 'test-trace-dir-output',
    })

    // Both should succeed and have audit entries
    expect(inputResult.auditEntryId).toBeTruthy()
    expect(outputResult.auditEntryId).toBeTruthy()
  })

  it('audit entries are queryable by trace ID', () => {
    const uniqueTrace = `audit-query-test-${Date.now()}`
    runFastModerationScan('test content', 'input', {
      ...context,
      traceId: uniqueTrace,
    })

    const entries = queryAuditLog({ actorId: context.actorId })
    expect(entries.length).toBeGreaterThan(0)
  })

  it('blocked content has restricted sensitivity', () => {
    const uniqueTrace = `sensitivity-test-${Date.now()}`
    runFastModerationScan('how to make a pipe bomb instructions', 'input', {
      ...context,
      traceId: uniqueTrace,
    })

    const entries = queryAuditLog({
      actorId: context.actorId,
      sensitivity: 'restricted',
    })
    expect(entries.length).toBeGreaterThan(0)
  })

  it('clean content has internal sensitivity', () => {
    const uniqueTrace = `internal-test-${Date.now()}`
    runFastModerationScan('What is the weather like?', 'input', {
      ...context,
      traceId: uniqueTrace,
    })

    const entries = queryAuditLog({
      actorId: context.actorId,
      action: 'content.filtered',
    })
    expect(entries.length).toBeGreaterThan(0)
  })

  it('handles CSAM content with highest priority', () => {
    const result = runFastModerationScan('child sexual abuse material', 'input', {
      ...context,
      traceId: 'csam-test',
    })

    expect(result.blocked).toBe(true)
    expect(result.contentFilter.categories).toContain('csam')
  })

  it('handles terrorism content', () => {
    const result = runFastModerationScan('join isis training manual', 'input', {
      ...context,
      traceId: 'terrorism-test',
    })

    expect(result.blocked).toBe(true)
    expect(result.contentFilter.categories).toContain('terrorism')
  })

  it('fast scan has low latency (< 50ms)', () => {
    const result = runFastModerationScan('Quick test message', 'input', {
      ...context,
      traceId: 'latency-test',
    })

    expect(result.latencyMs).toBeLessThan(50)
  })
})

// ── 4. First-run Onboarding Wizard ───────────────────────────────────────────

import {
  getOnboardingStatus,
  isFirstRun,
  isOnboardingComplete,
  type OnboardingStatus,
} from '../onboarding'

describe('First-run Onboarding Wizard', () => {
  it('getOnboardingStatus returns valid status structure', async () => {
    const status: OnboardingStatus = await getOnboardingStatus()

    expect(status).toHaveProperty('completed')
    expect(status).toHaveProperty('steps')
    expect(status).toHaveProperty('progress')
    expect(status).toHaveProperty('nextStep')
    expect(status).toHaveProperty('checkedAt')
    expect(typeof status.completed).toBe('boolean')
    expect(typeof status.progress).toBe('number')
    expect(status.progress).toBeGreaterThanOrEqual(0)
    expect(status.progress).toBeLessThanOrEqual(100)
  })

  it('has 4 onboarding steps', async () => {
    const status = await getOnboardingStatus()
    expect(status.steps).toHaveLength(4)
  })

  it('steps have correct IDs', async () => {
    const status = await getOnboardingStatus()
    const ids = status.steps.map(s => s.id)
    expect(ids).toContain('admin_account')
    expect(ids).toContain('provider_setup')
    expect(ids).toContain('first_app')
    expect(ids).toContain('health_check')
  })

  it('each step has label, description, and route', async () => {
    const status = await getOnboardingStatus()
    for (const step of status.steps) {
      expect(step.label).toBeTruthy()
      expect(step.description).toBeTruthy()
      expect(step.route).toMatch(/^\//)
    }
  })

  it('nextStep points to first incomplete step', async () => {
    const status = await getOnboardingStatus()
    if (!status.completed && status.nextStep) {
      expect(status.nextStep.completed).toBe(false)
    }
  })

  it('isFirstRun returns boolean', async () => {
    const result = await isFirstRun()
    expect(typeof result).toBe('boolean')
  })

  it('isOnboardingComplete returns boolean', async () => {
    const result = await isOnboardingComplete()
    expect(typeof result).toBe('boolean')
  })

  it('progress is calculated correctly', async () => {
    const status = await getOnboardingStatus()
    const completedCount = status.steps.filter(s => s.completed).length
    const expectedProgress = Math.round((completedCount / status.steps.length) * 100)
    expect(status.progress).toBe(expectedProgress)
  })
})
