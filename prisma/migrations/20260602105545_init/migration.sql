-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "models" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "subtitle" TEXT,
    "description" TEXT,
    "genre" TEXT,
    "targetWords" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "perspective" TEXT NOT NULL DEFAULT 'third',
    "tense" TEXT NOT NULL DEFAULT 'past',
    "styleProfile" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Volume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Volume_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "volumeId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "targetWords" INTEGER NOT NULL DEFAULT 3000,
    "status" TEXT NOT NULL DEFAULT 'outline',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "isKeyChapter" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Chapter_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Chapter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT,
    "gender" TEXT,
    "age" TEXT,
    "appearance" TEXT,
    "personality" TEXT,
    "background" TEXT,
    "motivation" TEXT,
    "weakness" TEXT,
    "catchphrase" TEXT,
    "abilities" TEXT,
    "role" TEXT,
    "customFields" TEXT,
    "embedding" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "characterIdA" TEXT NOT NULL,
    "characterIdB" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterRelation_characterIdA_fkey" FOREIGN KEY ("characterIdA") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelation_characterIdB_fkey" FOREIGN KEY ("characterIdB") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterStateSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "location" TEXT,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterStateSnapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterStateSnapshot_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "leaderName" TEXT,
    "members" TEXT,
    "goal" TEXT,
    "description" TEXT,
    "relations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Faction_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldRule_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventTime" TEXT NOT NULL,
    "sortOrder" REAL NOT NULL DEFAULT 0,
    "chapterIds" TEXT,
    "characterIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimelineEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Foreshadowing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "plantChapterId" TEXT NOT NULL,
    "plantPosition" TEXT,
    "planRecycleChapterId" TEXT,
    "actualRecycleChapterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planted',
    "relatedCharacterIds" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "embedding" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Foreshadowing_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Foreshadowing_plantChapterId_fkey" FOREIGN KEY ("plantChapterId") REFERENCES "Chapter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Foreshadowing_planRecycleChapterId_fkey" FOREIGN KEY ("planRecycleChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Foreshadowing_actualRecycleChapterId_fkey" FOREIGN KEY ("actualRecycleChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChapterChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterChunk_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChapterChunk_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "oneLineSummary" TEXT,
    "briefSummary" TEXT,
    "detailedSummary" TEXT,
    "briefEmbedding" BLOB,
    "generatedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT,
    "name" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'user',
    "template" TEXT NOT NULL,
    "variables" TEXT,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromptTemplate_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AICallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "operation" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "responseText" TEXT,
    "tokenUsage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AICallLog_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subType" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" BLOB,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccess" DATETIME,
    "sourceChapterId" TEXT,
    "relatedEntityIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoryItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MemoryItem_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NovelSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "defaultProviderId" TEXT,
    "defaultModel" TEXT,
    "contextWindowSize" INTEGER NOT NULL DEFAULT 2000,
    "contextRetrievalScope" TEXT NOT NULL DEFAULT 'volume',
    "contextTopK" INTEGER NOT NULL DEFAULT 5,
    "injectCharacters" TEXT NOT NULL DEFAULT 'auto',
    "injectRecentSummary" BOOLEAN NOT NULL DEFAULT true,
    "injectForeshadowing" BOOLEAN NOT NULL DEFAULT true,
    "autoSnapshotInterval" INTEGER NOT NULL DEFAULT 0,
    "autoSaveInterval" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NovelSettings_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NovelSettings_defaultProviderId_fkey" FOREIGN KEY ("defaultProviderId") REFERENCES "AIProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Volume_novelId_idx" ON "Volume"("novelId");

-- CreateIndex
CREATE INDEX "Chapter_novelId_idx" ON "Chapter"("novelId");

-- CreateIndex
CREATE INDEX "Chapter_volumeId_idx" ON "Chapter"("volumeId");

-- CreateIndex
CREATE INDEX "Chapter_parentId_idx" ON "Chapter"("parentId");

-- CreateIndex
CREATE INDEX "Chapter_novelId_sortOrder_idx" ON "Chapter"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

-- CreateIndex
CREATE INDEX "CharacterRelation_novelId_idx" ON "CharacterRelation"("novelId");

-- CreateIndex
CREATE INDEX "CharacterRelation_characterIdA_idx" ON "CharacterRelation"("characterIdA");

-- CreateIndex
CREATE INDEX "CharacterRelation_characterIdB_idx" ON "CharacterRelation"("characterIdB");

-- CreateIndex
CREATE INDEX "CharacterStateSnapshot_characterId_idx" ON "CharacterStateSnapshot"("characterId");

-- CreateIndex
CREATE INDEX "CharacterStateSnapshot_chapterId_idx" ON "CharacterStateSnapshot"("chapterId");

-- CreateIndex
CREATE INDEX "CharacterStateSnapshot_novelId_characterId_idx" ON "CharacterStateSnapshot"("novelId", "characterId");

-- CreateIndex
CREATE INDEX "Location_novelId_idx" ON "Location"("novelId");

-- CreateIndex
CREATE INDEX "Faction_novelId_idx" ON "Faction"("novelId");

-- CreateIndex
CREATE INDEX "WorldRule_novelId_category_idx" ON "WorldRule"("novelId", "category");

-- CreateIndex
CREATE INDEX "TimelineEvent_novelId_idx" ON "TimelineEvent"("novelId");

-- CreateIndex
CREATE INDEX "Foreshadowing_novelId_status_idx" ON "Foreshadowing"("novelId", "status");

-- CreateIndex
CREATE INDEX "Foreshadowing_plantChapterId_idx" ON "Foreshadowing"("plantChapterId");

-- CreateIndex
CREATE INDEX "ChapterChunk_chapterId_idx" ON "ChapterChunk"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterChunk_novelId_idx" ON "ChapterChunk"("novelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSummary_chapterId_key" ON "ChapterSummary"("chapterId");

-- CreateIndex
CREATE INDEX "PromptTemplate_novelId_idx" ON "PromptTemplate"("novelId");

-- CreateIndex
CREATE INDEX "PromptTemplate_operation_idx" ON "PromptTemplate"("operation");

-- CreateIndex
CREATE INDEX "AICallLog_novelId_createdAt_idx" ON "AICallLog"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "AICallLog_chapterId_idx" ON "AICallLog"("chapterId");

-- CreateIndex
CREATE INDEX "MemoryItem_novelId_type_idx" ON "MemoryItem"("novelId", "type");

-- CreateIndex
CREATE INDEX "MemoryItem_novelId_importance_idx" ON "MemoryItem"("novelId", "importance");

-- CreateIndex
CREATE UNIQUE INDEX "NovelSettings_novelId_key" ON "NovelSettings"("novelId");
