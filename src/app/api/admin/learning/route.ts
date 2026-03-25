import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/learning
 *
 * Returns paginated memory entries for the "What AmarktAI Learned" dashboard.
 * Query params:
 *   page  (default 1)
 *   limit (default 20, max 100)
 *   type  (optional — filter by memoryType)
 *   app   (optional — filter by appSlug)
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))
  const type  = searchParams.get('type') ?? undefined
  const app   = searchParams.get('app')  ?? undefined

  try {
    const where = {
      ...(type ? { memoryType: type } : {}),
      ...(app  ? { appSlug: app } : {}),
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    }

    const [total, entries] = await Promise.all([
      prisma.memoryEntry.count({ where }),
      prisma.memoryEntry.findMany({
        where,
        orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          appSlug: true,
          memoryType: true,
          key: true,
          content: true,
          importance: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
    ])

    return NextResponse.json({
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error('[learning] GET error:', err)
    return NextResponse.json({
      entries: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      error: 'Memory table unavailable — run database migration',
    })
  }
}
