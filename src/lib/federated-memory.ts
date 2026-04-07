/**
 * Federated Memory — Per-User Persistent AI Memory
 *
 * Enables AI that remembers: conversation history, user preferences,
 * learned patterns, and contextual knowledge. Uses Qdrant for semantic
 * memory retrieval and Redis for session caching.
 *
 * Persistence: Primary store is the MemoryEntry DB table (via Prisma).
 * Qdrant is used for semantic vector search. Redis caches hot entries.
 *
 * Truthful: Only stores and retrieves actual user interactions.
 * No fabricated memories.
 */

import { searchVectors, upsertVectors, ensureCollection } from './vector-store'
import { cacheGet, cacheSet, cacheDel } from './redis'
import { generateEmbedding } from './rag-pipeline'
import { prisma } from './prisma'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Memory {
  id: string
  userId: string
  appSlug: string
  type: MemoryType
  content: string
  importance: number // 0-1 (higher = more important to remember)
  metadata: Record<string, unknown>
  createdAt: string
  expiresAt?: string
  accessCount: number
  lastAccessedAt: string
}

export type MemoryType =
  | 'conversation'    // Chat history
  | 'preference'      // User preference (e.g., "prefers formal tone")
  | 'fact'            // Learned fact about user (e.g., "works in finance")
  | 'instruction'     // Standing instruction (e.g., "always use metric units")
  | 'feedback'        // User feedback on AI outputs
  | 'context'         // Session context
  | 'summary'         // Summarized conversation

export interface MemoryQuery {
  userId: string
  appSlug: string
  query: string
  types?: MemoryType[]
  limit?: number
  minImportance?: number
}

export interface MemorySearchResult {
  memory: Memory
  relevanceScore: number
}

export interface UserProfile {
  userId: string
  appSlug: string
  totalMemories: number
  memoryTypes: Record<MemoryType, number>
  oldestMemory?: string
  newestMemory?: string
  preferences: Memory[]
  instructions: Memory[]
}

// ── DB Key Encoding ───────────────────────────────────────────────────────────
//
// Federated memories are stored in the existing MemoryEntry table using the
// following field mapping:
//   appSlug      → appSlug (the connected app)
//   key          → `fed:{memoryId}` (unique per entry; enables O(1) lookup by id)
//   memoryType   → MemoryType value (conversation/preference/fact/etc.)
//   content      → JSON: { id, userId, content, metadata, accessCount, lastAccessedAt }
//   importance   → importance (0–1)
//   expiresAt    → expiresAt
//
// To list a user's memories for an app, we fetch all entries for the appSlug
// and filter by userId inside the JSON content. This is bounded by
// MAX_MEMORIES_PER_USER × apps, which is small enough for in-process filtering.

function encodeKey(memId: string): string {
  return `fed:${memId}`
}

