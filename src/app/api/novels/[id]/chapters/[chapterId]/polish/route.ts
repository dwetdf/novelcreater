/**
 * 语言润色 API — 接线 LanguagePolisher
 * 
 * POST /api/novels/[id]/chapters/[chapterId]/polish
 * Body: { content, passes?: PolishPass[] }
 * 
 * 多轮精修：grammar → show_dont_tell → dialogue → style → pacing → sensory
 */

import { NextResponse } from 'next/server'
import { LanguagePolisher } from '@/lib/context/language-polisher'
import { callAISplit } from '@/lib/ai/call'
import type { PolishPass } from '@/lib/context/types'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { chapterId } = await params

  try {
    const body = await req.json() as {
      content?: string
      passes?: PolishPass[]
    }

    if (!body.content) {
      return NextResponse.json({ error: '缺少 content' }, { status: 400 })
    }

    const passes = body.passes || LanguagePolisher.getRecommendedOrder()

    const polisher = new LanguagePolisher({
      callAI: (systemPrompt: string, userMessage: string) =>
        callAISplit(systemPrompt, userMessage, {
          temperature: 0.5,
          maxTokens: 4000,
        }),
    })

    const result = await polisher.polish({
      novelId: '',
      chapterId,
      content: body.content,
      passes,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[Polish] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** GET 返回可用润色轮次 */
export async function GET() {
  return NextResponse.json({
    passes: LanguagePolisher.getAvailablePasses(),
    recommendedOrder: LanguagePolisher.getRecommendedOrder(),
  })
}
