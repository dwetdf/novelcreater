-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NovelSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "defaultProviderId" TEXT,
    "defaultModel" TEXT,
    "embeddingProviderId" TEXT,
    "embeddingModel" TEXT,
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
    CONSTRAINT "NovelSettings_defaultProviderId_fkey" FOREIGN KEY ("defaultProviderId") REFERENCES "AIProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NovelSettings_embeddingProviderId_fkey" FOREIGN KEY ("embeddingProviderId") REFERENCES "AIProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NovelSettings" ("autoSaveInterval", "autoSnapshotInterval", "contextRetrievalScope", "contextTopK", "contextWindowSize", "createdAt", "defaultModel", "defaultProviderId", "id", "injectCharacters", "injectForeshadowing", "injectRecentSummary", "novelId", "updatedAt") SELECT "autoSaveInterval", "autoSnapshotInterval", "contextRetrievalScope", "contextTopK", "contextWindowSize", "createdAt", "defaultModel", "defaultProviderId", "id", "injectCharacters", "injectForeshadowing", "injectRecentSummary", "novelId", "updatedAt" FROM "NovelSettings";
DROP TABLE "NovelSettings";
ALTER TABLE "new_NovelSettings" RENAME TO "NovelSettings";
CREATE UNIQUE INDEX "NovelSettings_novelId_key" ON "NovelSettings"("novelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
