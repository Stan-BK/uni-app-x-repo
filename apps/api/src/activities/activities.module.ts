import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PublisherGuard } from "../common/guards/publisher.guard";
import { RegistrationsModule } from "../registrations/registrations.module";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import {
  NoopRegistrationCancelHook,
  REGISTRATION_CANCEL_HOOK,
} from "./registration-cancel.hook";

@Module({
  imports: [AuthModule, RegistrationsModule],
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    PublisherGuard,
    { provide: REGISTRATION_CANCEL_HOOK, useClass: NoopRegistrationCancelHook },
  ],
  exports: [ActivitiesService, REGISTRATION_CANCEL_HOOK],
})
export class ActivitiesModule {}
