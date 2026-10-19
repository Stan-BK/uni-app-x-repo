import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminActivitiesController } from "./admin-activities.controller";
import { AdminActivitiesService } from "./admin-activities.service";

@Module({
  imports: [AdminAuthModule, ActivitiesModule],
  controllers: [AdminActivitiesController],
  providers: [AdminActivitiesService],
})
export class AdminActivitiesModule {}
