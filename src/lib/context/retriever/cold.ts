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

    // 构建查询文本
    const queryText = this.buildQueryText(req, preContext)
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
   */
  private buildQueryText(req: ContextRequest, preContext: string): string {
    const parts: string[] = []

    // 前文最后 200 字是最关键的查询信号
    if (preContext) {
      const tail = preContext.slice(-200)
      parts.push(tail)
    }

    if (req.selectedText) {
      parts.push(req.selectedText)
    }

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
