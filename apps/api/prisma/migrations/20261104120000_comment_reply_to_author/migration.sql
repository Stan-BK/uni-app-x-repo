-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "replyToAuthorId" TEXT;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_replyToAuthorId_fkey" FOREIGN KEY ("replyToAuthorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
