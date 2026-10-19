import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActivityLifecycle,
  FeeType,
  PublishStatus,
  type Activity,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertActivityDto } from "./dto/upsert-activity.dto";
import {
  REGISTRATION_CANCEL_HOOK,
  type RegistrationCancelHook,
} from "./registration-cancel.hook";

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRATION_CANCEL_HOOK)
    private readonly registrationCancel: RegistrationCancelHook,
  ) {}

  private async requireApprovedOrganizer(userId: string) {
    const organizer = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });
    if (!organizer || organizer.publishStatus !== PublishStatus.approved) {
      throw new ForbiddenException("Publisher approval required");
    }
    return organizer;
  }

  private async requireOwnedActivity(userId: string, activityId: string) {
    const organizer = await this.requireApprovedOrganizer(userId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizerId: organizer.id },
    });
    if (!activity) throw new NotFoundException("Activity not found");
    return { organizer, activity };
  }

  private assertPublishable(a: Activity) {
    const missing: string[] = [];
    if (!a.title?.trim()) missing.push("title");
    if (!a.coverUrl?.trim()) missing.push("coverUrl");
    if (!a.category?.trim()) missing.push("category");
    if (!a.rules?.trim()) missing.push("rules");
    if (!a.place?.trim()) missing.push("place");
    if (!a.startAt) missing.push("startAt");
    if (!a.endAt) missing.push("endAt");
    if (!a.capacity || a.capacity < 1) missing.push("capacity");
    if (missing.length) {
      throw new BadRequestException({
        message: "Missing required fields for publish",
        fields: missing,
      });
    }
    if (a.endAt! <= a.startAt!) {
      throw new BadRequestException("endAt must be after startAt");
    }
    if (a.feeType === FeeType.free && a.feeCents !== 0) {
      throw new BadRequestException("feeCents must be 0 when feeType is free");
    }
    if (a.feeType === FeeType.paid && a.feeCents <= 0) {
      throw new BadRequestException("feeCents must be > 0 when feeType is paid");
    }
  }

  private mapDto(dto: UpsertActivityDto) {
    return {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.rules !== undefined ? { rules: dto.rules } : {}),
      ...(dto.startAt !== undefined ? { startAt: new Date(dto.startAt) } : {}),
      ...(dto.endAt !== undefined ? { endAt: new Date(dto.endAt) } : {}),
      ...(dto.place !== undefined ? { place: dto.place.trim() } : {}),
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.feeType !== undefined ? { feeType: dto.feeType } : {}),
      ...(dto.feeCents !== undefined ? { feeCents: dto.feeCents } : {}),
      ...(dto.feeNote !== undefined ? { feeNote: dto.feeNote } : {}),
    };
  }

  async create(userId: string, dto: UpsertActivityDto): Promise<Activity> {
    const organizer = await this.requireApprovedOrganizer(userId);
    if (!dto.title?.trim()) {
      throw new BadRequestException("title is required");
    }
    const data = {
      organizerId: organizer.id,
      title: dto.title.trim(),
      ...this.mapDto({ ...dto, title: undefined }),
      lifecycle: ActivityLifecycle.draft,
    };
    const created = await this.prisma.activity.create({ data });
    if (dto.publish) {
      return this.publish(userId, created.id);
    }
    return created;
  }

  async update(
    userId: string,
    id: string,
    dto: UpsertActivityDto,
  ): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (
      activity.lifecycle === ActivityLifecycle.cancelled ||
      activity.lifecycle === ActivityLifecycle.removed ||
      activity.lifecycle === ActivityLifecycle.ended
    ) {
      throw new ConflictException("Cannot edit activity in terminal state");
    }
    const updated = await this.prisma.activity.update({
      where: { id },
      data: this.mapDto(dto),
    });
    if (dto.publish) {
      return this.publish(userId, id);
    }
    return updated;
  }

  async publish(userId: string, id: string): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (activity.lifecycle !== ActivityLifecycle.draft) {
      throw new ConflictException("Only draft can be published");
    }
    this.assertPublishable(activity);
    return this.prisma.activity.update({
      where: { id },
      data: {
        lifecycle: ActivityLifecycle.published,
        publishedAt: new Date(),
      },
    });
  }

  async unpublish(userId: string, id: string): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (activity.lifecycle !== ActivityLifecycle.published) {
      throw new ConflictException("Only published can unpublish to draft");
    }
    await this.registrationCancel.cancelAllForActivity(id);
    return this.prisma.activity.update({
      where: { id },
      data: { lifecycle: ActivityLifecycle.draft },
    });
  }

  async cancel(
    userId: string,
    id: string,
    reason?: string,
  ): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    if (
      activity.lifecycle !== ActivityLifecycle.draft &&
      activity.lifecycle !== ActivityLifecycle.published
    ) {
      throw new ConflictException("Cannot cancel from current state");
    }
    await this.registrationCancel.cancelAllForActivity(id);
    return this.prisma.activity.update({
      where: { id },
      data: {
        lifecycle: ActivityLifecycle.cancelled,
        cancelReason: reason ?? null,
      },
    });
  }

  async listMine(
    userId: string,
    opts: { lifecycle?: ActivityLifecycle; skip?: number; take?: number },
  ) {
    const organizer = await this.requireApprovedOrganizer(userId);
    const where = {
      organizerId: organizer.id,
      ...(opts.lifecycle ? { lifecycle: opts.lifecycle } : {}),
    };
    const take = Math.min(opts.take ?? 20, 50);
    const skip = opts.skip ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  async getMine(userId: string, id: string): Promise<Activity> {
    const { activity } = await this.requireOwnedActivity(userId, id);
    return activity;
  }
}
