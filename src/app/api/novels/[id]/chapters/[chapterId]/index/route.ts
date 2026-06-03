/**
 * 单章索引 API — 前端显式触发
 * 
 * POST /api/novels/[id]/chapters/[chapterId]/index
 * 
 * 触发 indexChapter + summarizeChapter，返回索引进度。
 */

import { NextResponse } from 'next/server'
import { indexChapter } from '@/lib/context/indexer'
import { summarizeChapter } from '@/lib/context/summarizer'
import { extractStateSnapshots, extractForeshadowings } from '@/lib/context/extractor'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params

  // 并行执行：索引 + 摘要 + 状态快照 + 伏笔抽取
  const [indexResult, summaryResult, stateResult, foreshadowResult] = await Promise.all([
    indexChapter(novelId, chapterId),
    summarizeChapter(novelId, chapterId),
    extractStateSnapshots(novelId, chapterId),
    extractForeshadowings(novelId, chapterId),
  ])

  return NextResponse.json({
    index: indexResult,
    summary: summaryResult,
    stateSnapshots: stateResult,
    foreshadowings: foreshadowResult,
  })
}

/** GET 返回索引状态 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id: novelId, chapterId } = await params

  const { prisma } = await import('@/lib/db/prisma')

  const [chunkCount, summary, stateCount, foreshadowCount] = await Promise.all([
    prisma.chapterChunk.count({ where: { chapterId, novelId } }),
    prisma.chapterSummary.findUnique({
      where: { chapterId },
      select: { oneLineSummary: true, generatedAt: true },
    }),
    prisma.characterStateSnapshot.count({ where: { chapterId, novelId } }),
    prisma.foreshadowing.count({ where: { plantChapterId: chapterId, novelId } }),
  ]) as [number, { oneLineSummary: string | null; generatedAt: Date | null } | null, number, number]

  return NextResponse.json({
    chapterId,
    indexed: chunkCount > 0,
    chunkCount,
    hasSummary: !!summary?.oneLineSummary,
    summaryGeneratedAt: summary?.generatedAt ?? null,
    stateSnapshots: stateCount,
    foreshadowingsPlant: foreshadowCount,
  })
}
