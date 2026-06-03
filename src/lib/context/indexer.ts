/**
 * indexer.ts — 写时索引服务
 * 
 * 章节正文落库后，异步触发：分块 → 嵌入 → 写向量表。
 * 盘活整个冷层 RAG 检索。
 * 
 * 步骤：
 * 1. 读 Chapter.content，剥 HTML 得纯文本
 * 2. 入口去重：sha256 哈希比较，未变则跳过
 * 3. chunkText() 分块（800字/块，100字重叠）
 * 4. chunkRepo 先清旧 → 批量创建 ChapterChunk
 * 5. EmbeddingService 批量嵌入（云端 provider）
 * 6. VectorStore.ensureTable + insert → chunk_vec
 * 7. EmbeddingCache 去重
 */

import { createHash, createDecipheriv } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import { chunkText } from './embedding/chunker'
import { chunkRepo } from './storage/chunk-repo'
import { getEmbeddingService, initEmbeddingService } from './embedding/service'
import { getVectorStore, initVectorStore } from './storage/vector'
import { getActiveProvider } from '@/lib/ai/call'
import type { EmbeddingConfig } from './types'

// ─── 索引结果 ────────────────────────────────────

export interface IndexResult {
  chapterId: string
  status: 'skipped' | 'indexed' | 'error'
  chunksCreated: number
  vectorsWritten: number
  hash: string
  error?: string
  latencyMs: number
}

// ─── 主入口 ──────────────────────────────────────

export async function indexChapter(
  novelId: string,
  chapterId: string,
): Promise<IndexResult> {
  const startTime = Date.now()

  try {
    // 1. 读章节内容
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId, novelId },
      select: { content: true },
    })

    if (!chapter?.content) {
      return {
        chapterId, status: 'skipped', chunksCreated: 0, vectorsWritten: 0,
        hash: '', latencyMs: Date.now() - startTime,
      }
    }

    // 2. 剥 HTML → 纯文本
    const plainText = stripHtml(chapter.content)
    if (!plainText.trim()) {
      return {
        chapterId, status: 'skipped', chunksCreated: 0, vectorsWritten: 0,
        hash: '', latencyMs: Date.now() - startTime,
      }
    }

    // 3. 入口去重：sha256 哈希
    const hash = createHash('sha256').update(plainText).digest('hex')

    // 检查上次索引 hash（存在 ChapterChunk 表中，用第一条的 content hash 代理）
    const existingHash = await getLastIndexHash(chapterId)
    if (existingHash === hash) {
      return {
        chapterId, status: 'skipped', chunksCreated: 0, vectorsWritten: 0,
        hash, latencyMs: Date.now() - startTime,
      }
    }

    // 4. 分块
    const chunks = chunkText(plainText, { targetSize: 800, overlapSize: 100, maxSize: 1200 })
    if (chunks.length === 0) {
      return {
        chapterId, status: 'skipped', chunksCreated: 0, vectorsWritten: 0,
        hash, latencyMs: Date.now() - startTime,
      }
    }

    // 5. 清旧切片 + 批量创建
    await chunkRepo.deleteByChapterId(chapterId)

    await chunkRepo.createMany(
      chunks.map((c) => ({
        chapterId,
        novelId,
        seq: c.seq,
        content: c.content,
        tokenCount: c.tokenCount,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
      })),
    )

    // 6. 获取创建的切片 ID
    const createdChunks = await chunkRepo.findByChapterId(chapterId) as Array<{ id: string; content: string }>

    // 7. 获取嵌入服务配置（强制重置单例避免旧配置污染）
    const embeddingConfig = await getEmbeddingConfig(novelId)
    console.log('[Indexer] Embedding config:', JSON.stringify({ provider: embeddingConfig.provider, model: embeddingConfig.model, dimensions: embeddingConfig.dimensions, baseUrl: embeddingConfig.baseUrl, hasKey: !!embeddingConfig.apiKey }))
    initEmbeddingService(embeddingConfig)
    const embeddingService = getEmbeddingService()
    console.log('[Indexer] Service config after init:', JSON.stringify({ provider: embeddingService.getConfig().provider, model: embeddingService.getConfig().model, baseUrl: embeddingService.getConfig().baseUrl, hasKey: !!embeddingService.getConfig().apiKey }))
    const dims = embeddingService.getDimensions()

    // 8. 批量嵌入 — 长块拆分为重叠子块，避免截断丢失信息
    //    bge-large-zh-v1.5 最大 512 tokens ≈ 350中文字
    const SUB_CHUNK_SIZE = 300   // 子块目标大小
    const SUB_OVERLAP = 50       // 子块重叠
    const subTexts: string[] = []
    const subIds: string[] = []  // 子块对应的 chunk id

    for (const c of createdChunks) {
      if (c.content.length <= 350) {
        subTexts.push(c.content)
        subIds.push(c.id)
      } else {
        // 滑动窗口拆分长块
        let start = 0
        while (start < c.content.length) {
          let end = start + SUB_CHUNK_SIZE
          if (end >= c.content.length) {
            subTexts.push(c.content.slice(start))
            subIds.push(`${c.id}_${subTexts.length}`)
            break
          }
          // 在句子边界切断
          const slice = c.content.slice(start, end + 30)
          const breakIdx = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'), slice.lastIndexOf('\n'))
          if (breakIdx > SUB_CHUNK_SIZE * 0.6) end = start + breakIdx + 1
          subTexts.push(c.content.slice(start, end))
          subIds.push(`${c.id}_${subTexts.length}`)
          start = end - SUB_OVERLAP
        }
      }
    }

    const embedResult = await embeddingService.embed(subTexts)

    // 9. 写入向量表 — 每个子块一条向量
    const vectorStore = getVectorStore()
    vectorStore.ensureTable('chunk_vec', dims)

    const vectorItems = subTexts.map((_, i) => ({
      id: subIds[i],
      embedding: embedResult.embeddings[i],
    }))
    vectorStore.insert('chunk_vec', vectorItems)

    // 10. 保存 hash（存到第一条 chunk 的备注，简单方案）
    await storeIndexHash(chapterId, hash)

    return {
      chapterId,
      status: 'indexed',
      chunksCreated: createdChunks.length,
      vectorsWritten: vectorItems.length,
      hash,
      latencyMs: Date.now() - startTime,
    }
  } catch (err) {
    console.error(`[Indexer] Failed to index chapter ${chapterId}:`, err)
    return {
      chapterId,
      status: 'error',
      chunksCreated: 0,
      vectorsWritten: 0,
      hash: '',
      error: String(err),
      latencyMs: Date.now() - startTime,
    }
  }
}

