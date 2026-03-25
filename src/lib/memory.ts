/**
 * Amarktai Network — Memory Layer
 *
 * Server-side only. Provides save, retrieve, and status operations for the
 * MemoryEntry table. All functions catch and log DB errors gracefully so a
 * missing table (before migration) never crashes the gateway.
 */

import { prisma } from '@/lib/prisma'

export type MemoryType = 'event' | 'summary' | 'context' | 'learned'

export interface MemorySaveInput {
  appSlug: string
  memoryType: MemoryType
  content: string
  key?: string
  importance?: number
  ttlDays?: number   // if set, the entry expires after N days
}

export interface MemoryEntry {
  id: number
  appSlug: string
  memoryType: string
  key: string
  content: string
  importance: number
  createdAt: Date
}

export interface MemoryStatus {
  /** true when the memory_entries table is reachable */
  available: boolean
  /** total entries across all apps */
  totalEntries: number
  /** slugs of apps that have stored memories */
  appSlugs: string[]
  /** human-readable status label */
  statusLabel: 'saving' | 'empty' | 'not_configured'
  error: string | null
}

/**
 * Save a memory entry for the given app.
 * Returns true on success, false on any DB error.
 */
export async function saveMemory(input: MemorySaveInput): Promise<boolean> {
  try {
    const expiresAt = input.ttlDays
      ? new Date(Date.now() + input.ttlDays * 86_400_000)
      : null

    await prisma.memoryEntry.create({
      data: {
        appSlug:    input.appSlug,
        memoryType: input.memoryType,
        key:        input.key ?? '',
        content:    input.content,
        importance: input.importance ?? 0.5,
        expiresAt,
      },
    })
    return true
  } catch (err) {
    console.warn('[memory] saveMemory failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Retrieve the most important / most recent memories for an app.
 * Returns an empty array on any DB error.
 */
export async function retrieveMemory(appSlug: string, limit = 10): Promise<MemoryEntry[]> {
  try {
    return await prisma.memoryEntry.findMany({
      where: {
        appSlug,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true, appSlug: true, memoryType: true, key: true,
        content: true, importance: true, createdAt: true,
      },
    })
  } catch (err) {
    console.warn('[memory] retrieveMemory failed:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Returns the current memory layer status for the admin dashboard.
 * Never throws.
 */
export async function getMemoryStatus(): Promise<MemoryStatus> {
  try {
    const totalEntries = await prisma.memoryEntry.count()
    const apps = await prisma.memoryEntry.findMany({
      select: { appSlug: true },
      distinct: ['appSlug'],
    })
    return {
      available:   true,
      totalEntries,
      appSlugs:    apps.map(a => a.appSlug),
      statusLabel: totalEntries > 0 ? 'saving' : 'empty',
      error:       null,
    }
  } catch (err) {
    return {
      available:   false,
      totalEntries: 0,
      appSlugs:    [],
      statusLabel: 'not_configured',
      error:       err instanceof Error ? err.message : 'Memory table unavailable — run migration',
    }
  }
}
