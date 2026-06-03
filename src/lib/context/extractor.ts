/**
 * extractor.ts — 章节内容抽取器
 * 
 * 章节展开/保存后，从正文中结构化抽取：
 * - extractStateSnapshots: 每个出场角色的状态变化 → stateRepo.create
 * - extractForeshadowings: 识别新埋伏笔 → foreshadowRepo.create
 */

import { prisma } from '@/lib/db/prisma'
import { stateRepo } from './storage/state-repo'
import { foreshadowRepo } from './storage/foreshadow-repo'
import { callAISingle } from '@/lib/ai/call'

// ─── 角色状态快照 ─────────────────────────────────

export interface StateSnapshotResult {
  snapshots: Array<{
    characterName: string
    state: string
    location?: string
    alive: boolean
    summary?: string
  }>
  raw: string
}

export async function extractStateSnapshots(
  novelId: string,
  chapterId: string,
): Promise<{ created: number; skipped: number }> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId, novelId },
    select: { title: true, content: true },
  })
  if (!chapter?.content) return { created: 0, skipped: 0 }

  const plainText = chapter.content.replace(/<[^>]*>/g, '').trim().slice(0, 3000)

  // 获取角色列表用于匹配
  const characters = await prisma.character.findMany({
    where: { novelId },
    select: { id: true, name: true },
  }) as { id: string; name: string }[]

  if (characters.length === 0) return { created: 0, skipped: 0 }

  const charNames = characters.map((c) => c.name).join('、')

  const prompt = `你是一位小说分析专家。请从以下章节内容中，提取每位出场角色的状态变化。

【本章标题】${chapter.title}
【出场角色】${charNames}

【章节内容（前3000字）】
${plainText}

请以 JSON 格式返回（只输出 JSON）：
{
  "snapshots": [
    {
      "characterName": "角色名（必须从上列出場角色中選取）",
      "state": "状态描述，如'受伤昏迷，被带回宗门'",
      "location": "当前所在地点（可选）",
      "alive": true,
      "summary": "更详细的状态说明（可选）"
    }
  ]
}

只提取本章中有明确出场或状态变化的角色。没有变化的角色不要列入。`

  try {
    const response = await callAISingle(prompt, {
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: 2000,
    })

    const parsed = parseJson<{ snapshots?: StateSnapshotResult['snapshots'] }>(response)
    const snapshots = parsed?.snapshots || []

    let created = 0
    for (const snap of snapshots) {
      // 通过角色名匹配 characterId
      const char = characters.find(
        (c) => c.name === snap.characterName || c.name.includes(snap.characterName),
      )
      if (!char) continue

      await stateRepo.create({
        characterId: char.id,
        chapterId,
        novelId,
        state: snap.state || '状态未知',
        location: snap.location,
        alive: snap.alive !== false,
        summary: snap.summary,
      })
      created++
    }

    return { created, skipped: snapshots.length - created }
  } catch (err) {
    console.error('[Extractor] State snapshot extraction failed:', err)
    return { created: 0, skipped: 0 }
  }
}

// ─── 伏笔抽取 ────────────────────────────────────

export async function extractForeshadowings(
  novelId: string,
  chapterId: string,
): Promise<{ created: number }> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId, novelId },
    select: { title: true, content: true },
  })
  if (!chapter?.content) return { created: 0 }

  const plainText = chapter.content.replace(/<[^>]*>/g, '').trim().slice(0, 3000)

  const prompt = `你是一位小说分析专家。请从以下章节内容中，识别作者新埋设的伏笔。

【章节标题】${chapter.title}

【章节内容（前3000字）】
${plainText}

伏笔是指：作者有意埋下、后续章节会回收的情节线索。可能的形式包括：
- 一个未解释的异常现象
- 角色的秘密或隐藏身份
- 一件看似普通但后续会重要的物品
- 一句有深意的对话
- 一个未完成的约定或承诺

请以 JSON 格式返回（只输出 JSON）：
{
  "foreshadowings": [
    {
      "content": "伏笔内容描述",
      "type": "item|identity|dialogue|event|other",
      "plantPosition": "第X段",
      "notes": "补充说明"
    }
  ]
}

如果没有明显的新伏笔，返回空数组。只提取本章新埋设的，不要提取前文已埋设的。`

  try {
    const response = await callAISingle(prompt, {
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 1000,
    })

    const parsed = parseJson<{
      foreshadowings?: Array<{
        content: string; type?: string; plantPosition?: string; notes?: string
      }>
    }>(response)

    const items = parsed?.foreshadowings || []
    let created = 0

    for (const item of items) {
      if (!item.content) continue
      await foreshadowRepo.create({
        novelId,
        plantChapterId: chapterId,
        content: item.content,
        type: item.type || 'other',
        plantPosition: item.plantPosition,
        notes: item.notes,
      })
      created++
    }

    return { created }
  } catch (err) {
    console.error('[Extractor] Foreshadowing extraction failed:', err)
    return { created: 0 }
  }
}

// ─── 工具 ────────────────────────────────────────

function parseJson<T>(text: string): T | null {
  try {
    const json = text.match(/\{[\s\S]*\}/)
    return json ? JSON.parse(json[0]) : null
  } catch {
    return null
  }
}
