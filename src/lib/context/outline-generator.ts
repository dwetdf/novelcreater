/**
 * OutlineGenerator — 大纲生成管线
 * 
 * 多阶段流水线：主题 → 卷结构 → 章大纲 → 节细纲
 * 每个阶段可独立触发，用户可在阶段间编辑调整。
 */

import type { OutlineGenRequest, OutlineNode } from './types'

// ─── 阶段输出类型 ────────────────────────────────

export interface VolumeStructure {
  title: string
  summary: string
  chapters: ChapterOutline[]
}

export interface ChapterOutline {
  title: string
  summary: string           // 1-2句摘要
  keyEvents: string[]       // 关键事件列表
  characters: string[]      // 出场角色名
  targetWords: number
}

export interface SceneDetail {
  title: string
  setting: string           // 场景地点
  characters: string[]      // 出场角色
  conflict: string          // 冲突/目标
  outcome: string           // 结果
  emotionalBeat: string     // 情感节拍
  notes: string             // 补充说明
}

// ─── Prompt 模板 ─────────────────────────────────

const VOLUME_PROMPT = (theme: string, genre: string, length: number) =>
`你是一位专业的小说结构设计师。请根据以下主题生成小说的大纲结构。

【主题】${theme}
【类型】${genre || '未指定'}
【目标总字数】${length.toLocaleString()} 字

请生成 3-5 卷的结构，每卷包含 8-15 章。输出格式严格按以下 JSON：

{
  "volumes": [
    {
      "title": "卷名",
      "summary": "本卷的一句话概要",
      "chapters": [
        {
          "title": "章节标题",
          "summary": "1-2句章节摘要",
          "keyEvents": ["事件1", "事件2"],
          "characters": ["出场角色名"],
          "targetWords": 3000
        }
      ]
    }
  ]
}`

const CHAPTER_DETAIL_PROMPT = (chapter: ChapterOutline, context: string) =>
`你是一位专业的小说写手。请为以下章节生成详细的场景级细纲。

【章节】${chapter.title}
【摘要】${chapter.summary}
【关键事件】${chapter.keyEvents.join('、')}

${context}

请将本章拆分为 3-6 个场景。输出格式严格按以下 JSON：

{
  "scenes": [
    {
      "title": "场景标题",
      "setting": "场景地点和环境描述",
      "characters": ["出场角色"],
      "conflict": "本场景的冲突或角色目标",
      "outcome": "场景结束时的状态变化",
      "emotionalBeat": "本场景的情感基调",
      "notes": "补充说明（伏笔、注意事项等）"
    }
  ]
}`

// ─── 大纲生成器 ──────────────────────────────────

export interface OutlineGeneratorConfig {
  /** 调用 AI 的函数（由外部注入，支持多提供商） */
  callAI: (prompt: string) => Promise<string>
}

export class OutlineGenerator {
  private callAI: (prompt: string) => Promise<string>

  constructor(config: OutlineGeneratorConfig) {
    this.callAI = config.callAI
  }

  /**
   * 阶段1：主题 → 卷+章结构
   */
  async generateVolumeStructure(req: OutlineGenRequest): Promise<VolumeStructure[]> {
    const prompt = VOLUME_PROMPT(req.theme, req.genre ?? '', req.targetLength ?? 300000)
    const response = await this.callAI(prompt)
    return this.parseVolumeResponse(response, req)
  }

  /**
   * 阶段2：章大纲 → 场景级细纲
   */
  async generateSceneDetails(
    chapter: ChapterOutline,
    context: string = '',
  ): Promise<SceneDetail[]> {
    const prompt = CHAPTER_DETAIL_PROMPT(chapter, context)
    const response = await this.callAI(prompt)
    return this.parseSceneResponse(response)
  }

