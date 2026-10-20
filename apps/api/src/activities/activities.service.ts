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
import { isActivityCategory } from "./activity-categories";
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

  private static readonly publishFieldLabels: Record<string, string> = {
    title: "标题",
    coverUrl: "封面",
    category: "分类",
    rules: "活动须知",
    place: "地点",
    startAt: "开始时间",
    endAt: "结束时间",
    capacity: "名额",
  };

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
      const labels = missing.map(
        (key) => ActivitiesService.publishFieldLabels[key] ?? key,
      );
      throw new BadRequestException({
        message: `发布失败，请填写：${labels.join("、")}`,
        fields: missing,
      });
    }
    if (!isActivityCategory(a.category.trim())) {
      throw new BadRequestException("分类不在可选列表中");
    }
    if (a.endAt! <= a.startAt!) {
      throw new BadRequestException("结束时间必须晚于开始时间");
    }
    const deadline = a.registrationDeadlineAt ?? a.startAt!;
    if (deadline > a.startAt!) {
      throw new BadRequestException("报名截止时间不能晚于活动开始时间");
    }
    if (a.feeType === FeeType.free && a.feeCents !== 0) {
      throw new BadRequestException("免费活动费用须为 0");
    }
    if (a.feeType === FeeType.paid && a.feeCents <= 0) {
      throw new BadRequestException("收费活动请填写大于 0 的费用（单位：分）");
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
      ...(dto.registrationDeadlineAt !== undefined
        ? { registrationDeadlineAt: new Date(dto.registrationDeadlineAt) }
        : {}),
      ...(dto.allowUserCancel !== undefined
        ? { allowUserCancel: dto.allowUserCancel }
        : {}),
      ...(dto.refundable !== undefined ? { refundable: dto.refundable } : {}),
      ...(dto.place !== undefined ? { place: dto.place.trim() } : {}),
      ...(dto.placeLat !== undefined ? { placeLat: dto.placeLat } : {}),
      ...(dto.placeLng !== undefined ? { placeLng: dto.placeLng } : {}),
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.feeType !== undefined ? { feeType: dto.feeType } : {}),
      ...(dto.feeCents !== undefined ? { feeCents: dto.feeCents } : {}),
      ...(dto.feeNote !== undefined ? { feeNote: dto.feeNote } : {}),
    };
  }

  /** 发布时若未设截止，默认等于 startAt */
  private withDefaultDeadline(activity: Activity): Partial<Activity> {
    if (activity.registrationDeadlineAt || !activity.startAt) return {};
    return { registrationDeadlineAt: activity.startAt };
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
    const defaults = this.withDefaultDeadline(activity);
    const toPublish = { ...activity, ...defaults };
    this.assertPublishable(toPublish);
    return this.prisma.activity.update({
      where: { id },
      data: {
        ...defaults,
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
