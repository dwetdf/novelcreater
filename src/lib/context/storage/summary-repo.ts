import { prisma } from '@/lib/db/prisma'
import type { SummaryWithChapter } from '../types-prisma'

export class SummaryRepository {
  async findByChapterId(chapterId: string) {
    return prisma.chapterSummary.findUnique({ where: { chapterId } })
  }

  async upsert(chapterId: string, data: {
    oneLineSummary?: string
    briefSummary?: string
    detailedSummary?: string
    briefEmbedding?: Uint8Array
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prisma.chapterSummary.upsert({
      where: { chapterId },
      create: { chapterId, ...data } as any,
      update: { ...data, generatedAt: new Date() } as any,
    })
  }

  /** 按章节 ID 列表获取摘要 */
  async findByChapterIds(chapterIds: string[]): Promise<SummaryWithChapter[]> {
    return prisma.chapterSummary.findMany({
      where: { chapterId: { in: chapterIds } },
      include: {
        chapter: { select: { id: true, title: true, sortOrder: true } },
      },
      orderBy: { chapter: { sortOrder: 'asc' } },
    }) as unknown as SummaryWithChapter[]
  }

  /** 获取某卷下所有章节的摘要（用于近章回顾） */
  async findByVolumeId(volumeId: string): Promise<SummaryWithChapter[]> {
    return prisma.chapterSummary.findMany({
      where: { chapter: { volumeId } },
      include: {
        chapter: { select: { id: true, title: true, sortOrder: true } },
      },
      orderBy: { chapter: { sortOrder: 'asc' } },
    }) as unknown as SummaryWithChapter[]
  }

  /** 获取指定章节之前的 N 章摘要 */
  async findRecentBeforeChapter(novelId: string, chapterSortOrder: number, limit: number = 3) {
    const chapters = await prisma.chapter.findMany({
      where: {
        novelId,
        sortOrder: { lt: chapterSortOrder },
        status: { not: 'outline' },
      },
      orderBy: { sortOrder: 'desc' },
      take: limit,
      select: { id: true },
    }) as { id: string }[]

    if (chapters.length === 0) return []

    return this.findByChapterIds(chapters.map((c) => c.id))
  }

  async deleteByChapterId(chapterId: string) {
    return prisma.chapterSummary.deleteMany({ where: { chapterId } })
  }
}

export const summaryRepo = new SummaryRepository()
