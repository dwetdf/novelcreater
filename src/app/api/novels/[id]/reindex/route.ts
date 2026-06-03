/**
 * 全书重建索引 API
 * 
 * POST /api/novels/[id]/reindex
 * 
 * 遍历所有章节，逐章调用 indexChapter + summarizeChapter。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { indexChapter } from '@/lib/context/indexer'
import { summarizeChapter } from '@/lib/context/summarizer'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params

  const chapters = await prisma.chapter.findMany({
    where: { novelId, content: { not: '' } },
    select: { id: true, title: true },
    orderBy: { sortOrder: 'asc' },
  }) as { id: string; title: string }[]

  if (chapters.length === 0) {
    return NextResponse.json({ message: '没有可索引的章节', total: 0 })
  }

  const results: Array<{ chapterId: string; title: string; index: unknown; summary: unknown }> = []

  for (const ch of chapters) {
    const [indexResult, summaryResult] = await Promise.all([
      indexChapter(novelId, ch.id),
      summarizeChapter(novelId, ch.id),
    ])
    results.push({
      chapterId: ch.id,
      title: ch.title,
      index: indexResult,
      summary: summaryResult,
    })
  }

  const indexed = results.filter((r) => (r.index as { status: string }).status === 'indexed').length
  const skipped = results.filter((r) => (r.index as { status: string }).status === 'skipped').length
  const errors = results.filter((r) => (r.index as { status: string }).status === 'error').length

  return NextResponse.json({
    total: chapters.length,
    indexed,
    skipped,
    errors,
    results,
  })
}
