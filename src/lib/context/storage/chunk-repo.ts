/**
 * ChunkRepository — 章节切片 CRUD
 */

import { prisma } from '@/lib/db/prisma'

export class ChunkRepository {
  /** 按章节 ID 获取所有切片 */
  async findByChapterId(chapterId: string) {
    return prisma.chapterChunk.findMany({
      where: { chapterId },
      orderBy: { seq: 'asc' },
    })
  }

  /** 按小说 ID 获取所有切片（用于跨章检索元数据） */
  async findByNovelId(novelId: string) {
    return prisma.chapterChunk.findMany({
      where: { novelId },
      orderBy: [{ chapterId: 'asc' }, { seq: 'asc' }],
    })
  }

  /** 批量创建切片 */
  async createMany(
    chunks: {
      chapterId: string
      novelId: string
      seq: number
      content: string
      tokenCount: number
      startOffset: number
      endOffset: number
    }[]
  ) {
    return prisma.chapterChunk.createMany({
      data: chunks,
    })
  }

  /** 删除某章节的所有切片 */
  async deleteByChapterId(chapterId: string) {
    return prisma.chapterChunk.deleteMany({
      where: { chapterId },
    })
  }

  /** 删除某小说的所有切片 */
  async deleteByNovelId(novelId: string) {
    return prisma.chapterChunk.deleteMany({
      where: { novelId },
    })
  }

  /** 获取切片 ID 列表（用于向量表同步） */
  async getIdsByChapterId(chapterId: string): Promise<string[]> {
    const chunks = await prisma.chapterChunk.findMany({
      where: { chapterId },
      select: { id: true },
    }) as { id: string }[]
    return chunks.map((c) => c.id)
  }

  /** 获取切片及其关联章节信息（用于冷检索结果展示） */
  async findWithChapterInfo(chunkIds: string[]) {
    return prisma.chapterChunk.findMany({
      where: { id: { in: chunkIds } },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            sortOrder: true,
          },
        },
      },
    })
  }

  /** 统计某小说的切片数 */
  async countByNovelId(novelId: string): Promise<number> {
    return prisma.chapterChunk.count({
      where: { novelId },
    })
  }
}

export const chunkRepo = new ChunkRepository()
