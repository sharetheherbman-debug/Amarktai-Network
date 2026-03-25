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

/**
 * Pre-computed bcrypt hash of the default admin password.
 * Acts as a last-resort fallback when neither a DB admin user nor
 * ADMIN_PASSWORD env var is set. One-way hash — plaintext never in source.
 */
const DEFAULT_ADMIN_HASH = '$2b$12$3rVo6ioZqjTDu.pe91UcmO9pp0RDZdQ/R/EdKtYZvdziNE.Z5VhOS'
const DEFAULT_ADMIN_EMAIL = 'admin@amarktai.network'

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
    if (!authenticated) {
      const envEmail    = process.env.ADMIN_EMAIL    || DEFAULT_ADMIN_EMAIL
      const envPassword = process.env.ADMIN_PASSWORD
      if (envPassword && secureEqual(email, envEmail) && secureEqual(password, envPassword)) {
        authenticated = true
        adminId = 0
        adminEmail = envEmail
      }
    }

    // ── 3. Bcrypt hash fallback (env email + default hash) ────────
    if (!authenticated) {
      const envEmail = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL
      if (secureEqual(email, envEmail)) {
        const valid = await bcrypt.compare(password, DEFAULT_ADMIN_HASH)
        if (valid) {
          authenticated = true
          adminId = 0
          adminEmail = envEmail
        }
      }
    }

    if (!authenticated) {
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
