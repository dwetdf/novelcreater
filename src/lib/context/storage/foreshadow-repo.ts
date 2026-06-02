import { prisma } from '@/lib/db/prisma'

export class ForeshadowRepository {
  /** 获取某小说的所有未回收伏笔 */
  async findUnresolved(novelId: string) {
    return prisma.foreshadowing.findMany({
      where: {
        novelId,
        status: { in: ['planted', 'planned'] },
      },
      include: {
        plantChapter: { select: { title: true, sortOrder: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** 获取计划在指定章节范围回收的伏笔 */
  async findPlannedNearChapter(novelId: string, chapterSortOrder: number, range: number = 3) {
    const foreshadowings = await prisma.$queryRawUnsafe(
      `SELECT 
        f.id, f.content, f.type, f.status,
        pc.title as plantChapterTitle, pc.sortOrder as plantChapterSortOrder,
        rc.sortOrder as planRecycleSortOrder
       FROM Foreshadowing f
       JOIN Chapter pc ON f.plantChapterId = pc.id
       LEFT JOIN Chapter rc ON f.planRecycleChapterId = rc.id
       WHERE f.novelId = ?
         AND f.status IN ('planted', 'planned')
         AND (rc.sortOrder BETWEEN ? AND ? OR f.planRecycleChapterId IS NULL)
       ORDER BY f.createdAt ASC
       LIMIT 5`,
      novelId,
      chapterSortOrder - range,
      chapterSortOrder + range,
    ) as {
      id: string; content: string; type: string; status: string
      plantChapterTitle: string; plantChapterSortOrder: number
      planRecycleSortOrder: number | null
    }[]
    return foreshadowings
  }

  /** 创建伏笔 */
  async create(data: {
    novelId: string
    content: string
    type?: string
    plantChapterId: string
    plantPosition?: string
    planRecycleChapterId?: string
    relatedCharacterIds?: string
    tags?: string
    notes?: string
  }) {
    return prisma.foreshadowing.create({ data })
  }

  /** 标记伏笔已回收 */
  async markClosed(id: string, actualChapterId: string) {
    return prisma.foreshadowing.update({
      where: { id },
      data: {
        status: 'closed',
        actualRecycleChapterId: actualChapterId,
      },
    })
  }

  /** 标记伏笔已废弃 */
  async markDiscarded(id: string) {
    return prisma.foreshadowing.update({
      where: { id },
      data: { status: 'discarded' },
    })
  }

  /** 删除伏笔 */
  async delete(id: string) {
    return prisma.foreshadowing.delete({ where: { id } })
  }
}

export const foreshadowRepo = new ForeshadowRepository()
