/**
 * MemoryManager — 长期记忆管理器
 * 
 * 管理三种记忆类型：
 * - 语义记忆（角色、世界观、规则）— 稳定，低频更新
 * - 情景记忆（章节摘要、关键事件）— 随写作增长
 * - 程序记忆（风格模式、写作习惯）— AI 学习到的模式
 * 
 * 提供创建、检索、重要性评分、记忆衰减功能。
 */

import { prisma } from '@/lib/db/prisma'
import type { MemoryType, MemorySubType } from './types'
import type { EmbeddingService } from './embedding/service'
import type { VectorStore } from './storage/vector'

// ─── 类型 ────────────────────────────────────────

export interface MemoryCreateInput {
  novelId: string
  type: MemoryType
  subType?: MemorySubType
  title: string
  content: string
  importance?: number
  sourceChapterId?: string
  relatedEntityIds?: string[]
}

export interface MemorySearchResult {
  item: {
    id: string
    type: string
    subType: string | null
    title: string
    content: string
    importance: number
    accessCount: number
    sourceChapterId: string | null
  }
  score: number
}

export interface MemoryStats {
  total: number
  byType: Record<string, number>
  byImportance: { high: number; medium: number; low: number }
  avgImportance: number
}

// ─── 记忆管理器 ──────────────────────────────────

export class MemoryManager {
  private embeddingService: EmbeddingService
  private vectorStore: VectorStore

  constructor(embeddingService: EmbeddingService, vectorStore: VectorStore) {
    this.embeddingService = embeddingService
    this.vectorStore = vectorStore
  }

  // ─── 创建 ──────────────────────────────────────

  /** 创建一条长期记忆 */
  async create(input: MemoryCreateInput) {
    // 生成向量
    let embedding: Buffer | undefined
    try {
      const vec = await this.embeddingService.embedSingle(
        `${input.title}\n${input.content}`
      )
      embedding = Buffer.from(new Float32Array(vec).buffer)
    } catch {
      // 向量生成失败不阻塞记忆创建
    }

    const item = await prisma.memoryItem.create({
      data: {
        novelId: input.novelId,
        type: input.type,
        subType: input.subType,
        title: input.title,
        content: input.content,
        importance: input.importance ?? 0.5,
        sourceChapterId: input.sourceChapterId,
        relatedEntityIds: input.relatedEntityIds
          ? JSON.stringify(input.relatedEntityIds)
          : null,
        embedding,
      },
    })

    // 同步到向量表
    if (embedding) {
      try {
        this.vectorStore.ensureTable('memory_vec', this.embeddingService.getDimensions())
        const vec = Array.from(new Float32Array(embedding.buffer))
        this.vectorStore.insertOne('memory_vec', item.id, vec)
      } catch {
        // 向量同步失败不阻塞
      }
    }

    return item
  }

  /** 批量创建（从章节自动提取） */
  async createFromChapter(
    novelId: string,
    chapterId: string,
    items: { type: MemoryType; subType?: MemorySubType; title: string; content: string; importance?: number }[],
  ) {
    const results = []
    for (const item of items) {
      results.push(await this.create({
        novelId,
        sourceChapterId: chapterId,
        ...item,
      }))
    }
    return results
  }

  // ─── 检索 ──────────────────────────────────────

  /** 语义检索：按查询文本找最相关的记忆 */
  async searchSemantic(
    novelId: string,
    query: string,
    options?: {
      type?: MemoryType
      topK?: number
      minImportance?: number
    },
  ): Promise<MemorySearchResult[]> {
    const topK = options?.topK ?? 10

    try {
      const queryVec = await this.embeddingService.embedSingle(query)
      
      this.vectorStore.ensureTable('memory_vec', this.embeddingService.getDimensions())
      const rawResults = this.vectorStore.search('memory_vec', queryVec, topK)

      if (rawResults.length === 0) return []

      const ids = rawResults.map((r) => r.id)
      const items = await prisma.memoryItem.findMany({
        where: {
          id: { in: ids },
          novelId,
          ...(options?.type ? { type: options.type } : {}),
          ...(options?.minImportance ? { importance: { gte: options.minImportance } } : {}),
        },
        select: {
          id: true,
          type: true,
          subType: true,
          title: true,
          content: true,
          importance: true,
          accessCount: true,
          sourceChapterId: true,
        },
      }) as Array<{
        id: string; type: string; subType: string | null
        title: string; content: string; importance: number
        accessCount: number; sourceChapterId: string | null
      }>

      // 更新访问计数
      await prisma.memoryItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { accessCount: { increment: 1 }, lastAccess: new Date() },
      })

