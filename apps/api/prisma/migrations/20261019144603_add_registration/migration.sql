-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending_review', 'confirmed', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'confirmed',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Registration_activityId_status_idx" ON "Registration"("activityId", "status");

-- CreateIndex
CREATE INDEX "Registration_userId_createdAt_idx" ON "Registration"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_userId_activityId_key" ON "Registration"("userId", "activityId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
