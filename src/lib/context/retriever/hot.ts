/**
 * HotContextCollector — 热上下文采集
 * 
 * 每次 AI 调用必定附带的基础上下文：
 * - 前文滑动窗口
 * - 后文（仅润色/扩写）
 * - 大纲位置
 * - 小说元信息
 */

import { prisma } from '@/lib/db/prisma'
import type { ContextRequest } from '../types'
import type { ChapterSibling, ChapterWithVolume } from '../types-prisma'

export interface HotContext {
  preContext: string
  postContext: string
  outlinePosition: string
  novelMeta: string
}

export class HotContextCollector {
  /**
   * 采集热上下文
   */
  async collect(req: ContextRequest): Promise<HotContext> {
    const [preContext, postContext, outlinePosition, novelMeta] = await Promise.all([
      this.collectPreContext(req),
      this.collectPostContext(req),
      this.collectOutlinePosition(req),
      this.collectNovelMeta(req.novelId),
    ])

    return { preContext, postContext, outlinePosition, novelMeta }
  }

  /**
   * 前文滑动窗口 — 取光标前 N 字
   */
  private async collectPreContext(req: ContextRequest): Promise<string> {
    const windowSize = req.options?.hotWindowSize ?? 2000

    if (req.operation === 'brainstorm' && !req.selectedText) {
      return '' // 头脑风暴不需要前文
    }

    // 如果提供了 selectedText（润色场景），取 selectedText 前的内容
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.chapterId },
      select: { content: true },
    })
    if (!chapter?.content) return ''

    const cursor = req.cursorPosition ?? chapter.content.length
    const start = Math.max(0, cursor - windowSize)
    let preText = chapter.content.slice(start, cursor)

    // 调整到最近的段落边界（向前找最近的换行）
    if (start > 0) {
      const firstNewline = preText.indexOf('\n')
      if (firstNewline > 0 && firstNewline < 100) {
        preText = preText.slice(firstNewline + 1)
      }
    }

    if (!preText.trim()) return ''

    return `【前文】\n${preText.trim()}`
  }

  /**
   * 后文 — 仅润色/扩写时取光标后 M 字
   */
  private async collectPostContext(req: ContextRequest): Promise<string> {
    if (!['polish', 'expand'].includes(req.operation)) return ''
    if (!req.cursorPosition) return ''

    const windowSize = 300
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.chapterId },
      select: { content: true },
    })
    if (!chapter?.content) return ''

    const end = Math.min(chapter.content.length, req.cursorPosition + windowSize)
    const postText = chapter.content.slice(req.cursorPosition, end)

    if (!postText.trim()) return ''

    return `【后文】\n${postText.trim()}`
  }

  /**
   * 大纲位置 — 当前章节在小说中的位置
   */
  private async collectOutlinePosition(req: ContextRequest): Promise<string> {
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.chapterId },
      select: {
        title: true,
        summary: true,
        sortOrder: true,
        volume: { select: { title: true } },
        parent: { select: { title: true, summary: true } },
      },
    }) as ChapterWithVolume | null

    if (!chapter) return ''

    const parts: string[] = []

    if (chapter.volume) {
      parts.push(`卷：${chapter.volume.title}`)
    }
    parts.push(`第${chapter.sortOrder}章：${chapter.title}`)

    if (chapter.summary) {
      parts.push(`本章概要：${chapter.summary}`)
    }
    if (chapter.parent) {
      parts.push(`所属节点：${chapter.parent.title}`)
      if (chapter.parent.summary) {
        parts.push(`节点概要：${chapter.parent.summary}`)
      }
    }

    // 获取前后章节概览（兄弟节点）
    const siblings = await this.getSiblingOverview(req.chapterId, req.novelId, chapter.sortOrder)
    if (siblings) {
      parts.push(siblings)
    }

    return `【当前位置】\n${parts.join('\n')}`
  }

  /**
   * 兄弟节点概览
   */
  private async getSiblingOverview(chapterId: string, novelId: string, sortOrder: number): Promise<string> {
    const siblings = await prisma.chapter.findMany({
      where: {
        novelId,
        sortOrder: {
          gte: Math.max(1, sortOrder - 2),
          lte: sortOrder + 2,
        },
        id: { not: chapterId },
      },
      orderBy: { sortOrder: 'asc' },
      select: { title: true, sortOrder: true, summary: true },
      take: 5,
    }) as ChapterSibling[]

    if (siblings.length === 0) return ''

    const lines = siblings.map((s) => {
      const marker = s.sortOrder < sortOrder ? '←' : '→'
      const summary = s.summary ? ` — ${s.summary}` : ''
      return `${marker} 第${s.sortOrder}章 ${s.title}${summary}`
    })

    return `邻近章节：\n${lines.join('\n')}`
  }

  /**
   * 小说元信息 — 视角、时态、风格
   */
  private async collectNovelMeta(novelId: string): Promise<string> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        perspective: true,
        tense: true,
        genre: true,
        styleProfile: true,
      },
    })

    if (!novel) return ''

    const perspectiveMap: Record<string, string> = {
      first: '第一人称',
      third: '第三人称',
      omniscient: '第三人称全知视角',
    }
    const tenseMap: Record<string, string> = {
      past: '过去时',
      present: '现在时',
    }

    const parts = [
      `书名：《${novel.title}》`,
      `视角：${perspectiveMap[novel.perspective] ?? novel.perspective}`,
      `时态：${tenseMap[novel.tense] ?? novel.tense}`,
    ]

    if (novel.genre) {
      try {
        const genres = JSON.parse(novel.genre)
        if (Array.isArray(genres) && genres.length > 0) {
          parts.push(`类型：${genres.join('、')}`)
        }
      } catch { /* ignore */ }
    }

    if (novel.styleProfile) {
      parts.push(`风格参考：${novel.styleProfile}`)
    }

    return `【小说信息】\n${parts.join('\n')}`
  }
}

export const hotCollector = new HotContextCollector()
