import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminOrganizersController } from "./admin-organizers.controller";
import { AdminOrganizersService } from "./admin-organizers.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminOrganizersController],
  providers: [AdminOrganizersService],
  exports: [AdminOrganizersService],
})
export class AdminOrganizersModule {}
