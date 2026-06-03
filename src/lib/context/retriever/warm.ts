/**
 * WarmContextCollector — 温上下文采集
 * 
 * 根据实体扫描结果，动态查询相关设定：
 * - 角色压缩档案 + 最新状态
 * - 地点/场景描述
 * - 近章摘要链
 * - 未回收伏笔提醒
 */

import { prisma } from '@/lib/db/prisma'
import { stateRepo } from '../storage/state-repo'
import { summaryRepo } from '../storage/summary-repo'
import { foreshadowRepo } from '../storage/foreshadow-repo'
import type { ContextRequest, EntityMatch, CharacterCard, LocationCard, ChapterSummaryCard, ForeshadowReminder } from '../types'
import type { CharacterProfile, CharacterLatestState, LocationInfo, SummaryWithChapter, ForeshadowingWithPlant, ForeshadowingNearby } from '../types-prisma'

export interface WarmContext {
  characterCards: CharacterCard[]
  locationCards: LocationCard[]
  recentSummaries: ChapterSummaryCard[]
  foreshadowReminders: ForeshadowReminder[]
  factions: FactionCard[]
  worldRules: WorldRuleCard[]
}

export interface FactionCard {
  id: string; name: string; type: string | null; goal: string | null; description: string | null
}

export interface WorldRuleCard {
  id: string; title: string; category: string | null; content: string
}

export class WarmContextCollector {
  /**
   * 采集温上下文
   */
  async collect(
    req: ContextRequest,
    entities: EntityMatch[],
  ): Promise<WarmContext & { sceneOutline?: string }> {
    const injectChars = req.options?.injectCharacters ?? 'auto'
    const injectSummary = req.options?.injectRecentSummary ?? true
    const injectForeshadow = req.options?.injectForeshadowing ?? true

    // 生成类操作（brainstorm/expand）没有前文可做实体匹配，全量注入角色和世界
    const isGenerative = ['brainstorm', 'expand'].includes(req.operation)
    const maxChars = isGenerative ? 99 : (injectChars === 'auto' ? 5 : 99)

    const [
      characterCards,
      locationCards,
      recentSummaries,
      foreshadowReminders,
      factions,
      worldRules,
      sceneOutline,
    ] = await Promise.all([
      injectChars !== 'off'
        ? this.collectCharacterCards(req.novelId, entities, maxChars)
        : Promise.resolve([] as CharacterCard[]),
      isGenerative
        ? this.collectAllLocations(req.novelId)
        : this.collectLocationCards(entities),
      injectSummary
        ? this.collectRecentSummaries(req)
        : Promise.resolve([] as ChapterSummaryCard[]),
      (injectForeshadow && ['continue', 'expand'].includes(req.operation)) || isGenerative
        ? this.collectForeshadowReminders(req)
        : Promise.resolve([] as ForeshadowReminder[]),
      isGenerative ? this.collectAllFactions(req.novelId) : Promise.resolve([] as FactionCard[]),
      isGenerative ? this.collectAllWorldRules(req.novelId) : Promise.resolve([] as WorldRuleCard[]),
      this.collectSceneOutline(req),
    ])

    return { characterCards, locationCards, recentSummaries, foreshadowReminders, factions, worldRules, sceneOutline }
  }

  /**
   * 角色压缩档案
   * 如果有实体匹配 → 只取匹配到的（按频率排序）
   * 如果无实体匹配 → 取全部角色（用于 brainstorm/expand 等生成操作）
   */
  private async collectCharacterCards(
    novelId: string,
    entities: EntityMatch[],
    maxCount: number,
  ): Promise<CharacterCard[]> {
    const characterEntities = entities
      .filter((e) => e.type === 'character')
      .slice(0, maxCount)

    // 无实体匹配时（生成操作），取全部角色
    if (characterEntities.length === 0) {
      return this.collectAllCharacters(novelId, maxCount)
    }

    const charIds = characterEntities.map((e) => e.id)

    // 批量获取角色档案 + 最新状态
    const [charactersRaw, statesRaw] = await Promise.all([
      prisma.character.findMany({
        where: { id: { in: charIds } },
        select: {
          id: true,
          name: true,
          role: true,
          personality: true,
          catchphrase: true,
        },
      }),
      stateRepo.getLatestStates(charIds),
    ])

    const characters = charactersRaw as CharacterProfile[]
    const states = statesRaw as CharacterLatestState[]
    const stateMap = new Map(states.map((s) => [s.characterId, s]))

    return characters.map((char) => {
      const state = stateMap.get(char.id)
      const traits = char.personality
        ? char.personality.split(/[,，、]/).slice(0, 5).map((t) => t.trim())
        : []

      return {
        id: char.id,
        name: char.name,
        identity: char.role ?? '角色',
        traits,
        currentState: state?.state ?? '状态未知',
        speechStyle: char.catchphrase ?? '',
      }
    })
  }

