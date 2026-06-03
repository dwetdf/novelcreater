/**
 * memory-singleton.ts — MemoryManager 接线
 * 
 * 实例化 MemoryManager，注入云端 embedding + vectorStore。
 * 初始化顺序：先确认维度 → ensureTable → new MemoryManager。
 */

import { MemoryManager } from './memory-manager'
import { getEmbeddingService } from './embedding/service'
import { getVectorStore } from './storage/vector'
import type { EmbeddingConfig } from './types'

let memoryManagerInstance: MemoryManager | null = null

export function getMemoryManager(): MemoryManager {
  if (memoryManagerInstance) return memoryManagerInstance

  // 使用云端嵌入（OpenAI 兼容）
  const embeddingConfig: Partial<EmbeddingConfig> = {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    apiKey: process.env['OPENAI_API_KEY'] || '',
  }

  const embeddingService = getEmbeddingService(embeddingConfig)
  const dims = embeddingService.getDimensions()
  const vectorStore = getVectorStore()
  vectorStore.ensureTable('memory_vec', dims)

  memoryManagerInstance = new MemoryManager(embeddingService, vectorStore)
  return memoryManagerInstance
}

/** 重置单例（provider 变更时调用） */
export function resetMemoryManager(): void {
  memoryManagerInstance = null
}
