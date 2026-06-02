/**
 * EmbeddingService — 文本嵌入服务
 * 
 * 支持两种后端：
 * 1. 本地：@xenova/transformers (bge-small-zh-v1.5, 512d)
 * 2. 云端：OpenAI / 兼容 API (text-embedding-3-small, 1536d)
 * 
 * 默认使用本地模型（零费用、零延迟），可通过配置切换到云端。
 */

import type { EmbeddingConfig } from '../types'

export interface EmbeddingResult {
  embeddings: number[][]
  dimensions: number
  model: string
  latencyMs: number
}

const DEFAULT_LOCAL_MODEL = 'Xenova/bge-small-zh-v1.5'
const DEFAULT_LOCAL_DIMS = 512
const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small'
const DEFAULT_OPENAI_DIMS = 1536

export class EmbeddingService {
  private config: EmbeddingConfig
  private localPipeline: unknown = null
  private loading: boolean = false
  private loadPromise: Promise<void> | null = null

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      provider: config?.provider ?? 'local',
      model: config?.model ?? DEFAULT_LOCAL_MODEL,
      dimensions: config?.dimensions ?? DEFAULT_LOCAL_DIMS,
      apiKey: config?.apiKey,
    }
  }

  /** 确保本地模型已加载 */
  async ensureLoaded(): Promise<void> {
    if (this.config.provider !== 'local') return
    
    if (this.localPipeline) return
    
    if (this.loadPromise) {
      await this.loadPromise
      return
    }

    this.loading = true
    this.loadPromise = this.loadLocalModel()
    await this.loadPromise
    this.loading = false
  }

  private async loadLocalModel(): Promise<void> {
    try {
      // 动态导入 transformers（避免在无此依赖时崩溃）
      const { pipeline } = await import('@xenova/transformers')
      this.localPipeline = await pipeline('feature-extraction', this.config.model)
      console.log(`[Embedding] Local model loaded: ${this.config.model}`)
    } catch (err) {
      console.error('[Embedding] Failed to load local model:', err)
      throw new Error(
        `Failed to load local embedding model "${this.config.model}". ` +
        `Make sure @xenova/transformers is installed: npm install @xenova/transformers`
      )
    }
  }

  /** 批量生成嵌入向量 */
  async embed(texts: string[]): Promise<EmbeddingResult> {
    const startTime = Date.now()

    if (texts.length === 0) {
      return { embeddings: [], dimensions: this.config.dimensions, model: this.config.model, latencyMs: 0 }
    }

    let embeddings: number[][]

    if (this.config.provider === 'local') {
      await this.ensureLoaded()
      embeddings = await this.embedLocal(texts)
    } else {
      embeddings = await this.embedOpenAI(texts)
    }

    return {
      embeddings,
      dimensions: embeddings[0]?.length ?? this.config.dimensions,
      model: this.config.model,
      latencyMs: Date.now() - startTime,
    }
  }

  /** 生成单个文本的嵌入向量 */
  async embedSingle(text: string): Promise<number[]> {
    const result = await this.embed([text])
    return result.embeddings[0]
  }

  // ─── 本地嵌入 ──────────────────────────────────

  private async embedLocal(texts: string[]): Promise<number[][]> {
    const pipeline = this.localPipeline as {
      (texts: string[], options: { pooling: string; normalize: boolean }): Promise<{ tolist: () => number[][] }>
    }
    const output = await pipeline(texts, { pooling: 'mean', normalize: true })
    return output.tolist()
  }

  // ─── OpenAI 嵌入 ───────────────────────────────

  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const apiKey = this.config.apiKey
    if (!apiKey) {
      throw new Error('OpenAI API key is required for cloud embeddings')
    }

    const baseUrl = process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        dimensions: this.config.dimensions,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI Embeddings API error: ${response.status} ${err}`)
    }

    const data = await response.json() as {
      data: { embedding: number[]; index: number }[]
    }

    // 按 index 排序
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding)
  }

  // ─── 配置 ──────────────────────────────────────

  getConfig(): EmbeddingConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config }
    // 如果切换了 provider 或 model，清除本地 pipeline
    if (config.provider && config.provider !== 'local') {
      this.localPipeline = null
      this.loadPromise = null
    }
  }

  getDimensions(): number {
    return this.config.dimensions
  }
}

// ─── 单例 ────────────────────────────────────────

let embeddingServiceInstance: EmbeddingService | null = null

export function getEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService(config)
  }
  return embeddingServiceInstance
}

export function initEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  embeddingServiceInstance = new EmbeddingService(config)
  return embeddingServiceInstance
}
