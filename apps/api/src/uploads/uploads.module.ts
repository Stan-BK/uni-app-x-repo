import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PublisherGuard } from "../common/guards/publisher.guard";
import { UploadsController } from "./uploads.controller";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [PublisherGuard],
})
export class UploadsModule {}