      const distanceMap = new Map(rawResults.map((r) => [r.id, r.distance]))

      return items
        .map((item) => ({
          item,
          score: 1 - (distanceMap.get(item.id) ?? 1),
        }))
        .sort((a, b) => b.score - a.score)
    } catch {
      return []
    }
  }

  /** 精确检索：按类型和子类型查找 */
  async findByType(
    novelId: string,
    type: MemoryType,
    subType?: MemorySubType,
  ) {
    return prisma.memoryItem.findMany({
      where: {
        novelId,
        type,
        ...(subType ? { subType } : {}),
      },
      orderBy: { importance: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        importance: true,
        accessCount: true,
        createdAt: true,
      },
    })
  }

  /** 检索最重要的记忆（用于系统提示词） */
  async getTopImportant(
    novelId: string,
    limit: number = 10,
    type?: MemoryType,
  ) {
    return prisma.memoryItem.findMany({
      where: {
        novelId,
        ...(type ? { type } : {}),
      },
      orderBy: [
        { importance: 'desc' },
        { accessCount: 'desc' },
      ],
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        importance: true,
      },
    })
  }

  // ─── 更新 ──────────────────────────────────────

  /** 更新记忆内容 */
  async update(id: string, data: { title?: string; content?: string; importance?: number }) {
    const updateData: Record<string, unknown> = { ...data }

    // 如果内容变化，重新生成向量
    if (data.content) {
      try {
        const vec = await this.embeddingService.embedSingle(
          `${data.title ?? ''}\n${data.content}`
        )
        updateData.embedding = Buffer.from(new Float32Array(vec).buffer)

        // 同步向量表
        this.vectorStore.ensureTable('memory_vec', this.embeddingService.getDimensions())
        this.vectorStore.insertOne('memory_vec', id, vec)
      } catch {
        // ignore
      }
    }

    return prisma.memoryItem.update({
      where: { id },
      data: updateData,
    })
  }

  /** 提升重要性（被多次检索后自动提升） */
  async boostImportance(id: string, amount: number = 0.1) {
    const item = await prisma.memoryItem.findUnique({ where: { id }, select: { importance: true } })
    if (!item) return
    const newImportance = Math.min(1, item.importance + amount)
    return prisma.memoryItem.update({
      where: { id },
      data: { importance: newImportance },
    })
  }

  /** 衰减不重要的记忆 */
  async decayMemories(novelId: string, threshold: number = 0.1, decayRate: number = 0.95) {
    return prisma.memoryItem.updateMany({
      where: {
        novelId,
        importance: { lt: threshold },
        accessCount: { lt: 3 },
      },
      data: {
        importance: { multiply: decayRate },
      },
    })
  }

  // ─── 删除 ──────────────────────────────────────

  async delete(id: string) {
    // 从向量表删除
    try {
      this.vectorStore.deleteByIds('memory_vec', [id])
    } catch { /* ignore */ }
    
    return prisma.memoryItem.delete({ where: { id } })
  }

  // ─── 统计 ──────────────────────────────────────

  async getStats(novelId: string): Promise<MemoryStats> {
    const items = await prisma.memoryItem.findMany({
      where: { novelId },
      select: { type: true, importance: true },
    })

    const byType: Record<string, number> = {}
    let high = 0, medium = 0, low = 0
    let sumImportance = 0

    for (const item of items) {
      byType[item.type] = (byType[item.type] ?? 0) + 1
      if (item.importance >= 0.7) high++
      else if (item.importance >= 0.3) medium++
      else low++
      sumImportance += item.importance
    }

    return {
      total: items.length,
      byType,
      byImportance: { high, medium, low },
      avgImportance: items.length > 0 ? sumImportance / items.length : 0,
    }
  }
}
