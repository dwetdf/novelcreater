/**
 * PromptBuilder — Prompt 组装器
 * 
 * 根据操作类型选择模板，将上下文变量插值到模板中。
 * 支持内置模板 + 用户自定义模板。
 */

import type { PromptTemplate, AssembledContext, ContextRequest, ContextCollector } from '../types'

// ─── 变量插值 ────────────────────────────────────

interface TemplateVariables {
  [key: string]: string | undefined
  novelTitle?: string
  perspectiveRule?: string
  tenseRule?: string
  styleRule?: string
  hotContext?: string
  warmContext?: string
  coldContext?: string
  preContext?: string
  selectedText?: string
  outlinePosition?: string
  characters?: string
  locationCards?: string
  recentSummary?: string
  foreshadowReminder?: string
  retrievedChunks?: string
  factions?: string
  worldRules?: string
  polishDirection?: string
  polishSpecificRule?: string
  userInstruction?: string
  targetWords?: string
  includeDialogue?: string
}

export class PromptBuilder {
  private templates: Map<string, PromptTemplate> = new Map()

  constructor() {
    this.registerBuiltinTemplates()
  }

  // ─── 模板注册 ──────────────────────────────────

  register(template: PromptTemplate): void {
    this.templates.set(template.id, template)
  }

  getByOperation(operation: string): PromptTemplate[] {
    return Array.from(this.templates.values()).filter(
      (t) => t.operation === operation && t.isBuiltin,
    )
  }

  getDefault(operation: string): PromptTemplate | undefined {
    return Array.from(this.templates.values()).find(
      (t) => t.operation === operation && t.isDefault,
    )
  }

  // ─── 系统提示词组装 ────────────────────────────

  buildSystemPrompt(
    req: ContextRequest,
    collector: ContextCollector,
    template?: PromptTemplate,
  ): string {
    const tmpl = template ?? this.getDefault(req.operation)
    if (!tmpl) return this.buildFallbackSystemPrompt(collector)

    const vars = this.extractVariables(req, collector)
    return this.interpolate(tmpl.template, vars)
  }

  /** 构建用户消息（用于特定操作） */
  buildUserMessage(req: ContextRequest, collector: ContextCollector): string {
    switch (req.operation) {
      case 'polish':
        if (req.selectedText) {
          const direction = req.userInstruction ?? '更生动流畅'
          return `请对以下文本进行润色，方向：${direction}。\n\n只润色下面这段文字，保持原意和情节不变：\n\n【待润色文本】\n${req.selectedText}\n\n请直接输出润色后的文本，不要加任何解释。`
        }
        return '请对文本进行润色。'

      case 'expand':
        if (req.selectedText) {
          return `请将以下内容扩展为更详细、更生动的段落。保持与前后文一致的风格。\n\n【待扩展内容】\n${req.selectedText}\n\n请直接输出扩展后的文本，不要加任何解释。`
        }
        return '请扩展内容。'

      case 'expand':
        if (req.selectedText) {
          const words = req.userInstruction ? `，大约${req.userInstruction}字` : ''
          return `请将以下大纲点扩展为完整的小说段落内容${words}。\n\n【大纲点】\n${req.selectedText}`
        }
        return '请扩展内容。'

      case 'brainstorm':
        return req.userInstruction ?? '请提供创意建议。'

      case 'custom':
        return req.userInstruction ?? ''

      case 'continue':
      default:
        return '请继续写作。'
    }
  }

  // ─── 变量提取 ──────────────────────────────────

