/**
 * LanguagePolisher — 语言优化管线
 * 
 * 多轮精修：语法 → 风格 → 对话 → 节奏 → 感官描写
 * 每轮是独立的 AI 调用，可选择性执行。
 */

import type { PolishPass, PolishRequest } from './types'

// ─── 类型 ────────────────────────────────────────

export interface PolishResult {
  polishedContent: string
  passes: { pass: PolishPass; changes: number; summary: string }[]
  totalChanges: number
}

export interface PolishConfig {
  callAI: (systemPrompt: string, userMessage: string) => Promise<string>
}

// ─── 各轮提示词 ──────────────────────────────────

const PASS_PROMPTS: Record<PolishPass, { system: string; label: string }> = {
  grammar: {
    label: '语法修正',
    system: `你是一位严格的文字校对编辑。请修正以下文本中的语法错误、错别字和不通顺表达。
规则：
1. 只修正错误，不改变文风和内容
2. 修正"的、地、得"的误用
3. 修正标点符号错误（中文用全角标点）
4. 修正重复用词和冗余表达
5. 保持原文的段落结构
6. 直接输出修正后的全文，不要解释修改了什么`,
  },
  style: {
    label: '风格增强',
    system: `你是一位文学编辑。请在保持原意的前提下增强以下文本的文学表现力。
规则：
1. 将平淡的叙述改为更生动的表达
2. 使用更精准的动词和形容词
3. 避免重复使用相同的句式
4. 适当使用比喻、拟人等修辞手法（但不要过度）
5. 保持原文的节奏和段落结构
6. 直接输出润色后的全文，不要解释修改了什么`,
  },
  show_dont_tell: {
    label: '展示而非讲述',
    system: `你是一位创意写作教练。请将以下文本中的"讲述"改为"展示"。
规则：
1. 将抽象的情绪描述改为具体的动作/细节（如"他很生气"→"他攥紧了拳头，指节发白"）
2. 将平铺直叙的背景信息融入场景和对话中
3. 通过角色的行为、对话和感官体验来传达信息
4. 不要过度修改——有些"讲述"在过渡段落是合理的
5. 直接输出改写后的全文`,
  },
  dialogue: {
    label: '对话优化',
    system: `你是一位对话写作专家。请优化以下文本中的对话部分。
规则：
1. 让对话更自然、更符合口语习惯
2. 每个角色的说话方式应与其性格一致
3. 减少对话中的信息倾泻（避免角色说出对方已经知道的事）
4. 在对话中穿插动作和神态描写
5. 保持非对话部分的原文不变
6. 直接输出优化后的全文`,
  },
  pacing: {
    label: '节奏调整',
    system: `你是一位小说节奏编辑。请调整以下文本的节奏。
规则：
1. 动作场景：使用短句、快节奏
2. 情感场景：使用长句、减缓节奏
3. 过渡段落：简洁明快
4. 变化句子长度，避免单调
5. 适当分段，控制每段3-5行为宜
6. 直接输出调整后的全文`,
  },
  sensory: {
    label: '感官描写增强',
    system: `你是一位感官描写专家。请在以下文本中补充适当的感官细节。
规则：
1. 在适当的场景中添加视觉、听觉、嗅觉、触觉、味觉描写
2. 不要强行添加——只在自然地增强氛围的地方添加
3. 每种感官不要超过2-3处，避免堆砌
4. 保持原文的主要内容和结构
5. 直接输出增强后的全文`,
  },
}

// ─── 语言优化器 ──────────────────────────────────

export class LanguagePolisher {
  private callAI: PolishConfig['callAI']

  constructor(config: PolishConfig) {
    this.callAI = config.callAI
  }

  /**
   * 主入口：执行多轮语言优化
   */
  async polish(req: PolishRequest): Promise<PolishResult> {
    let content = req.content
    const passResults: PolishResult['passes'] = []
    let totalChanges = 0

    for (const pass of req.passes) {
      const promptConfig = PASS_PROMPTS[pass]
      if (!promptConfig) continue

      try {
        const polished = await this.callAI(promptConfig.system, content)

        // 计算变更量（字符级差异）
        const changes = this.estimateChanges(content, polished)
        totalChanges += changes

        passResults.push({
          pass,
          changes,
          summary: `${promptConfig.label}完成（变更约 ${changes} 处）`,
        })

        content = polished
      } catch (err) {
        passResults.push({
          pass,
          changes: 0,
          summary: `${promptConfig.label}失败：${String(err)}`,
        })
      }
    }

    return {
      polishedContent: content,
      passes: passResults,
      totalChanges,
    }
  }

  /**
   * 单轮优化
   */
  async polishSingle(
    content: string,
    pass: PolishPass,
  ): Promise<string> {
    const config = PASS_PROMPTS[pass]
    if (!config) return content
    return this.callAI(config.system, content)
  }

  /**
   * 获取所有可用的优化轮次
   */
  static getAvailablePasses(): { id: PolishPass; label: string }[] {
    return Object.entries(PASS_PROMPTS).map(([id, config]) => ({
      id: id as PolishPass,
      label: config.label,
    }))
  }

  /**
   * 获取推荐的优化顺序
   */
  static getRecommendedOrder(): PolishPass[] {
    return ['grammar', 'show_dont_tell', 'dialogue', 'style', 'pacing', 'sensory']
  }

  // ─── 工具 ──────────────────────────────────────

  /** 粗略估算变更量 */
  private estimateChanges(original: string, polished: string): number {
    if (!original || !polished) return 0
    
    // 简单差异估计：长度变化 + 逐句比较
    const lenDiff = Math.abs(original.length - polished.length)
    
    // 简化的句子级比较
    const origSentences = original.split(/[。！？]/)
    const polSentences = polished.split(/[。！？]/)
    let diffCount = 0
    
    const minLen = Math.min(origSentences.length, polSentences.length)
    for (let i = 0; i < minLen; i++) {
      if (origSentences[i].trim() !== polSentences[i].trim()) {
        diffCount++
      }
    }
    
    return diffCount + Math.floor(lenDiff / 10)
  }
}