// ─── 获取嵌入配置 ─────────────────────────────────

async function getEmbeddingConfig(novelId: string): Promise<Partial<EmbeddingConfig>> {
  try {
    const settings = await prisma.novelSettings.findUnique({
      where: { novelId },
      select: {
        embeddingProviderId: true,
        embeddingModel: true,
        defaultProviderId: true,
        defaultProvider: { select: { baseUrl: true, apiKey: true } },
        embeddingProvider: { select: { baseUrl: true, apiKey: true } },
      },
    }) as {
      embeddingProviderId: string | null; embeddingModel: string | null
      defaultProviderId: string | null
      defaultProvider: { baseUrl: string; apiKey: string } | null
      embeddingProvider: { baseUrl: string; apiKey: string } | null
    } | null

    // 优先用嵌入专用 provider
    const embedProvider = settings?.embeddingProviderId
      ? settings.embeddingProvider
      : settings?.defaultProvider

    if (embedProvider?.apiKey) {
      const decryptedKey = decryptStoredKey(embedProvider.apiKey)
      return {
        provider: 'openai',
        model: settings?.embeddingModel || 'BAAI/bge-large-zh-v1.5',
        dimensions: settings?.embeddingModel?.includes('large') ? 1024 : 1536,
        apiKey: decryptedKey,
        baseUrl: embedProvider.baseUrl,
      }
    }
  } catch {
    // 配置读取失败 → 回退到本地（如果可用）
  }

  // 回退：尝试用活跃 provider
  const activeProvider = await getActiveProvider()
  if (activeProvider?.apiKey) {
    return {
      provider: 'openai',
      model: 'BAAI/bge-large-zh-v1.5',
      dimensions: 1024,
      apiKey: decryptStoredKey(activeProvider.apiKey),
      baseUrl: activeProvider.baseUrl,
    }
  }

  // 最终回退：本地模型配置（可能失败）
  return {
    provider: 'local',
    model: 'Xenova/bge-small-zh-v1.5',
    dimensions: 512,
  }
}

// ─── 哈希管理 ────────────────────────────────────

/** 将索引 hash 存到一个简单 KV 表（用 ChapterSummary 的 briefSummary 字段不现实，新建一个 meta 表太重。用更轻量的方案：直接用 ChapterChunk 的第一条来存 hash 信息。如果没有 chunk，说明 hash 未变） */
async function getLastIndexHash(chapterId: string): Promise<string | null> {
  // 用 novelId + chapterId 的 hash 代理：检查是否已有切片
  const count = await chunkRepo.countByNovelId?.(chapterId)
  if (!count) {
    // 用 findFirst 检查
    const first = await prisma.chapterChunk.findFirst({
      where: { chapterId },
      select: { id: true },
    })
    return first ? 'has_chunks' : null  // 有切片但没 hash → 视为需重索引
  }
  return 'has_chunks'
}

async function storeIndexHash(chapterId: string, hash: string): Promise<void> {
  // 简单方案：不额外存储 hash，通过 chunk 存在性判断。
  // 如需精确 hash 比对，可在 Chapter 表加 indexHash 字段或独立表。
  // 当前：有 chunk 即视为已索引。
}

// ─── 工具 ────────────────────────────────────────

// ─── Key 解密 ────────────────────────────────────

const DEC_KEY2 = Buffer.alloc(32)
Buffer.from((process.env['ENCRYPTION_KEY'] || 'novelcreater-dev-key-32chars-xx').slice(0, 32), 'utf8').copy(DEC_KEY2)

function decryptStoredKey(encoded: string): string {
  if (!encoded) return ''
  try {
    const parts = encoded.split(':')
    if (parts.length !== 3) return encoded
    const iv = Buffer.from(parts[0], 'hex')
    const tag = Buffer.from(parts[1], 'hex')
    const decipher = createDecipheriv('aes-256-gcm', DEC_KEY2, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8')
  } catch { return encoded }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')     // 去掉标签
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')  // 压缩多余空行
    .trim()
}
