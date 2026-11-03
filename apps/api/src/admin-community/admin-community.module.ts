import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminCommunityController } from "./admin-community.controller";
import { AdminCommunityService } from "./admin-community.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminCommunityController],
  providers: [AdminCommunityService],
})
export class AdminCommunityModule {}
