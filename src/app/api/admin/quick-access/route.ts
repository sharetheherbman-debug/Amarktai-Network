import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  password: z.string().min(1),
})

/** Timing-safe string comparison to prevent timing attacks */
function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Keep timing consistent by running a same-size comparison before returning
    crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(a, 'utf8'))
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = schema.parse(body)

    // ── 1. Try database admin user first ──────────────────────────
    let authenticated = false
    let adminId = 0
    let adminEmail = 'admin'

    try {
      const admin = await prisma.adminUser.findFirst()
      if (admin) {
        const valid = await bcrypt.compare(password, admin.passwordHash)
        if (valid) {
          authenticated = true
          adminId = admin.id
          adminEmail = admin.email
        }
      }
    } catch (dbError) {
      // DB unavailable — fall through to env-var check below
      console.warn('Quick access: DB lookup failed, falling back to env-var auth:', dbError)
    }

    // ── 2. Env-var fallback (ADMIN_PASSWORD) ─────────────────────
    // Only active when ADMIN_PASSWORD is explicitly set in the environment.
    // Without either a DB admin user or ADMIN_PASSWORD, quick-access is
    // refused to force admin user creation through onboarding.
    if (!authenticated) {
      const envPassword = process.env.ADMIN_PASSWORD
      if (envPassword && secureEqual(password, envPassword)) {
        authenticated = true
        adminId = 0
        adminEmail = 'admin'
      }
    }

    if (!authenticated) {
      // Check whether the system has ever been configured
      let hasDbUser = false
      try {
        hasDbUser = (await prisma.adminUser.count()) > 0
      } catch { /* DB unreachable */ }

      if (!hasDbUser && !process.env.ADMIN_PASSWORD) {
        return NextResponse.json(
          {
            error: 'No admin account configured. Please set ADMIN_PASSWORD in your environment or create an admin user via the onboarding wizard.',
            onboarding_required: true,
          },
          { status: 401 },
        )
      }

      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const session = await getSession()
    session.adminId = adminId
    session.email = adminEmail
    session.isLoggedIn = true
    await session.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('Quick access error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
