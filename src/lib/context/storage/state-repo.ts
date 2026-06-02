import { prisma } from '@/lib/db/prisma'
import type { CharacterLatestState } from '../types-prisma'

export class StateRepository {
  /** 获取某角色的最新状态快照 */
  async getLatestState(characterId: string) {
    return prisma.characterStateSnapshot.findFirst({
      where: { characterId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** 批量获取多个角色的最新状态快照 */
  async getLatestStates(characterIds: string[]): Promise<CharacterLatestState[]> {
    // SQLite 不支持 DISTINCT ON，用子查询
    const states = await prisma.$queryRawUnsafe(
      `SELECT css.* FROM CharacterStateSnapshot css
       INNER JOIN (
         SELECT characterId, MAX(createdAt) as maxCreated
         FROM CharacterStateSnapshot
         WHERE characterId IN (${characterIds.map(() => '?').join(',')})
         GROUP BY characterId
       ) latest ON css.characterId = latest.characterId AND css.createdAt = latest.maxCreated`,
      ...characterIds,
    )
    return states
  }

  /** 创建状态快照 */
  async create(data: {
    characterId: string
    chapterId: string
    novelId: string
    state: string
    location?: string
    alive?: boolean
    summary?: string
  }) {
    return prisma.characterStateSnapshot.create({ data })
  }

  /** 获取角色状态历史 */
  async getHistory(characterId: string, limit: number = 20) {
    return prisma.characterStateSnapshot.findMany({
      where: { characterId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        chapter: { select: { title: true, sortOrder: true } },
      },
    })
  }

  /** 删除某章节的所有状态快照 */
  async deleteByChapterId(chapterId: string) {
    return prisma.characterStateSnapshot.deleteMany({ where: { chapterId } })
  }
}

export const stateRepo = new StateRepository()
