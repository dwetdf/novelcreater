/**
 * 大纲落库 API — 事务批量创建卷+章
 * 
 * POST /api/novels/[id]/outline/commit
 * Body: { volumes: [{ title, summary, chapters: [{ title, summary, keyEvents?, characters?, targetWords? }] }] }
 * 
 * 在一个事务内创建所有 Volume + Chapter，显式赋 sortOrder。
 * 章序 = 卷序*1000 + 卷内序，全局有序且分卷段。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

interface CommitChapter {
  title: string
  summary?: string
  keyEvents?: string[]
  characters?: string[]
  targetWords?: number
}

interface CommitVolume {
  title: string
  summary?: string
  chapters: CommitChapter[]
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params

  try {
    const body = await req.json() as { volumes?: CommitVolume[] }

    if (!body.volumes || !Array.isArray(body.volumes) || body.volumes.length === 0) {
      return NextResponse.json(
        { error: '缺少必要参数：volumes（非空数组）' },
        { status: 400 },
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
      const createdVolumes: { id: string; title: string }[] = []
      let totalChapters = 0

      for (let vi = 0; vi < body.volumes!.length; vi++) {
        const vol = body.volumes![vi]
        const volSortOrder = vi + 1

        const volume = await tx.volume.create({
          data: {
            novelId,
            title: vol.title,
            summary: vol.summary || null,
            sortOrder: volSortOrder,
          },
        })

        createdVolumes.push({ id: volume.id, title: volume.title })

        // 批量创建章节
        for (let ci = 0; ci < vol.chapters.length; ci++) {
          const ch = vol.chapters[ci]
          const chapterSortOrder = volSortOrder * 1000 + ci + 1

          await tx.chapter.create({
            data: {
              novelId,
              volumeId: volume.id,
              title: ch.title,
              summary: ch.summary || null,
              targetWords: ch.targetWords ?? 3000,
              sortOrder: chapterSortOrder,
              status: 'outline',
            },
          })
          totalChapters++
        }
      }

      return { volumes: createdVolumes, totalChapters }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[Outline Commit] Error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    )
  }
}
