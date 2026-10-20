import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CanPublishGuard } from "../common/guards/can-publish.guard";
import { PrismaRegistrationCancelHook } from "../registrations/prisma-registration-cancel.hook";
import { RegistrationsModule } from "../registrations/registrations.module";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import { REGISTRATION_CANCEL_HOOK } from "./registration-cancel.hook";

@Module({
  imports: [AuthModule, RegistrationsModule],
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    CanPublishGuard,
    {
      provide: REGISTRATION_CANCEL_HOOK,
      useClass: PrismaRegistrationCancelHook,
    },
  ],
  exports: [ActivitiesService, REGISTRATION_CANCEL_HOOK],
})
export class ActivitiesModule {}