/** Parse a MemoryEntry DB row back into a Memory object. Returns null on corrupt data. */
function parseMemoryRow(row: {
  key: string
  memoryType: string
  content: string
  importance: number
  expiresAt: Date | null
}): Memory | null {
  try {
    const parsed = JSON.parse(row.content) as {
      id: string
      userId: string
      content: string
      metadata: Record<string, unknown>
      accessCount: number
      lastAccessedAt: string
    }
    return {
      id: parsed.id,
      userId: parsed.userId,
      appSlug: '', // populated by caller from DB row
      type: row.memoryType as MemoryType,
      content: parsed.content,
      importance: row.importance,
      metadata: parsed.metadata ?? {},
      createdAt: '', // populated from DB createdAt by caller
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : undefined,
      accessCount: parsed.accessCount ?? 0,
      lastAccessedAt: parsed.lastAccessedAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** Fetch all non-expired federated memory entries for a user+app from the DB. */
async function fetchUserMemories(userId: string, appSlug: string): Promise<Memory[]> {
  try {
    const rows = await prisma.memoryEntry.findMany({
      where: {
        appSlug,
        key: { startsWith: 'fed:' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    })
    const memories: Memory[] = []
    for (const row of rows) {
      const m = parseMemoryRow(row)
      if (!m) continue
      if (m.userId !== userId) continue
      m.appSlug = appSlug
      m.createdAt = row.createdAt.toISOString()
      memories.push(m)
    }
    return memories
  } catch {
    return []
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_MEMORIES_PER_USER = 1000
const DEFAULT_IMPORTANCE = 0.5
const SESSION_CACHE_TTL = 3600 // 1 hour
const _MEMORY_COLLECTION = 'amarktai_federated_memory'

// ── Memory CRUD ──────────────────────────────────────────────────────────────

/** Store a new memory. */
export async function storeMemory(input: {
  userId: string
  appSlug: string
  type: MemoryType
  content: string
  importance?: number
  metadata?: Record<string, unknown>
  expiresAt?: string
}): Promise<Memory> {
  const id = randomUUID()
  const now = new Date().toISOString()

  const memory: Memory = {
    id,
    userId: input.userId,
    appSlug: input.appSlug,
    type: input.type,
    content: input.content,
    importance: input.importance ?? DEFAULT_IMPORTANCE,
    metadata: input.metadata ?? {},
    createdAt: now,
    expiresAt: input.expiresAt,
    accessCount: 0,
    lastAccessedAt: now,
  }

  // Persist to DB
  try {
    await prisma.memoryEntry.create({
      data: {
        appSlug: input.appSlug,
        key: encodeKey(id),
        memoryType: input.type,
        content: JSON.stringify({
          id,
          userId: input.userId,
          content: input.content,
          metadata: input.metadata ?? {},
          accessCount: 0,
          lastAccessedAt: now,
        }),
        importance: input.importance ?? DEFAULT_IMPORTANCE,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    })
  } catch (err) {
    console.warn('[federated-memory] DB persist failed:', err instanceof Error ? err.message : err)
  }

  // Evict old memories if over limit (async, non-blocking)
  fetchUserMemories(input.userId, input.appSlug).then(async (existing) => {
    if (existing.length > MAX_MEMORIES_PER_USER) {
      await evictOldMemories(input.userId, input.appSlug)
    }
  }).catch(() => { /* non-critical */ })

  // Store in vector DB for semantic search
  const embedding = await generateEmbedding(input.content)
  if (embedding) {
    try {
      await ensureCollection()
      await upsertVectors([{
        id,
        vector: embedding,
        payload: {
          ...memory,
          _type: 'federated_memory',
        },
      }])
    } catch { /* Vector store unavailable — memory still persisted to DB */ }
  }

  // Cache in Redis for fast session access
  await cacheSet(`mem:${id}`, JSON.stringify(memory), SESSION_CACHE_TTL)

  return memory
}

/** Retrieve a specific memory. */
export async function getMemory(id: string): Promise<Memory | null> {
  // Try Redis cache first
  const cached = await cacheGet(`mem:${id}`)
  if (cached) {
    try {
      return JSON.parse(cached) as Memory
    } catch { /* cache corruption */ }
  }

  // Fetch from DB
  try {
    const row = await prisma.memoryEntry.findFirst({
      where: { key: encodeKey(id) },
    })
    if (!row) return null

    // Check expiry
    if (row.expiresAt && row.expiresAt < new Date()) {
      await prisma.memoryEntry.deleteMany({ where: { key: encodeKey(id) } })
      await cacheDel(`mem:${id}`)
      return null
    }

    const memory = parseMemoryRow(row)
    if (!memory) return null
    memory.appSlug = row.appSlug
    memory.createdAt = row.createdAt.toISOString()
    memory.accessCount++
    memory.lastAccessedAt = new Date().toISOString()

    // Update access count in DB (fire-and-forget)
    prisma.memoryEntry.updateMany({
      where: { key: encodeKey(id) },
      data: {
        content: JSON.stringify({
          id: memory.id,
          userId: memory.userId,
          content: memory.content,
          metadata: memory.metadata,
          accessCount: memory.accessCount,
          lastAccessedAt: memory.lastAccessedAt,
        }),
      },
    }).catch(() => { /* non-critical */ })

    // Refresh cache
    await cacheSet(`mem:${id}`, JSON.stringify(memory), SESSION_CACHE_TTL)
    return memory
  } catch {
    return null
  }
}

/** Delete a memory. */
export async function deleteMemory(id: string): Promise<boolean> {
  try {
    const deleted = await prisma.memoryEntry.deleteMany({ where: { key: encodeKey(id) } })
    await cacheDel(`mem:${id}`)
    return deleted.count > 0
  } catch {
    return false
  }
}

// ── Memory Search ────────────────────────────────────────────────────────────

/**
 * Search memories semantically — find memories relevant to a query.
 */
export async function searchMemories(query: MemoryQuery): Promise<MemorySearchResult[]> {
  const { userId, appSlug, query: queryText, types, limit = 10, minImportance = 0 } = query

  // First try semantic search via vector store
  const embedding = await generateEmbedding(queryText)
  if (embedding) {
    try {
      const results = await searchVectors(embedding, limit * 3)
      const filtered = results
        .filter((r) => {
          if (r.payload?._type !== 'federated_memory') return false
          if (r.payload?.userId !== userId) return false
          if (r.payload?.appSlug !== appSlug) return false
          if (types && !types.includes(r.payload?.type as MemoryType)) return false
          if ((r.payload?.importance as number ?? 0) < minImportance) return false
          return true
        })
        .slice(0, limit)

      return filtered.map((r) => ({
        memory: {
          id: String(r.id),
          userId: String(r.payload?.userId ?? ''),
          appSlug: String(r.payload?.appSlug ?? ''),
          type: (r.payload?.type ?? 'context') as MemoryType,
          content: String(r.payload?.content ?? ''),
          importance: Number(r.payload?.importance ?? 0.5),
          metadata: (r.payload?.metadata ?? {}) as Record<string, unknown>,
          createdAt: String(r.payload?.createdAt ?? ''),
          expiresAt: r.payload?.expiresAt as string | undefined,
          accessCount: Number(r.payload?.accessCount ?? 0),
          lastAccessedAt: String(r.payload?.lastAccessedAt ?? ''),
        },
        relevanceScore: r.score,
      }))
    } catch { /* Vector store unavailable — fall through to DB keyword search */ }
  }

  // Fallback: DB keyword search
  const allMemories = await fetchUserMemories(userId, appSlug)
  const queryLower = queryText.toLowerCase()
  const results: MemorySearchResult[] = []

  for (const memory of allMemories) {
    if (types && !types.includes(memory.type)) continue
    if (memory.importance < minImportance) continue

    const contentLower = memory.content.toLowerCase()
    const words = queryLower.split(/\s+/)
    const matchCount = words.filter((w) => contentLower.includes(w)).length
    const score = matchCount / Math.max(1, words.length)

    if (score > 0.1) {
      results.push({ memory, relevanceScore: score })
    }
  }

  return results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)
}

// ── User Profile ─────────────────────────────────────────────────────────────

/** Get a user's memory profile. */
export async function getUserProfile(userId: string, appSlug: string): Promise<UserProfile> {
  const memories = await fetchUserMemories(userId, appSlug)

  const typeCounts: Record<MemoryType, number> = {
    conversation: 0, preference: 0, fact: 0, instruction: 0,
    feedback: 0, context: 0, summary: 0,
  }
  const preferences: Memory[] = []
  const instructions: Memory[] = []
  let oldest: string | undefined
  let newest: string | undefined

  for (const memory of memories) {
    typeCounts[memory.type] = (typeCounts[memory.type] ?? 0) + 1

    if (memory.type === 'preference') preferences.push(memory)
    if (memory.type === 'instruction') instructions.push(memory)

    if (!oldest || memory.createdAt < oldest) oldest = memory.createdAt
    if (!newest || memory.createdAt > newest) newest = memory.createdAt
  }

  return {
    userId,
    appSlug,
    totalMemories: memories.length,
    memoryTypes: typeCounts,
    oldestMemory: oldest,
    newestMemory: newest,
    preferences,
    instructions,
  }
}

// ── Context Building ─────────────────────────────────────────────────────────

/**
 * Build a memory-augmented system prompt for a user.
 * Retrieves relevant memories and formats them as context.
 */
export async function buildMemoryContext(
  userId: string,
  appSlug: string,
  currentMessage: string,
): Promise<string> {
  const memories = await searchMemories({
    userId,
    appSlug,
    query: currentMessage,
    limit: 5,
    minImportance: 0.3,
  })

  if (memories.length === 0) return ''

  const profile = await getUserProfile(userId, appSlug)

  const parts: string[] = []
  parts.push('--- User Memory Context ---')

  // Add standing instructions first
  if (profile.instructions.length > 0) {
    parts.push('User Instructions:')
    for (const inst of profile.instructions.slice(0, 3)) {
      parts.push(`  - ${inst.content}`)
    }
  }

  // Add preferences
  if (profile.preferences.length > 0) {
    parts.push('User Preferences:')
    for (const pref of profile.preferences.slice(0, 3)) {
      parts.push(`  - ${pref.content}`)
    }
  }

  // Add relevant memories
  if (memories.length > 0) {
    parts.push('Relevant Context:')
    for (const m of memories) {
      parts.push(`  - [${m.memory.type}] ${m.memory.content.slice(0, 200)}`)
    }
  }

  parts.push('--- End Memory Context ---')
  return parts.join('\n')
}

// ── Eviction ─────────────────────────────────────────────────────────────────

async function evictOldMemories(userId: string, appSlug: string): Promise<number> {
  const memories = await fetchUserMemories(userId, appSlug)
  if (memories.length <= MAX_MEMORIES_PER_USER) return 0

  // Sort by importance * recency (ascending — lowest score evicted first)
  const scored = memories.map((memory) => {
    const age = (Date.now() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    const recencyScore = 1 / (1 + age)
    return { id: memory.id, score: memory.importance * 0.6 + recencyScore * 0.4 }
  })
  scored.sort((a, b) => a.score - b.score)

  const toEvict = scored.slice(0, scored.length - MAX_MEMORIES_PER_USER)
  for (const { id } of toEvict) {
    await deleteMemory(id)
  }

  return toEvict.length
}

// ── Exports for Testing ──────────────────────────────────────────────────────
export const MEMORY_TYPES: MemoryType[] = ['conversation', 'preference', 'fact', 'instruction', 'feedback', 'context', 'summary']
export { MAX_MEMORIES_PER_USER, DEFAULT_IMPORTANCE, SESSION_CACHE_TTL }
