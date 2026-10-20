-- AlterTable
ALTER TABLE "User" ADD COLUMN "canPublish" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "ownerUserId" TEXT;

-- Backfill Activity.ownerUserId from Organizer.ownerUserId
UPDATE "Activity" AS a
SET "ownerUserId" = o."ownerUserId"
FROM "Organizer" AS o
WHERE a."organizerId" = o."id";

-- Frozen organizers lose default publish permission
UPDATE "User" AS u
SET "canPublish" = false
FROM "Organizer" AS o
WHERE o."ownerUserId" = u."id" AND o."publishStatus" = 'frozen';

-- Drop activities that could not be backfilled
DELETE FROM "Activity" WHERE "ownerUserId" IS NULL;

-- AlterTable
ALTER TABLE "Activity" ALTER COLUMN "ownerUserId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS "Activity_organizerId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Activity_organizerId_lifecycle_idx";

-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "organizerId";

-- CreateIndex
CREATE INDEX "Activity_ownerUserId_lifecycle_idx" ON "Activity"("ownerUserId", "lifecycle");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable
DROP TABLE IF EXISTS "Organizer";

-- DropEnum
DROP TYPE IF EXISTS "PublishStatus";
