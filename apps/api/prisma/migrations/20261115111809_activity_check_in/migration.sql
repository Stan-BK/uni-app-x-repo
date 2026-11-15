-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Registration_activityId_checkedInAt_idx" ON "Registration"("activityId", "checkedInAt");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_checkedInByUserId_fkey" FOREIGN KEY ("checkedInByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
