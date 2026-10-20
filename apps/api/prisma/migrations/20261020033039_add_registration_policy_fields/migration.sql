-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "allowUserCancel" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refundable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registrationDeadlineAt" TIMESTAMP(3);
