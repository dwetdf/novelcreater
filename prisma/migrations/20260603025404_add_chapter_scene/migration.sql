-- CreateTable
CREATE TABLE "ChapterScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "setting" TEXT,
    "characters" TEXT,
    "conflict" TEXT,
    "outcome" TEXT,
    "emotionalBeat" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterScene_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChapterScene_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChapterScene_chapterId_idx" ON "ChapterScene"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterScene_novelId_idx" ON "ChapterScene"("novelId");
