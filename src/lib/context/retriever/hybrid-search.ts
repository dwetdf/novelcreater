/**
 * HybridSearch — 混合检索（向量 + 关键词）
 * 
 * 向量搜索提供语义匹配，关键词搜索提供精确匹配。
 * 合并去重后返回排序结果。
 */

import type { RetrievedChunk } from '../types'
import type { VectorStore, VecSearchResult } from '../storage/vector'
import type { ChunkWithChapter } from '../types-prisma'
import { prisma } from '@/lib/db/prisma'

export interface HybridSearchOptions {
  novelId: string
  queryEmbedding: number[]
  queryText: string
  vectorTable: string
  topK: number
  retrievalScope: 'chapter' | 'volume' | 'novel' | 'smart'
  chapterId?: string            // 当 scope=chapter 时使用
  volumeId?: string             // 当 scope=volume 时使用
  vectorWeight?: number         // 向量结果权重，默认 0.7
  keywordWeight?: number        // 关键词结果权重，默认 0.3
}

export interface HybridSearchResult {
  chunks: RetrievedChunk[]
  stats: {
    vectorResults: number
    keywordResults: number
    mergedResults: number
    latencyMs: number
  }
}

export class HybridSearch {
  private vectorStore: VectorStore

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore
  }

  async search(options: HybridSearchOptions): Promise<HybridSearchResult> {
    const startTime = Date.now()
    const { topK, vectorWeight = 0.7, keywordWeight = 0.3 } = options

    // 并行执行向量搜索和关键词搜索
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(options),
      this.keywordSearch(options),
    ])

    // 合并 & 去重
    const merged = this.mergeResults(
      vectorResults,
      keywordResults,
      topK,
      vectorWeight,
      keywordWeight,
    )

    return {
      chunks: merged,
      stats: {
        vectorResults: vectorResults.length,
        keywordResults: keywordResults.length,
        mergedResults: merged.length,
        latencyMs: Date.now() - startTime,
      },
    }
  }

  // ─── 向量搜索 ──────────────────────────────────

  private async vectorSearch(options: HybridSearchOptions): Promise<RetrievedChunk[]> {
    const { queryEmbedding, vectorTable, topK, novelId } = options

    // 从向量表搜索
    const rawResults = this.vectorStore.search(vectorTable, queryEmbedding, topK * 2)

    if (rawResults.length === 0) return []

    // 获取切片详情（含章节信息）
    const chunkIds = rawResults.map((r: VecSearchResult) => r.id)
    const chunks = await prisma.chapterChunk.findMany({
      where: {
        id: { in: chunkIds },
        novelId,
      },
      include: {
        chapter: {
          select: { id: true, title: true, sortOrder: true, volumeId: true },
        },
      },
    }) as ChunkWithChapter[]

    // 构建 ID → Chunk 映射
    const chunkMap = new Map(chunks.map((c) => [c.id, c]))
    // 构建 ID → distance 映射
    const distanceMap = new Map(rawResults.map((r: VecSearchResult) => [r.id, r.distance]))

    return chunkIds
      .filter((id) => chunkMap.has(id))
      .map((id) => {
        const chunk = chunkMap.get(id)!
        const distance = distanceMap.get(id) ?? 1
        return {
          chunkId: id,
          chapterId: chunk.chapterId,
          chapterTitle: chunk.chapter.title,
          chapterNumber: chunk.chapter.sortOrder,
          content: chunk.content,
          score: 1 - distance, // 将 distance 转为相似度分数
          source: 'vector' as const,
        }
      })
      .sort((a, b) => b.score - a.score)
  }

  // ─── 关键词搜索 ────────────────────────────────

  private async keywordSearch(options: HybridSearchOptions): Promise<RetrievedChunk[]> {
    const { queryText, novelId, topK } = options

    // 提取关键词（简单分词：取2-4字的片段）
    const keywords = this.extractKeywords(queryText)
    if (keywords.length === 0) return []

    // 构建 LIKE 查询
    const conditions = keywords.map(() => `content LIKE ?`).join(' OR ')
    const params = keywords.map((kw) => `%${kw}%`)

    const chunks = await prisma.$queryRawUnsafe(
      `SELECT 
        cc.id, cc.chapterId, cc.content,
        ch.title as chapterTitle, ch.sortOrder as chapterSortOrder, ch.volumeId
      FROM ChapterChunk cc
      JOIN Chapter ch ON cc.chapterId = ch.id
      WHERE cc.novelId = ? AND (${conditions})
      LIMIT ?`,
      novelId,
      ...params,
      topK * 2,
    ) as Array<{ id: string; chapterId: string; content: string; chapterTitle: string; chapterSortOrder: number; volumeId: string | null }>

    if (chunks.length === 0) return []

    // 计算关键词匹配分数（命中关键词数 / 总关键词数）
    return chunks
      .map((chunk) => {
        const hitCount = keywords.filter((kw) => chunk.content.includes(kw)).length
        const score = (hitCount / keywords.length) * 0.8 // 关键词分数上限 0.8
        return {
          chunkId: chunk.id,
          chapterId: chunk.chapterId,
          chapterTitle: chunk.chapterTitle,
          chapterNumber: chunk.chapterSortOrder,
          content: this.truncateContent(chunk.content, 300),
          score,
          source: 'keyword' as const,
        }
      })
      .sort((a, b) => b.score - a.score)
  }

  // ─── 合并结果 ──────────────────────────────────

  private mergeResults(
    vectorResults: RetrievedChunk[],
    keywordResults: RetrievedChunk[],
    topK: number,
    vectorWeight: number,
    keywordWeight: number,
  ): RetrievedChunk[] {
    const merged = new Map<string, RetrievedChunk>()

    // 先添加向量结果
    for (const r of vectorResults) {
      merged.set(r.chunkId, { ...r, score: r.score * vectorWeight })
    }

    // 合并关键词结果（加权叠加）
    for (const r of keywordResults) {
      if (merged.has(r.chunkId)) {
        const existing = merged.get(r.chunkId)!
        existing.score += r.score * keywordWeight
        // 保留更长的内容
        if (r.content.length > existing.content.length) {
          existing.content = r.content
        }
      } else {
        merged.set(r.chunkId, { ...r, score: r.score * keywordWeight })
      }
    }

    // 排序取 top-K
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  // ─── 关键词提取 ────────────────────────────────

  private extractKeywords(text: string): string[] {
    // 简单的中文关键词提取：找出现频率高的 2-4 字组合
    // 这里使用简化版本：提取名词性短语
    const cleaned = text.replace(/[，。！？、；：""''（）\s\n]/g, ' ')
    const words = cleaned.split(' ').filter((w) => w.length >= 2)
    
    // 去重 + 去停用词
    const stopWords = new Set(['这是', '一个', '这个', '那个', '什么', '怎么', '为什么', '可以', '没有', '已经', '还是', '或者', '因为', '所以', '但是', '然而', '如果', '虽然', '不过', '只是', '就是'])
    
    const unique = [...new Set(words)].filter((w) => !stopWords.has(w) && w.length <= 4)

    // 最多取 10 个关键词
    return unique.slice(0, 10)
  }

  // ─── 工具 ──────────────────────────────────────

  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content
    // 在 maxChars 附近找句子边界
    const slice = content.slice(0, maxChars)
    const lastPeriod = Math.max(
      slice.lastIndexOf('。'),
      slice.lastIndexOf('！'),
      slice.lastIndexOf('？'),
    )
    if (lastPeriod > maxChars * 0.5) {
      return content.slice(0, lastPeriod + 1)
    }
    return slice + '...'
  }
}
