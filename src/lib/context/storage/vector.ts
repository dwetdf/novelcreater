import Database from 'better-sqlite3'
import path from 'path'

/**
 * VectorStore — 纯 JS 向量存储
 * 
 * 使用 better-sqlite3 存储向量 BLOB，余弦相似度在 JS 中计算。
 * 不依赖 sqlite-vec 扩展（避免 Turbopack 下加载失败）。
 * 
 * 对于 5K-10K 向量的长篇小说，暴力搜索 <10ms，足够使用。
 */

export interface VecSearchResult {
  id: string
  distance: number
}

export class VectorStore {
  private db: Database.Database
  private initialized = false

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.resolve(process.cwd(), 'dev.db')
    this.db = new Database(resolvedPath)
    this.db.pragma('journal_mode = WAL')
  }

  /** 确保元数据表和 BLOB 向量表存在（幂等） */
  ensureTable(tableName: string, dimensions: number): void {
    const metaKey = `${tableName}_dims`
    // 元数据：记录维度
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vec_meta (
        table_name TEXT PRIMARY KEY,
        dimensions INTEGER NOT NULL
      )
    `)
    this.db.prepare(`
      INSERT OR REPLACE INTO vec_meta (table_name, dimensions) VALUES (?, ?)
    `).run(metaKey, dimensions)

    // 向量表：id + BLOB
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL
      )
    `)

    // 如果维度变化，清空旧数据
    const row = this.db.prepare(
      `SELECT dimensions FROM vec_meta WHERE table_name = ?`
    ).get(metaKey) as { dimensions: number } | undefined

    if (row && row.dimensions !== dimensions) {
      this.db.exec(`DELETE FROM ${tableName}`)
      this.db.prepare(`UPDATE vec_meta SET dimensions = ? WHERE table_name = ?`).run(dimensions, metaKey)
    }

    this.initialized = true
  }

  /** 获取表的维度 */
  getDimensions(tableName: string): number {
    const metaKey = `${tableName}_dims`
    const row = this.db.prepare(
      `SELECT dimensions FROM vec_meta WHERE table_name = ?`
    ).get(metaKey) as { dimensions: number } | undefined
    return row?.dimensions ?? 512
  }

  // ─── CRUD ───────────────────────────────────────

  /** 批量插入向量 */
  insert(table: string, items: { id: string; embedding: number[] }[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${table} (id, embedding) VALUES (?, ?)
    `)
    const tx = this.db.transaction(() => {
      for (const item of items) {
        stmt.run(item.id, Buffer.from(new Float32Array(item.embedding).buffer))
      }
    })
    tx()
  }

  /** 插入单条 */
  insertOne(table: string, id: string, embedding: number[]): void {
    this.insert(table, [{ id, embedding }])
  }

  /** 按 ID 删除 */
  deleteByIds(table: string, ids: string[]): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids)
  }

  /** 清空表 */
  deleteAll(table: string): void {
    this.db.exec(`DELETE FROM ${table}`)
  }

  // ─── 搜索 ───────────────────────────────────────

  /**
   * 余弦相似度搜索
   * 全量加载向量到内存，纯 JS 计算（5K 向量 ~10ms，10K 向量 ~20ms）
   */
  search(
    table: string,
    queryEmbedding: number[],
    topK: number = 5,
  ): VecSearchResult[] {
    // 加载所有向量
    const rows = this.db.prepare(
      `SELECT id, embedding FROM ${table}`
    ).all() as { id: string; embedding: Buffer }[]

    if (rows.length === 0) return []

    // 归一化查询向量
    const queryNorm = normalize(queryEmbedding)
    if (!queryNorm) return []

    // 计算余弦相似度
    const results: VecSearchResult[] = []

    for (const row of rows) {
      const vec = bufferToF32(row.embedding)
      if (vec.length !== queryNorm.length) continue

      const similarity = cosineSimilarity(queryNorm, vec)
      results.push({ id: row.id, distance: 1 - similarity })
    }

    // 按距离升序（越小越相似），取 top-K
    return results
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK)
  }

  // ─── 统计 ───────────────────────────────────────

  count(table: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }
    return row.cnt
  }

  // ─── 生命周期 ──────────────────────────────────

  close(): void {
    this.db.close()
  }

  getDb(): Database.Database {
    return this.db
  }
}

// ─── 单例工厂 ────────────────────────────────────

let vectorStoreInstance: VectorStore | null = null

export function getVectorStore(dbPath?: string): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(dbPath)
  }
  return vectorStoreInstance
}

export function initVectorStore(dbPath: string): VectorStore {
  if (vectorStoreInstance) vectorStoreInstance.close()
  vectorStoreInstance = new VectorStore(dbPath)
  return vectorStoreInstance
}

// ─── 数学工具 ────────────────────────────────────

function normalize(vec: number[]): number[] | null {
  let sumSq = 0
  for (const v of vec) sumSq += v * v
  const len = Math.sqrt(sumSq)
  if (len === 0) return null
  return vec.map((v) => v / len)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function bufferToF32(buf: Buffer): number[] {
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
  return Array.from(arr)
}