  /**
   * 地点/场景描述
   */
  private async collectLocationCards(entities: EntityMatch[]): Promise<LocationCard[]> {
    const locationEntities = entities
      .filter((e) => e.type === 'location')
      .slice(0, 3)

    if (locationEntities.length === 0) return []

    const locationsRaw = await prisma.location.findMany({
      where: { id: { in: locationEntities.map((e) => e.id) } },
      select: { id: true, name: true, description: true },
    })
    const locations = locationsRaw as LocationInfo[]

    return locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      description: (loc.description ?? '').slice(0, 100),
    }))
  }

  /**
   * 近章摘要链
   */
  private async collectRecentSummaries(req: ContextRequest): Promise<ChapterSummaryCard[]> {
    // 获取当前章节的 sortOrder
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.chapterId },
      select: { sortOrder: true },
    })
    if (!chapter) return []

    const summaries = await summaryRepo.findRecentBeforeChapter(
      req.novelId,
      chapter.sortOrder,
      3,
    ) as SummaryWithChapter[]

    return summaries.map((s) => ({
      chapterId: s.chapterId,
      chapterTitle: s.chapter.title,
      chapterNumber: s.chapter.sortOrder,
      oneLineSummary: s.oneLineSummary ?? s.briefSummary ?? '(无摘要)',
    }))
  }

  /**
   * 未回收伏笔提醒
   */
  private async collectForeshadowReminders(req: ContextRequest): Promise<ForeshadowReminder[]> {
    // 获取当前章节的 sortOrder
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.chapterId },
      select: { sortOrder: true },
    })
    if (!chapter) return []

    // 优先取计划在附近回收的伏笔
    const nearby = await foreshadowRepo.findPlannedNearChapter(
      req.novelId,
      chapter.sortOrder,
      3,
    ) as ForeshadowingNearby[]

    if (nearby.length > 0) {
      return nearby.map((f) => ({
        id: f.id,
        content: f.content,
        plantChapterTitle: f.plantChapterTitle,
        plantChapterNumber: f.plantChapterSortOrder,
        type: f.type,
        status: f.status,
      }))
    }

    // 退而求其次：取最近的未回收伏笔
    const unresolved = await foreshadowRepo.findUnresolved(req.novelId) as ForeshadowingWithPlant[]
    return unresolved.slice(0, 3).map((f) => ({
      id: f.id,
      content: f.content,
      plantChapterTitle: f.plantChapter.title,
      plantChapterNumber: f.plantChapter.sortOrder,
      type: f.type,
      status: f.status,
    }))
  }

  /**
   * 获取小说全部角色（用于生成操作）
   */
  private async collectAllCharacters(novelId: string, maxCount: number): Promise<CharacterCard[]> {
    const characters = await prisma.character.findMany({
      where: { novelId },
      select: { id: true, name: true, role: true, personality: true, catchphrase: true },
      take: maxCount,
    }) as CharacterProfile[]

    const charIds = characters.map((c) => c.id)
    const states = await stateRepo.getLatestStates(charIds) as CharacterLatestState[]
    const stateMap = new Map(states.map((s) => [s.characterId, s]))

    return characters.map((char) => {
      const state = stateMap.get(char.id)
      const traits = char.personality
        ? char.personality.split(/[,，、]/).slice(0, 5).map((t) => t.trim())
        : []
      return {
        id: char.id, name: char.name,
        identity: char.role ?? '角色',
        traits,
        currentState: state?.state ?? '状态未知',
        speechStyle: char.catchphrase ?? '',
      }
    })
  }

  /**
   * 获取小说全部地点（用于生成操作）
   */
  private async collectAllLocations(novelId: string): Promise<LocationCard[]> {
    const locations = await prisma.location.findMany({
      where: { novelId },
      select: { id: true, name: true, description: true },
      take: 20,
    }) as LocationInfo[]

    return locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      description: (loc.description ?? '').slice(0, 100),
    }))
  }

  /**
   * 获取小说全部势力（用于生成操作）
   */
  private async collectAllFactions(novelId: string): Promise<FactionCard[]> {
    const factions = await prisma.faction.findMany({
      where: { novelId },
      select: { id: true, name: true, type: true, goal: true, description: true },
      take: 10,
    }) as FactionCard[]
    return factions
  }

  /**
   * 获取小说全部世界观规则（用于生成操作）
   */
  private async collectAllWorldRules(novelId: string): Promise<WorldRuleCard[]> {
    const rules = await prisma.worldRule.findMany({
      where: { novelId },
      select: { id: true, title: true, category: true, content: true },
      take: 15,
    }) as WorldRuleCard[]
    return rules
  }

  /** 获取当前章节的场景细纲，注入 AI 上下文指导写作 */
  private async collectSceneOutline(req: ContextRequest): Promise<string> {
    if (req.chapterId === 'brainstorm') return ''
    try {
      const scenes = await prisma.chapterScene.findMany({
        where: { chapterId: req.chapterId },
        orderBy: { seq: 'asc' },
        select: { title: true, setting: true, characters: true, conflict: true, outcome: true, emotionalBeat: true },
      })
      if (scenes.length === 0) return ''
      return scenes.map((s: { title: string; setting: string | null; characters: string | null; conflict: string | null; outcome: string | null; emotionalBeat: string | null }, i: number) =>
        `场景${i + 1}：${s.title}\n  地点：${s.setting || ''}\n  角色：${s.characters || ''}\n  冲突：${s.conflict || ''}\n  结果：${s.outcome || ''}\n  情感：${s.emotionalBeat || ''}`
      ).join('\n\n')
    } catch {
      return ''
    }
  }
}

export const warmCollector = new WarmContextCollector()
