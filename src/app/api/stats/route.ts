/**
 * 统计 API — 返回 AI 调用 / Token / 计费实时数据
 * 
 * GET /api/stats → 当前统计
 * POST /api/stats { action: 'reset' } → 重置
 */

import { NextResponse } from 'next/server'
import { getStats, resetStats } from '@/lib/ai/stats'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getStats())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (body.action === 'reset') {
    resetStats()
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
