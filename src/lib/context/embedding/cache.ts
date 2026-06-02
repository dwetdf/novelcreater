/**
 * EmbeddingCache — 嵌入向量缓存
 * 
 * 基于内容的 MD5 哈希缓存嵌入向量。
 * - 对于不变化的内容（角色档案、世界观），向量只生成一次
 * - 缓存存储于内存 + 可选持久化到 SQLite
 */

import crypto from 'crypto'

interface CacheEntry {
  embedding: number[]
  createdAt: number
  hitCount: number
}

export class EmbeddingCache {
  private memory: Map<string, CacheEntry> = new Map()
  private maxSize: number
  private hits: number = 0
  private misses: number = 0

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  /** 计算内容的哈希键 */
  static hashKey(content: string): string {
    return crypto.createHash('md5').update(content, 'utf-8').digest('hex')
  }

  /** 获取缓存的向量 */
  get(content: string): number[] | null {
    const key = EmbeddingCache.hashKey(content)
    const entry = this.memory.get(key)
    if (entry) {
      entry.hitCount++
      this.hits++
      return entry.embedding
    }
    this.misses++
    return null
  }

  /** 批量获取（返回命中的和未命中的） */
  getBatch(contents: string[]): {
    hits: Map<number, number[]>        // index -> embedding
    misses: { index: number; content: string }[]
  } {
    const hits = new Map<number, number[]>()
    const misses: { index: number; content: string }[] = []

    for (let i = 0; i < contents.length; i++) {
      const embedding = this.get(contents[i])
      if (embedding) {
        hits.set(i, embedding)
      } else {
        misses.push({ index: i, content: contents[i] })
      }
    }

    return { hits, misses }
  }

  /** 缓存向量 */
  set(content: string, embedding: number[]): void {
    const key = EmbeddingCache.hashKey(content)
    
    // 如果已满，淘汰最旧的条目
    if (this.memory.size >= this.maxSize) {
      this.evictOldest()
    }

    this.memory.set(key, {
      embedding,
      createdAt: Date.now(),
      hitCount: 0,
    })
  }

  /** 批量缓存 */
  setBatch(items: { content: string; embedding: number[] }[]): void {
    for (const item of items) {
      this.set(item.content, item.embedding)
    }
  }

  /** 检查是否已缓存 */
  has(content: string): boolean {
    return this.memory.has(EmbeddingCache.hashKey(content))
  }

  /** 清空所有缓存 */
  clear(): void {
    this.memory.clear()
    this.hits = 0
    this.misses = 0
  }

  /** 获取统计信息 */
  stats(): { size: number; maxSize: number; hits: number; misses: number; hitRate: number } {
    return {
      size: this.memory.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? this.hits / (this.hits + this.misses)
        : 0,
    }
  }

  // ─── 内部 ──────────────────────────────────────

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.memory) {
      if (entry.hitCount === 0 && entry.createdAt < oldestTime) {
        oldestKey = key
        oldestTime = entry.createdAt
      }
    }

    // 如果没有未被访问的条目，删除任意一个
    if (!oldestKey) {
      oldestKey = this.memory.keys().next().value ?? null
    }

    if (oldestKey) {
      this.memory.delete(oldestKey)
    }
  }
}

// ─── 全局单例 ────────────────────────────────────

let embeddingCacheInstance: EmbeddingCache | null = null

export function getEmbeddingCache(maxSize?: number): EmbeddingCache {
  if (!embeddingCacheInstance) {
    embeddingCacheInstance = new EmbeddingCache(maxSize)
  }
  return embeddingCacheInstance
}
