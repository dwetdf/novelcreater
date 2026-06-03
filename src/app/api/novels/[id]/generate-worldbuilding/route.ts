/**
 * 世界观 & 角色自动生成 API
 * 
 * POST /api/novels/[id]/generate-worldbuilding
 * Body: { theme?, instruction? }
 * 
 * 基于小说主题和类型，AI 生成：
 * - 角色卡（男主/女主/反派/配角/NPC）
 * - 势力/组织
 * - 世界观规则
 * 
 * 返回结构化数据供前端预览，用户确认后逐条写入 DB。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { callAISingle } from '@/lib/ai/call'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: novelId } = await params

  try {
    const body = await req.json() as { theme?: string; instruction?: string }

    // 获取小说基础信息
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { title: true, subtitle: true, genre: true, perspective: true },
    })

    if (!novel) {
      return NextResponse.json({ error: '小说不存在' }, { status: 404 })
    }

    // 获取已有的角色和世界观（避免重复生成）
    const [existingChars, existingFactions, existingRules] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true },
      }),
      prisma.faction.findMany({
        where: { novelId },
        select: { name: true },
      }),
      prisma.worldRule.findMany({
        where: { novelId },
        select: { title: true },
      }),
    ]) as [
      { name: string; role: string | null }[],
      { name: string }[],
      { title: string }[],
    ]

    const existingNames = [
      ...existingChars.map(c => c.name),
      ...existingFactions.map(f => f.name),
      ...existingRules.map(r => r.title),
    ]

    const theme = body.theme || novel.subtitle || novel.title
    const instruction = body.instruction || ''

    const prompt = `你是一位专业的小说世界观设计师和角色设计师。请根据以下信息，为小说创建设定。

【书名】${novel.title}
【类型】${novel.genre ? safeJsonParse(novel.genre) : '未指定'}
【主题/简介】${theme}
${instruction ? `【额外要求】${instruction}` : ''}
${existingNames.length > 0 ? `【已有设定（不要重复创建）】${existingNames.join('、')}` : ''}

请以 JSON 格式返回（只输出 JSON，不要加其他文字）：
{
  "characters": [
    {
      "name": "角色名",
      "role": "主角|女主|反派|男配|女配|路人|NPC",
      "gender": "男|女|其他",
      "age": "年龄描述",
      "personality": "性格特征（逗号分隔）",
      "appearance": "外貌描写",
      "background": "背景故事",
      "motivation": "动机/目标",
      "weakness": "弱点",
      "catchphrase": "口头禅（可选）",
      "abilities": "特殊能力（可选）"
    }
  ],
  "factions": [
    {
      "name": "势力名称",
      "type": "宗门|国家|商会|家族|组织|其他",
      "leaderName": "首领名称",
      "goal": "宗旨/目标",
      "description": "势力描述"
    }
  ],
  "worldRules": [
    {
      "title": "规则标题",
      "category": "修炼体系|魔法系统|科技水平|社会制度|种族设定|其他",
      "content": "规则详细描述"
    }
  ]
}

要求：
- 角色4-8个（至少包含1个主角、1个反派）
- 势力2-4个
- 世界观规则3-6条
- 名称要有特色，避免"张三"、"李四"等平淡名字
- 设定要符合${novel.genre ? safeJsonParse(novel.genre) + '类型' : '小说类型'}的特点`

    const response = await callAISingle(prompt, {
      responseFormat: 'json',
      temperature: 0.8,
      maxTokens: 6000,
    })

    let parsed: {
      characters?: Array<Record<string, string>>
      factions?: Array<Record<string, string>>
      worldRules?: Array<Record<string, string>>
    } = {}

    try {
      const json = response.match(/\{[\s\S]*\}/)
      if (json) parsed = JSON.parse(json[0])
    } catch {
      return NextResponse.json({
        error: 'AI 返回格式无法解析',
        raw: response.slice(0, 500),
      }, { status: 422 })
    }

    return NextResponse.json({
      characters: parsed.characters || [],
      factions: parsed.factions || [],
      worldRules: parsed.worldRules || [],
      existingCounts: {
        characters: existingChars.length,
        factions: existingFactions.length,
        rules: existingRules.length,
      },
    })
  } catch (err) {
    console.error('[WorldBuilding] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function safeJsonParse(s: string): string {
  try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr.join('、') : s } catch { return s }
}
