import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SubscribeMessagesModule } from "../subscribe-messages/subscribe-messages.module";
import { CheckInService } from "./check-in.service";
import { RegistrationsController } from "./registrations.controller";
import { RegistrationsService } from "./registrations.service";

@Module({
  imports: [PrismaModule, AuthModule, PaymentsModule, SubscribeMessagesModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, CheckInService],
  exports: [RegistrationsService, CheckInService],
})
export class RegistrationsModule {}
