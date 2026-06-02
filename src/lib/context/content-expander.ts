/**
 * ContentExpander — 内容扩充管线
 * 
 * 将章节细纲（场景列表）扩展为完整的小说段落。
 * 支持上下文注入（RAG）、连续性检查和字数控制。
 */

import type { ExpansionRequest } from './types'
import type { SceneDetail } from './outline-generator'

// ─── 类型 ────────────────────────────────────────

export interface ExpansionResult {
  content: string
  wordCount: number
  scenesGenerated: number
  warnings: string[]
}

export interface ExpansionConfig {
  /** 调用 AI 的函数 */
  callAI: (systemPrompt: string, userMessage: string) => Promise<string>
}

// ─── Prompt 模板 ─────────────────────────────────

const SCENE_EXPAND_SYSTEM = `你是一位专业的小说写手。请根据场景细纲和上下文信息，写出完整的小说段落。

写作要求：
1. 使用第三人称过去时（除非另有指定）
2. 包含适量的场景描写、动作细节、心理活动和对话
3. 对话要自然，符合角色性格
4. 注意节奏：动作场景紧凑，情感场景舒缓
5. 保持与前后场景的连贯性
6. 字数控制在指定范围内
7. 不要提前写到后续场景的内容`

const CONTINUITY_CHECK_SYSTEM = `你是一位小说审稿编辑。请检查以下两段小说内容之间的连续性。

检查要点：
1. 时间线是否连贯（上一段的结尾和下一段的开头）
2. 角色状态是否一致（位置、情绪、伤情等）
3. 场景过渡是否自然
4. 是否有逻辑矛盾

如果发现问题，请以 JSON 格式返回：
{"issues": [{"type": "时间线/状态/过渡/矛盾", "description": "问题描述", "severity": "error/warning"}], "overall": "ok/has_issues"}`

// ─── 扩充器 ──────────────────────────────────────

export class ContentExpander {
  private callAI: ExpansionConfig['callAI']

  constructor(config: ExpansionConfig) {
    this.callAI = config.callAI
  }

  /**
   * 主入口：将场景细纲扩展为完整章节内容
   */
  async expandChapter(
    scenes: SceneDetail[],
    context: string,           // RAG 上下文（角色、世界观、前文等）
    options?: {
      targetWordsPerScene?: number  // 每个场景目标字数，默认 600
      perspective?: string           // 视角
    },
  ): Promise<ExpansionResult> {
    const targetWords = options?.targetWordsPerScene ?? 600
    const results: string[] = []
    const warnings: string[] = []
    let previousContent = ''

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const sceneContext = this.buildSceneContext(
        scene,
        context,
        previousContent,
        i,
        scenes.length,
      )

      const userMessage = this.buildSceneUserMessage(scene, targetWords)
      
      try {
        const content = await this.callAI(sceneContext, userMessage)
        results.push(content)
        previousContent = content
      } catch (err) {
        warnings.push(`场景 ${i + 1} "${scene.title}" 生成失败：${String(err)}`)
        results.push(`[场景 ${i + 1} 生成失败]`)
      }
    }

    // 如果有多个场景，做连续性检查
    if (results.length > 1) {
      const continuityIssues = await this.checkContinuity(results)
      warnings.push(...continuityIssues)
    }

    const fullContent = this.mergeResults(results)
    const wordCount = fullContent.replace(/\s/g, '').length

    return {
      content: fullContent,
      wordCount,
      scenesGenerated: results.filter((r) => !r.startsWith('[场景')).length,
      warnings,
    }
  }

  /**
   * 单场景扩展
   */
  async expandSingleScene(
    scene: SceneDetail,
    context: string,
    targetWords: number = 600,
  ): Promise<string> {
    const sceneContext = this.buildSceneContext(scene, context, '', 0, 1)
    const userMessage = this.buildSceneUserMessage(scene, targetWords)
    return this.callAI(sceneContext, userMessage)
  }

  // ─── 上下文构建 ────────────────────────────────

  private buildSceneContext(
    scene: SceneDetail,
    globalContext: string,
    previousContent: string,
    sceneIndex: number,
    totalScenes: number,
  ): string {
    const parts = [SCENE_EXPAND_SYSTEM]

    if (globalContext) {
      parts.push(`\n【小说上下文】\n${globalContext}`)
    }

    if (previousContent) {
      // 只取前一个场景的最后 300 字作为过渡参考
      const tail = previousContent.slice(-300)
      parts.push(`\n【上一场景结尾】\n${tail}`)
    }

    parts.push(`\n当前是第 ${sceneIndex + 1}/${totalScenes} 个场景。`)

    return parts.join('\n')
  }

  private buildSceneUserMessage(scene: SceneDetail, targetWords: number): string {
    const parts = [
      `请写出以下场景的完整内容（约 ${targetWords} 字）：`,
      '',
      `【场景】${scene.title}`,
      `【地点】${scene.setting}`,
    ]

    if (scene.characters.length > 0) {
      parts.push(`【出场角色】${scene.characters.join('、')}`)
    }

    parts.push(`【冲突/目标】${scene.conflict}`)
    parts.push(`【结果】${scene.outcome}`)
    parts.push(`【情感基调】${scene.emotionalBeat}`)

    if (scene.notes) {
      parts.push(`【注意事项】${scene.notes}`)
    }

    return parts.join('\n')
  }

  // ─── 连续性检查 ────────────────────────────────

  private async checkContinuity(sceneContents: string[]): Promise<string[]> {
    const issues: string[] = []

    // 只检查相邻场景的过渡（避免 token 爆炸）
    for (let i = 0; i < sceneContents.length - 1; i++) {
      const prev = sceneContents[i].slice(-400)  // 上一场景结尾
      const next = sceneContents[i + 1].slice(0, 400) // 下一场景开头

      const userMessage = `上一场景结尾：\n${prev}\n\n下一场景开头：\n${next}`
      
      try {
        const response = await this.callAI(CONTINUITY_CHECK_SYSTEM, userMessage)
        const result = this.parseContinuityResponse(response)
        if (result.overall === 'has_issues') {
          for (const issue of result.issues) {
            issues.push(`[场景${i + 1}→${i + 2}] ${issue.severity}: ${issue.description}`)
            if (issue.severity === 'error') {
              issues.push(`  ⚠️ 建议修改场景 ${i + 2} 的开头或场景 ${i + 1} 的结尾`)
            }
          }
        }
      } catch {
        // 连续性检查失败不阻塞主流程
      }
    }

    return issues
  }

  private parseContinuityResponse(response: string): {
    issues: { type: string; description: string; severity: string }[]
    overall: string
  } {
    try {
      const json = this.extractJSON(response)
      return JSON.parse(json)
    } catch {
      return { issues: [], overall: 'ok' }
    }
  }

  /** 从 AI 响应中提取 JSON */
  private extractJSON(response: string): string {
    const codeBlock = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (codeBlock) return codeBlock[1].trim()
    const brace = response.match(/\{[\s\S]*\}/)
    if (brace) return brace[0]
    return response
  }

  // ─── 工具 ──────────────────────────────────────

  /** 合并场景内容，添加场景分隔符 */
  private mergeResults(sceneContents: string[]): string {
    return sceneContents
      .map((content, i) => {
        if (i === 0) return content
        // 场景间添加空行分隔
        return `\n\n${content}`
      })
      .join('')
      .trim()
  }
}
