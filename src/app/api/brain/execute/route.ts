/**
 * POST /api/brain/execute
 *
 * Canonical app-facing Brain Gateway — execute alias.
 *
 * This route is the documented entry point for all AI execution requests.
 * It is a drop-in alias for POST /api/brain/request — both endpoints
 * accept the exact same request schema and return the same response shape.
 *
 * Use this URL in all external integrations:
 *   POST /api/brain/execute
 *   Body: { appId, appSecret, taskType, message, externalUserId?, metadata? }
 *
 * The full pipeline runs here:
 *   authenticate → emotion detection → memory retrieval → orchestrate
 *   → provider selection → model execution → content filter → respond
 */

export { POST } from '@/app/api/brain/request/route'
