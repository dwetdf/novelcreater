/**
 * TextChunker — 文本分块器
 * 
 * 将章节文本切分为适合向量检索的段落级切片。
 * - 目标块大小：800 字 ± 200 字
 * - 相邻块重叠：前一块最后 100 字 = 后一块开头 100 字
 * - 硬上限：1200 字（强制切断）
 * - 优先在段落边界切断
 */

export interface ChunkResult {
  seq: number
  content: string
  startOffset: number
  endOffset: number
  tokenCount: number
}

export interface ChunkerOptions {
  targetSize?: number      // 目标块大小（字数），默认 800
  overlapSize?: number     // 重叠字数，默认 100
  maxSize?: number         // 硬上限，默认 1200
}

const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  targetSize: 800,
  overlapSize: 100,
  maxSize: 1200,
}

/**
 * 将文本切分为重叠的段落级切片
 */
export function chunkText(text: string, options: ChunkerOptions = {}): ChunkResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  if (!text || text.trim().length === 0) return []

  // Step 1: 按段落拆分
  const paragraphs = splitParagraphs(text)
  
  // Step 2: 按目标大小组装切片
  const chunks: ChunkResult[] = []
  let currentChunk = ''
  let currentStart = 0
  let seq = 0
  let offset = 0

  for (const para of paragraphs) {
    const paraLen = countChineseChars(para)

    // 如果单个段落就超过硬上限，强制切分
    if (paraLen > opts.maxSize) {
      // 先保存当前积累的切片
      if (currentChunk) {
        chunks.push(buildChunk(seq++, currentChunk, currentStart, offset, opts))
        currentChunk = ''
      }
      // 强制切分长段落
      const subChunks = forceSplitLongParagraph(para, opts, offset)
      for (const sc of subChunks) {
        chunks.push({ ...sc, seq: seq++ })
      }
      offset += para.length
      currentStart = offset
      continue
    }

    // 如果加入当前段落会超过目标大小，保存当前切片
    const currentLen = countChineseChars(currentChunk)
    if (currentLen > 0 && currentLen + paraLen > opts.targetSize) {
      chunks.push(buildChunk(seq++, currentChunk, currentStart, offset, opts))
      // 重叠：新切片从当前切片尾部开始
      const overlapText = extractOverlap(currentChunk, opts.overlapSize)
      currentChunk = overlapText
      currentStart = offset - overlapText.length
    }

    if (!currentChunk) {
      currentStart = offset
    }
    currentChunk += (currentChunk ? '\n\n' : '') + para
    offset += (currentChunk ? 2 : 0) + para.length // 2 for \n\n
  }

  // 保存最后一个切片
  if (currentChunk.trim()) {
    chunks.push(buildChunk(seq++, currentChunk, currentStart, text.length, opts))
  }

  return chunks
}

/**
 * 按段落拆分（识别空行、换行）
 */
function splitParagraphs(text: string): string[] {
  // 按双换行拆分（最常见的中文段落分隔）
  const raw = text.split(/\n\s*\n/)
  // 过滤空段落，合并过短的单行段落
  const merged: string[] = []
  for (const para of raw) {
    const trimmed = para.trim()
    if (!trimmed) continue
    // 如果当前段落很短且上一段也很短，合并
    if (merged.length > 0 && countChineseChars(trimmed) < 50) {
      merged[merged.length - 1] += '\n' + trimmed
    } else {
      merged.push(trimmed)
    }
  }
  return merged
}

/**
 * 强制切分过长段落（超过硬上限）
 */
function forceSplitLongParagraph(
  text: string,
  opts: Required<ChunkerOptions>,
  baseOffset: number,
): Omit<ChunkResult, 'seq'>[] {
  const chunks: Omit<ChunkResult, 'seq'>[] = []
  let remaining = text
  let off = baseOffset

  while (countChineseChars(remaining) > opts.maxSize) {
    // 尝试在句子边界切断
    const splitPoint = findBestSplitPoint(remaining, opts.maxSize)
    const chunk = remaining.slice(0, splitPoint)
    chunks.push({
      content: chunk,
      startOffset: off,
      endOffset: off + splitPoint,
      tokenCount: estimateTokens(chunk),
    })
    off += splitPoint
    remaining = remaining.slice(splitPoint)
  }

  if (remaining.trim()) {
    chunks.push({
      content: remaining,
      startOffset: off,
      endOffset: off + remaining.length,
      tokenCount: estimateTokens(remaining),
    })
  }

  return chunks
}

/**
 * 找到最佳切分点（优先在句号、问号、感叹号后）
 */
function findBestSplitPoint(text: string, maxLen: number): number {
  // 在 maxLen 附近找句子边界
  const searchStart = Math.floor(maxLen * 0.7)
  const searchEnd = Math.min(maxLen, text.length)
  const sentenceBreaks = /[。！？；\n]/

  // 从 maxLen 向前搜索
  for (let i = searchEnd; i >= searchStart; i--) {
    if (sentenceBreaks.test(text[i])) {
      return i + 1 // 包含标点
    }
  }
  // 退而求其次：找逗号
  for (let i = searchEnd; i >= searchStart; i--) {
    if (text[i] === '，' || text[i] === '、') {
      return i + 1
    }
  }
  // 否则在 maxLen 处硬切
  return searchEnd
}

/**
 * 从文本尾部提取重叠部分（保持完整句子）
 */
function extractOverlap(text: string, overlapSize: number): string {
  if (countChineseChars(text) <= overlapSize) return text
  
  // 从尾部取 overlapSize 字，向前扩展到句子边界
  const tail = text.slice(-Math.floor(overlapSize * 2))
  const sentenceBreaks = /[。！？\n]/
  
  // 找到第一个句子边界
  for (let i = 0; i < tail.length; i++) {
    if (sentenceBreaks.test(tail[i]) && i > overlapSize * 0.3) {
      return tail.slice(i + 1)
    }
  }
  return tail.slice(-Math.floor(overlapSize * 1.5))
}

function buildChunk(
  seq: number,
  content: string,
  startOffset: number,
  endOffset: number,
  opts: Required<ChunkerOptions>,
): ChunkResult {
  return {
    seq,
    content: content.trim(),
    startOffset,
    endOffset,
    tokenCount: estimateTokens(content),
  }
}

/** 估算中文字数（中文字符计1，英文单词计1） */
export function countChineseChars(text: string): number {
  let count = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      count += 1
    } else if (/[a-zA-Z0-9]/.test(char)) {
      // 英文单词粗略估算：每5个字符≈1个token
      count += 0.2
    }
  }
  return Math.round(count)
}

/** 估算 token 数量（粗略：中文1字≈1.5 token，英文1词≈1.3 token） */
export function estimateTokens(text: string): number {
  let tokens = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      tokens += 1.5
    } else if (/[a-zA-Z]/.test(char)) {
      tokens += 0.25
    } else {
      tokens += 0.5
    }
  }
  return Math.ceil(tokens)
}
