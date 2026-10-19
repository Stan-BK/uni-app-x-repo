-- CreateEnum
CREATE TYPE "ActivityLifecycle" AS ENUM ('draft', 'published', 'cancelled', 'removed', 'ended');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('free', 'paid');

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "rules" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "place" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "feeType" "FeeType" NOT NULL DEFAULT 'free',
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "feeNote" TEXT,
    "lifecycle" "ActivityLifecycle" NOT NULL DEFAULT 'draft',
    "cancelReason" TEXT,
    "removeReason" TEXT,
    "platformFeeBps" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_organizerId_lifecycle_idx" ON "Activity"("organizerId", "lifecycle");

-- CreateIndex
CREATE INDEX "Activity_lifecycle_startAt_idx" ON "Activity"("lifecycle", "startAt");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
