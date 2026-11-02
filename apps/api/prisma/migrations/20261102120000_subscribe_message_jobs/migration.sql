-- CreateEnum
CREATE TYPE "SubscribeMessageKind" AS ENUM ('registration_confirmed', 'activity_starting');

-- CreateEnum
CREATE TYPE "SubscribeMessageJobStatus" AS ENUM ('pending', 'sent', 'skipped', 'cancelled');

-- CreateTable
CREATE TABLE "SubscribeMessageJob" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "kind" "SubscribeMessageKind" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "SubscribeMessageJobStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscribeMessageJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscribeMessageJob_registrationId_kind_key" ON "SubscribeMessageJob"("registrationId", "kind");

-- CreateIndex
CREATE INDEX "SubscribeMessageJob_status_dueAt_idx" ON "SubscribeMessageJob"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "SubscribeMessageJob" ADD CONSTRAINT "SubscribeMessageJob_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
