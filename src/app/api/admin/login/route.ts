import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function secureEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.byteLength !== bufB.byteLength) {
    // Run a dummy same-length comparison to keep timing consistent, then return false.
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = schema.parse(body)

    let authenticated = false
    let adminId = 0
    let adminEmail = email

    // ── 1. Try database admin user first ──────────────────────────
    try {
      const admin = await prisma.adminUser.findUnique({ where: { email } })
      if (admin) {
        const valid = await bcrypt.compare(password, admin.passwordHash)
        if (valid) {
          authenticated = true
          adminId = admin.id
          adminEmail = admin.email
        }
      }
    } catch (dbError) {
      console.warn('Login: DB lookup failed, falling back to env-var auth:', dbError)
    }

    // ── 2. Env-var fallback (ADMIN_EMAIL + ADMIN_PASSWORD) ────────
    // Only active when ADMIN_PASSWORD is explicitly set in the environment.
    // If neither DB user nor ADMIN_PASSWORD exists, login is refused to
    // force admin user creation through the onboarding wizard.
    if (!authenticated) {
      const envEmail    = process.env.ADMIN_EMAIL
      const envPassword = process.env.ADMIN_PASSWORD
      if (envEmail && envPassword && secureEqual(email, envEmail) && secureEqual(password, envPassword)) {
        authenticated = true
        adminId = 0
        adminEmail = envEmail
      }
    }

    if (!authenticated) {
      // Check whether the system has ever been configured (has a DB admin user
      // or ADMIN_PASSWORD set). If not, guide the operator to onboarding.
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

    return NextResponse.json({ success: true, email: adminEmail })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
