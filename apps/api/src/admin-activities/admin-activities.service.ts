import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ActivityLifecycle, type Activity } from "@prisma/client";
import {
  REGISTRATION_CANCEL_HOOK,
  type RegistrationCancelHook,
} from "../activities/registration-cancel.hook";
import { PrismaService } from "../prisma/prisma.service";
import type { RemoveActivityDto } from "./dto/remove-activity.dto";

@Injectable()
export class AdminActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRATION_CANCEL_HOOK)
    private readonly registrationCancel: RegistrationCancelHook,
  ) {}

  list(lifecycle?: ActivityLifecycle) {
    return this.prisma.activity.findMany({
      where: lifecycle ? { lifecycle } : undefined,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { organizer: { select: { id: true, name: true } } },
    });
  }

  async remove(
    id: string,
    adminId: string,
    dto: RemoveActivityDto,
  ): Promise<Activity> {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException("Activity not found");
    if (activity.lifecycle !== ActivityLifecycle.published) {
      throw new ConflictException("Only published activities can be removed");
    }
    await this.registrationCancel.cancelAllForActivity(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.activity.update({
        where: { id },
        data: {
          lifecycle: ActivityLifecycle.removed,
          removeReason: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "remove",
          targetType: "activity",
          targetId: id,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }
}
