import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { runProviderHealthCheck } from '@/lib/providers'

/** POST /api/admin/providers/[id]/health-check — trigger a live health check */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const provider = await prisma.aiProvider.findUnique({
    where: { id: parseInt(id) },
    select: { id: true, providerKey: true, apiKey: true, baseUrl: true, enabled: true },
  })

  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  if (!provider.enabled) {
    const result = await prisma.aiProvider.update({
      where: { id: provider.id },
      data: {
        healthStatus: 'disabled',
        healthMessage: 'Provider is disabled',
        lastCheckedAt: new Date(),
      },
      select: { id: true, healthStatus: true, healthMessage: true, lastCheckedAt: true },
    })
    return NextResponse.json(result)
  }

  if (!provider.apiKey) {
    const result = await prisma.aiProvider.update({
      where: { id: provider.id },
      data: {
        healthStatus: 'unconfigured',
        healthMessage: 'No API key configured',
        lastCheckedAt: new Date(),
      },
      select: { id: true, healthStatus: true, healthMessage: true, lastCheckedAt: true },
    })
    return NextResponse.json(result)
  }

  // Run the live check
  const { status, message } = await runProviderHealthCheck(
    provider.providerKey,
    provider.apiKey,
    provider.baseUrl,
  )

  const result = await prisma.aiProvider.update({
    where: { id: provider.id },
    data: {
      healthStatus: status,
      healthMessage: message,
      lastCheckedAt: new Date(),
    },
    select: { id: true, healthStatus: true, healthMessage: true, lastCheckedAt: true },
  })

  return NextResponse.json(result)
}