  private extractVariables(
    req: ContextRequest,
    collector: ContextCollector,
  ): TemplateVariables {
    // 视角规则
    const perspectiveMap: Record<string, string> = {
      first: '使用第一人称"我"进行写作。',
      third: '使用第三人称进行写作。',
      omniscient: '使用第三人称全知视角进行写作，可以描写任何人物的内心活动。',
    }

    // 时态规则
    const tenseMap: Record<string, string> = {
      past: '使用过去时态。',
      present: '使用现在时态。',
    }

    // 格式化角色卡片
    const characters = collector.warm.characterCards
      .map((c) => {
        const parts = [`- ${c.name}（${c.identity}）`]
        if (c.traits.length > 0) parts.push(`  性格：${c.traits.join('、')}`)
        parts.push(`  当前状态：${c.currentState}`)
        if (c.speechStyle) parts.push(`  说话风格：${c.speechStyle}`)
        return parts.join('\n')
      })
      .join('\n')

    // 格式化地点
    const locationCards = collector.warm.locationCards
      .map((l) => `- ${l.name}：${l.description}`)
      .join('\n')

    // 格式化近章摘要
    const recentSummary = collector.warm.recentSummaries
      .map((s) => `- 第${s.chapterNumber}章 ${s.chapterTitle}：${s.oneLineSummary}`)
      .join('\n')

    // 格式化伏笔
    const foreshadowReminder = collector.warm.foreshadowReminders
      .map((f) => `⚠️ ${f.content}（埋于第${f.plantChapterNumber}章 ${f.plantChapterTitle}）`)
      .join('\n')

    // 格式化检索结果
    const retrievedChunks = collector.cold.retrievedChunks
      .map((c) => `[Ch.${c.chapterNumber} ${c.chapterTitle}] ${c.content.slice(0, 400)}`)
      .join('\n\n')

    // 格式化势力
    const factions = (collector.warm.factions ?? []).map((f) =>
      `- ${f.name}${f.type ? `（${f.type}）` : ''}${f.goal ? ` | 目标：${f.goal}` : ''}${f.description ? ` | ${f.description.slice(0, 60)}` : ''}`
    ).join('\n')

    // 格式化世界观规则
    const worldRules = (collector.warm.worldRules ?? []).map((r) =>
      `- [${r.category ?? '设定'}] ${r.title}：${r.content.slice(0, 100)}`
    ).join('\n')

    return {
      preContext: collector.hot.preContext,
      selectedText: req.selectedText,
      outlinePosition: collector.hot.outlinePosition,
      characters: characters || '(无)',
      locationCards: locationCards || '(无)',
      recentSummary: recentSummary || '(无)',
      foreshadowReminder: foreshadowReminder || '(无)',
      retrievedChunks: retrievedChunks || '(无)',
      factions: factions || '(无)',
      worldRules: worldRules || '(无)',
      userInstruction: req.userInstruction,
      hotContext: this.assembleHotContext(collector),
      warmContext: this.assembleWarmContext(collector),
      coldContext: this.assembleColdContext(collector),
    }
  }

  private assembleHotContext(collector: ContextCollector): string {
    return [
      collector.hot.novelMeta,
      collector.hot.outlinePosition,
      collector.hot.preContext,
      collector.hot.postContext,
    ].filter(Boolean).join('\n\n')
  }

  private assembleWarmContext(collector: ContextCollector): string {
    const parts: string[] = []

    if (collector.warm.characterCards.length > 0) {
      const cards = collector.warm.characterCards.map((c) =>
        `[${c.name}] ${c.identity} | ${c.traits.join('、')} | 状态：${c.currentState}${c.speechStyle ? ` | 口癖：${c.speechStyle}` : ''}`
      )
      parts.push('【出场角色】\n' + cards.join('\n'))
    }

    if (collector.warm.locationCards.length > 0) {
      const locs = collector.warm.locationCards.map((l) => `[${l.name}] ${l.description}`)
      parts.push('【相关场景】\n' + locs.join('\n'))
    }

    if (collector.warm.recentSummaries.length > 0) {
      const lines = collector.warm.recentSummaries.map((s) =>
        `- Ch.${s.chapterNumber} ${s.chapterTitle}：${s.oneLineSummary}`
      )
      parts.push('【前情回顾】\n' + lines.join('\n'))
    }

    if (collector.warm.foreshadowReminders.length > 0) {
      const lines = collector.warm.foreshadowReminders.map((f) =>
        `⚠️ ${f.content}（第${f.plantChapterNumber}章 ${f.plantChapterTitle}）`
      )
      parts.push('【伏笔提醒】\n' + lines.join('\n'))
    }

    return parts.join('\n\n')
  }

  private assembleColdContext(collector: ContextCollector): string {
    if (collector.cold.retrievedChunks.length === 0) return ''

    const lines = collector.cold.retrievedChunks.map((c) =>
      `[Ch.${c.chapterNumber} ${c.chapterTitle}] ${c.content.slice(0, 300)}`
    )
    return '【历史相关内容】\n' + lines.join('\n\n')
  }

  // ─── 模板插值 ──────────────────────────────────

