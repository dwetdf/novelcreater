/**
 * buildExpansionContext — 桥接 ContextPipeline → ContentExpander
 * 
 * ContentExpander.expandChapter(scenes, context, opts) 的 context 入参是 string。
 * 此函数复用 WarmContextCollector 的全量注入逻辑 + 热层采集，
 * 将上下文拼成纯文本字符串传给 expander。
 */

import { prisma } from '@/lib/db/prisma'
import { warmCollector } from './retriever/warm'
import type { ContextRequest, EntityMatch } from './types'

export async function buildExpansionContext(
  novelId: string,
  chapterId: string,
): Promise<string> {
  const parts: string[] = []

  // 1. 小说元信息
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { title: true, perspective: true, tense: true, genre: true, styleProfile: true },
  })

  if (novel) {
    parts.push(`【小说信息】`)
    parts.push(`书名：《${novel.title}》`)
    const perspectiveMap: Record<string, string> = {
      first: '第一人称', third: '第三人称', omniscient: '第三人称全知视角',
    }
    const tenseMap: Record<string, string> = { past: '过去时', present: '现在时' }
    parts.push(`视角：${perspectiveMap[novel.perspective] ?? novel.perspective}`)
    parts.push(`时态：${tenseMap[novel.tense] ?? novel.tense}`)
    if (novel.styleProfile) parts.push(`风格参考：${novel.styleProfile}`)
    parts.push('')
  }

  // 2. 章节位置信息
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      title: true, summary: true, sortOrder: true,
      volume: { select: { title: true } },
    },
  }) as { title: string; summary: string | null; sortOrder: number; volume: { title: string } | null } | null

  if (chapter) {
    parts.push(`【当前位置】`)
    if (chapter.volume) parts.push(`卷：${chapter.volume.title}`)
    parts.push(`章节：${chapter.title}`)
    if (chapter.summary) parts.push(`概要：${chapter.summary}`)
    parts.push('')
  }

  // 3. 温上下文 — 全量注入角色/地点/势力/世界观（复用 WarmContextCollector）
  const mockReq: ContextRequest = {
    novelId,
    chapterId,
    operation: 'expand',
  }

  // 传入空实体列表，触发全量注入（warm.ts collect 逻辑：无实体匹配时取全部角色）
  const emptyEntities: EntityMatch[] = []
  const warm = await warmCollector.collect(mockReq, emptyEntities)

  // 角色
  if (warm.characterCards.length > 0) {
    parts.push(`【角色设定】`)
    warm.characterCards.forEach(c => {
      parts.push(`${c.name}（${c.identity}）| 性格：${c.traits.join('、')} | 状态：${c.currentState}${c.speechStyle ? ' | 口癖：' + c.speechStyle : ''}`)
    })
    parts.push('')
  }

  // 地点
  if (warm.locationCards.length > 0) {
    parts.push(`【相关地点】`)
    warm.locationCards.forEach(l => parts.push(`${l.name}：${l.description}`))
    parts.push('')
  }

  // 势力
  if ((warm.factions ?? []).length > 0) {
    parts.push(`【势力/组织】`)
    warm.factions!.forEach(f => parts.push(`${f.name}${f.type ? '（' + f.type + '）' : ''}${f.goal ? ' | ' + f.goal : ''}`))
    parts.push('')
  }

  // 世界观规则
  if ((warm.worldRules ?? []).length > 0) {
    parts.push(`【世界观规则】`)
    warm.worldRules!.forEach(r => parts.push(`[${r.category ?? '设定'}] ${r.title}：${r.content.slice(0, 100)}`))
    parts.push('')
  }

  // 4. 前情回顾（近章摘要）
  if (warm.recentSummaries.length > 0) {
    parts.push(`【前情回顾】`)
    warm.recentSummaries.forEach(s => parts.push(`第${s.chapterNumber}章 ${s.chapterTitle}：${s.oneLineSummary}`))
    parts.push('')
  }

  // 5. 伏笔提醒
  if (warm.foreshadowReminders.length > 0) {
    parts.push(`【伏笔提醒】`)
    warm.foreshadowReminders.forEach(f => parts.push(`⚠️ ${f.content}（埋于第${f.plantChapterNumber}章）`))
    parts.push('')
  }

  return parts.join('\n')
}
