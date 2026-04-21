/*
  Warnings:

  - Added the required column `audioPath` to the `Segment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "startMs" INTEGER,
    "endMs" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Segment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Segment" ("createdAt", "endMs", "id", "index", "notes", "projectId", "startMs", "text", "title", "updatedAt") SELECT "createdAt", "endMs", "id", "index", "notes", "projectId", "startMs", "text", "title", "updatedAt" FROM "Segment";
DROP TABLE "Segment";
ALTER TABLE "new_Segment" RENAME TO "Segment";
CREATE UNIQUE INDEX "Segment_projectId_index_key" ON "Segment"("projectId", "index");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