  private interpolate(template: string, vars: Record<string, string | undefined>): string {
    let result = template
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{${key}}`
      result = result.replaceAll(placeholder, value ?? '')
    }
    // 清理未替换的占位符
    result = result.replace(/\{[a-zA-Z]+\}/g, '')
    // 清理多余空行
    result = result.replace(/\n{3,}/g, '\n\n')
    return result.trim()
  }

  // ─── 兜底系统提示词 ────────────────────────────

  private buildFallbackSystemPrompt(collector: ContextCollector): string {
    const parts = [
      '你是一位专业的小说写手，正在协助创作。',
      '',
      collector.hot.novelMeta,
      collector.hot.outlinePosition,
      collector.hot.preContext,
    ]

    if (collector.warm.characterCards.length > 0) {
      parts.push('【角色设定】')
      for (const c of collector.warm.characterCards) {
        parts.push(`${c.name}：${c.identity}，${c.traits.join('、')}，${c.currentState}`)
      }
    }

    parts.push('', '请根据以上上下文继续写作。保持文风、视角和人物性格一致。')

    return parts.filter(Boolean).join('\n')
  }

  // ─── 内置模板注册 ──────────────────────────────

  private registerBuiltinTemplates(): void {
    const builtins: PromptTemplate[] = [
      {
        id: 'builtin-continue',
        name: '续写-标准',
        type: 'system',
        operation: 'continue',
        template: `你是一位专业的小说写手，正在协助创作。

{novelTitle}
{perspectiveRule}
{tenseRule}

【以下是已写内容 — 仅作上下文参考，请从结尾处继续，不要重复】
{preContext}

{outlinePosition}

{characters}

{recentSummary}

{foreshadowReminder}

{retrievedChunks}

请从已写内容的最后一句话之后继续写作。重要规则：
1. 严格从结束处接着写，不要复述或重写已有内容
2. 每个自然段之间用空行分隔（即两个换行）
3. 对话单独成段，不同角色的对话分不同段落
4. 保持一致的文风、视角和时态
5. 推进情节发展，避免无意义的水文
6. 对话要符合各角色的性格和说话方式`,
        variables: ['novelTitle', 'perspectiveRule', 'tenseRule', 'preContext', 'outlinePosition', 'characters', 'recentSummary', 'foreshadowReminder', 'retrievedChunks'],
        isBuiltin: true,
        isDefault: true,
      },
      {
        id: 'builtin-polish',
        name: '润色-标准',
        type: 'system',
        operation: 'polish',
        template: `你是一位专业的文字编辑，正在润色小说片段。

{preContext}

{outlinePosition}

{characters}

请对用户提供的待润色文本进行修改。要求：
1. 保持原意不变，不要改变情节和人物行为
2. 修正语病、不通顺的表达和错别字
3. 增强语言的表现力和画面感
4. 保持与前后文一致的文风和视角
5. 对话要符合角色性格`,
        variables: ['preContext', 'outlinePosition', 'characters'],
        isBuiltin: true,
        isDefault: true,
      },
      {
        id: 'builtin-expand',
        name: '扩写-标准',
        type: 'system',
        operation: 'expand',
        template: `你是一位专业的小说写手，请将大纲点扩展为完整的小说段落。

【已有角色（必须使用）】
{characters}

【相关地点】
{locationCards}

【势力/组织】
{factions}

【世界观规则】
{worldRules}

{preContext}

{outlinePosition}

{recentSummary}

{retrievedChunks}

请将用户提供的大纲点扩展为生动、具体的小说内容。重要约束：
1. 必须使用上述已有角色，不要创造新的主要角色
2. 场景地点优先使用上述已有地点
3. 严格遵循上述世界观规则
4. 角色性格和行为要前后一致
5. 添加适当的场景描写、动作细节和对话
6. 注意节奏感，张弛有度
7. 字数要求按用户指定

【格式要求】
- 每个自然段之间用空行（两个换行）分隔
- 对话单独成段，不同角色对话分不同段落
- 不要输出章节标题或"第X章"，直接从正文开始`,
        variables: ['characters', 'locationCards', 'factions', 'worldRules', 'preContext', 'outlinePosition', 'recentSummary', 'retrievedChunks'],
        isBuiltin: true,
        isDefault: true,
      },
      {
        id: 'builtin-brainstorm',
        name: '头脑风暴-标准',
        type: 'system',
        operation: 'brainstorm',
        template: `你是一位创意写作顾问，正在为一部小说提供创意建议。

【已有角色】
{characters}

【地点/场景】
{locationCards}

【势力/组织】
{factions}

【世界观规则】
{worldRules}

{outlinePosition}

{recentSummary}

{foreshadowReminder}

请根据用户的需求提供创意建议。重要：请在建议中明确使用上述已有角色和世界观设定，不要凭空创造新的核心角色或地点（可以补充次要角色）。建议可以包括：
1. 情节走向建议（多个选项）
2. 冲突点和转折设计
3. 角色发展建议
4. 伏笔设置与回收方案

请给出具体的、可操作的方案，而非泛泛而谈。`,
        variables: ['characters', 'locationCards', 'factions', 'worldRules', 'outlinePosition', 'recentSummary', 'foreshadowReminder'],
        isBuiltin: true,
        isDefault: true,
      },
      {
        id: 'builtin-custom',
        name: '自定义-标准',
        type: 'system',
        operation: 'custom',
        template: `你是一位专业的小说写手，正在协助创作。

{preContext}

{outlinePosition}

{characters}

请根据用户的具体指令完成任务。`,
        variables: ['preContext', 'outlinePosition', 'characters'],
        isBuiltin: true,
        isDefault: true,
      },
    ]

    for (const tmpl of builtins) {
      this.register(tmpl)
    }
  }
}

// ─── 单例 ────────────────────────────────────────

let promptBuilderInstance: PromptBuilder | null = null

export function getPromptBuilder(): PromptBuilder {
  if (!promptBuilderInstance) {
    promptBuilderInstance = new PromptBuilder()
  }
  return promptBuilderInstance
}
