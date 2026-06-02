/**
 * Prisma 查询结果类型提取
 * 
 * Prisma 7 的类型系统在 strict mode 下, findMany 带 select/include 的返回值
 * 在回调中无法自动推断。此文件手动提取常用查询结果类型。
 */

// Types extracted from Prisma query results for strict-mode compatibility

// ─── Chapter + include ──────────────────────────

/** Chapter with sibling info (title, sortOrder, summary) */
export type ChapterSibling = {
  title: string
  sortOrder: number
  summary: string | null
}

/** Chapter with volume relation */
export type ChapterWithVolume = {
  id: string
  title: string
  summary: string | null
  sortOrder: number
  volume: { title: string } | null
  parent: { title: string; summary: string | null } | null
}

// ─── ChapterChunk + include ─────────────────────

export type ChunkWithChapter = {
  id: string
  chapterId: string
  content: string
  chapter: {
    id: string
    title: string
    sortOrder: number
    volumeId: string | null
  }
}

// ─── Character ──────────────────────────────────

export type CharacterProfile = {
  id: string
  name: string
  role: string | null
  personality: string | null
  catchphrase: string | null
}

// ─── CharacterStateSnapshot ─────────────────────

export type CharacterLatestState = {
  id: string
  characterId: string
  state: string
  location: string | null
  alive: boolean
  summary: string | null
}

// ─── ChapterSummary + chapter ───────────────────

export type SummaryWithChapter = {
  chapterId: string
  oneLineSummary: string | null
  briefSummary: string | null
  chapter: {
    id: string
    title: string
    sortOrder: number
  }
}

// ─── Foreshadowing + plantChapter ───────────────

export type ForeshadowingWithPlant = {
  id: string
  content: string
  type: string
  status: string
  plantChapter: {
    title: string
    sortOrder: number
  }
}

/** Raw SQL return type (flat) for findPlannedNearChapter */
export type ForeshadowingNearby = {
  id: string
  content: string
  type: string
  status: string
  plantChapterTitle: string
  plantChapterSortOrder: number
  planRecycleSortOrder: number | null
}

// ─── Location ───────────────────────────────────

export type LocationInfo = {
  id: string
  name: string
  description: string | null
}
