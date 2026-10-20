import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CanPublishGuard } from "../common/guards/can-publish.guard";
import { UploadsController } from "./uploads.controller";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [CanPublishGuard],
})
export class UploadsModule {}
