import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PublisherGuard } from "../common/guards/publisher.guard";
import { OrganizersController } from "./organizers.controller";
import { OrganizersService } from "./organizers.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganizersController],
  providers: [OrganizersService, PublisherGuard],
  exports: [OrganizersService, PublisherGuard],
})
export class OrganizersModule {}
