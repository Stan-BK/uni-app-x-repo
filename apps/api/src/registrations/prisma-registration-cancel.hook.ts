import { Injectable } from "@nestjs/common";
import { RegistrationStatus } from "@prisma/client";
import {
  type RegistrationCancelHook,
} from "../activities/registration-cancel.hook";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaRegistrationCancelHook implements RegistrationCancelHook {
  constructor(private readonly prisma: PrismaService) {}

  async cancelAllForActivity(activityId: string): Promise<void> {
    await this.prisma.registration.updateMany({
      where: { activityId, status: RegistrationStatus.confirmed },
      data: { status: RegistrationStatus.cancelled, cancelledAt: new Date() },
    });
  }
}
