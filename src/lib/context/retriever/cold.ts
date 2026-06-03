/**
 * ColdContextCollector — 冷上下文采集（语义检索）
 * 
 * 使用向量嵌入进行语义检索，找到与当前写作位置最相关的历史内容。
 * 结合混合检索（向量 + 关键词）提升召回率。
 */

import { HybridSearch } from './hybrid-search'
import type { ContextRequest, RetrievedChunk, ForeshadowReminder } from '../types'
import type { VectorStore } from '../storage/vector'
import type { EmbeddingService } from '../embedding/service'
import type { ForeshadowingWithPlant } from '../types-prisma'
import { foreshadowRepo } from '../storage/foreshadow-repo'

export interface ColdContext {
  retrievedChunks: RetrievedChunk[]
  retrievedForeshadowings: ForeshadowReminder[]
}

export class ColdContextCollector {
  private hybridSearch: HybridSearch

  constructor(vectorStore: VectorStore) {
    this.hybridSearch = new HybridSearch(vectorStore)
  }

  /**
   * 采集冷上下文
   */
  async collect(
    req: ContextRequest,
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    preContext: string,
  ): Promise<ColdContext> {
    const topK = req.options?.retrievalTopK ?? 5
    const scope = req.options?.retrievalScope ?? 'volume'

    // 获取章节摘要，增强查询信号
    let chapterSummary = ''
    try {
      const { prisma } = await import('@/lib/db/prisma')
      const ch = await prisma.chapter.findUnique({
        where: { id: req.chapterId },
        select: { summary: true },
      }) as { summary: string | null } | null
      if (ch?.summary) chapterSummary = ch.summary
    } catch { /* ignore */ }

    // 构建查询文本
    const queryText = this.buildQueryText(req, preContext, chapterSummary)
    if (!queryText.trim()) {
      return { retrievedChunks: [], retrievedForeshadowings: [] }
    }

    // 生成查询向量（使用缓存）
    const queryEmbedding = await embeddingService.embedSingle(queryText)

    // 混合检索章节切片
    const { chunks } = await this.hybridSearch.search({
      novelId: req.novelId,
      queryEmbedding,
      queryText,
      vectorTable: 'chunk_vec',
      topK,
      retrievalScope: scope,
      chapterId: req.chapterId,
    })

    // 伏笔检索（用同一 query embedding）
    let retrievedForeshadowings: ForeshadowReminder[] = []
    if (req.options?.injectForeshadowing !== false) {
      retrievedForeshadowings = await this.searchForeshadowings(
        vectorStore,
        queryEmbedding,
        req.novelId,
        2,
      )
    }

    return { retrievedChunks: chunks, retrievedForeshadowings }
  }

  /**
   * 构建查询文本（用于生成检索向量）
   * 使用多重信号：前文尾部 + 选中文本 + 用户指令 + 章节摘要
   */
  private buildQueryText(req: ContextRequest, preContext: string, chapterSummary?: string): string {
    const parts: string[] = []

    // 1. 章节摘要（最能代表当前写作方向）
    if (chapterSummary) {
      parts.push(chapterSummary)
    }

    // 2. 前文最后 300 字（最近的上下文信号）
    if (preContext) {
      const tail = preContext.slice(-300)
      parts.push(tail)
    }

    // 3. 用户选中的文本
    if (req.selectedText) {
      parts.push(req.selectedText)
    }

    // 4. 用户指令
    if (req.userInstruction) {
      parts.push(req.userInstruction)
    }

    return parts.join(' ')
  }

  /**
   * 伏笔语义检索
   */
  private async searchForeshadowings(
    vectorStore: VectorStore,
    queryEmbedding: number[],
    novelId: string,
    topK: number,
  ): Promise<ForeshadowReminder[]> {
    try {
      const results = vectorStore.search('foreshadow_vec', queryEmbedding, topK)
      if (results.length === 0) return []

      const ids = results.map((r) => r.id)
      const unresolved = await foreshadowRepo.findUnresolved(novelId) as ForeshadowingWithPlant[]
      
      const matched = unresolved.filter((f) => ids.includes(f.id))
      return matched.map((f) => ({
        id: f.id,
        content: f.content,
        plantChapterTitle: f.plantChapter.title,
        plantChapterNumber: f.plantChapter.sortOrder,
        type: f.type,
        status: f.status,
      }))
    } catch {
      // 伏笔向量表可能不存在
      return []
    }
  }

  /**
   * 获取某操作的默认 top-K
   */
  static defaultTopK(operation: string): number {
    switch (operation) {
      case 'continue': return 5
      case 'polish': return 3
      case 'expand': return 5
      case 'brainstorm': return 8
      default: return 5
    }
  }
}
