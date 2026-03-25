import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getMemoryStatus } from '@/lib/memory'

/** GET /api/admin/memory — returns current memory layer status */
export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const status = await getMemoryStatus()
  return NextResponse.json(status)
}
