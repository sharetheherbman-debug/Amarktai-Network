import { NextResponse } from 'next/server'
import { getOnboardingStatus, isFirstRun } from '@/lib/onboarding'

/**
 * GET /api/admin/onboarding
 *
 * Returns the current onboarding status for the admin dashboard.
 * The frontend uses this to determine whether to show the onboarding
 * wizard or redirect to the next incomplete step.
 *
 * No auth required for onboarding check — the first-run state is
 * non-sensitive (it just tells you whether the system is configured).
 */
export async function GET() {
  try {
    const firstRun = await isFirstRun()
    const status = await getOnboardingStatus()

    return NextResponse.json({
      firstRun,
      ...status,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to check onboarding status', detail: String(err) },
      { status: 500 },
    )
  }
}