  /**
   * 将生成的结构转换为 OutlineNode 树（用于前端展示）
   */
  toOutlineTree(volumes: VolumeStructure[]): OutlineNode[] {
    let chapterIdx = 0
    return volumes.map((vol, vi) => ({
      id: `vol-${vi}`,
      title: vol.title,
      summary: vol.summary,
      type: 'volume' as const,
      status: 'pending' as const,
      children: vol.chapters.map((ch, ci) => {
        chapterIdx++
        return {
          id: `ch-${chapterIdx}`,
          title: ch.title,
          summary: ch.summary,
          type: 'chapter' as const,
          status: 'pending' as const,
          targetWords: ch.targetWords,
          keyEvents: ch.keyEvents,
          characters: ch.characters,
          children: [],
        }
      }),
    }))
  }

  /**
   * 将场景细纲转为 OutlineNode（可挂载到章节节点下）
   */
  scenesToNodes(scenes: SceneDetail[], chapterId: string): OutlineNode[] {
    return scenes.map((s, i) => ({
      id: `${chapterId}-scene-${i}`,
      title: s.title,
      summary: `${s.setting} | ${s.conflict} → ${s.outcome}`,
      type: 'section' as const,
      status: 'pending' as const,
      children: [],
    }))
  }

  // ─── 响应解析 ──────────────────────────────────

  private parseVolumeResponse(
    response: string,
    req: OutlineGenRequest,
  ): VolumeStructure[] {
    try {
      const json = this.extractJSON(response)
      const parsed = JSON.parse(json)
      if (parsed.volumes && Array.isArray(parsed.volumes)) {
        return parsed.volumes.map((v: Record<string, unknown>) => ({
          title: String(v.title ?? '未命名卷'),
          summary: String(v.summary ?? ''),
          chapters: Array.isArray(v.chapters)
            ? (v.chapters as Array<Record<string, unknown>>).map((c: Record<string, unknown>) => ({
                title: String(c.title ?? '未命名章'),
                summary: String(c.summary ?? ''),
                keyEvents: Array.isArray(c.keyEvents) ? c.keyEvents.map(String) : [],
                characters: Array.isArray(c.characters) ? c.characters.map(String) : [],
                targetWords: Number(c.targetWords) || (req.targetLength ? Math.floor((req.targetLength ?? 300000) / ((v.chapters as unknown[]).length || 10)) : 3000),
              }))
            : [],
        }))
      }
    } catch (e) {
      console.error('[OutlineGenerator] Failed to parse volume response:', e)
    }
    // 兜底：返回最简结构
    return [{
      title: '第一卷',
      summary: '故事开始',
      chapters: [
        { title: '第1章', summary: req.theme, keyEvents: [], characters: [], targetWords: 3000 },
      ],
    }]
  }

  private parseSceneResponse(response: string): SceneDetail[] {
    try {
      const json = this.extractJSON(response)
      const parsed = JSON.parse(json)
      if (parsed.scenes && Array.isArray(parsed.scenes)) {
        return parsed.scenes.map((s: Record<string, unknown>) => ({
          title: String(s.title ?? '未命名场景'),
          setting: String(s.setting ?? ''),
          characters: Array.isArray(s.characters) ? s.characters.map(String) : [],
          conflict: String(s.conflict ?? ''),
          outcome: String(s.outcome ?? ''),
          emotionalBeat: String(s.emotionalBeat ?? ''),
          notes: String(s.notes ?? ''),
        }))
      }
    } catch (e) {
      console.error('[OutlineGenerator] Failed to parse scene response:', e)
    }
    return [{ title: '场景1', setting: '', characters: [], conflict: '', outcome: '', emotionalBeat: '', notes: '' }]
  }

  /** 从 AI 响应中提取 JSON（处理 markdown 代码块包裹） */
  private extractJSON(response: string): string {
    // 尝试提取 ```json ... ``` 块
    const codeBlock = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (codeBlock) return codeBlock[1].trim()
    // 尝试提取 { ... } 
    const brace = response.match(/\{[\s\S]*\}/)
    if (brace) return brace[0]
    return response
  }
}
