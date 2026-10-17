import { ConflictException, Injectable } from "@nestjs/common";
import { PublishStatus, type Organizer } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ApplyOrganizerDto } from "./dto/apply-organizer.dto";

const REAPPLYABLE: PublishStatus[] = [
  PublishStatus.none,
  PublishStatus.rejected,
];

const BLOCKED: PublishStatus[] = [
  PublishStatus.approved,
  PublishStatus.pending,
  PublishStatus.frozen,
];

@Injectable()
export class OrganizersService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(userId: string, dto: ApplyOrganizerDto): Promise<Organizer> {
    const existing = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });

    if (!existing) {
      return this.prisma.organizer.create({
        data: {
          ownerUserId: userId,
          name: dto.name,
          applyReason: dto.reason,
          publishStatus: PublishStatus.pending,
        },
      });
    }

    if (BLOCKED.includes(existing.publishStatus)) {
      throw new ConflictException(
        `Cannot re-apply while publishStatus is ${existing.publishStatus}`,
      );
    }

    if (!REAPPLYABLE.includes(existing.publishStatus)) {
      throw new ConflictException(
        `Cannot re-apply while publishStatus is ${existing.publishStatus}`,
      );
    }

    return this.prisma.organizer.update({
      where: { ownerUserId: userId },
      data: {
        name: dto.name,
        applyReason: dto.reason,
        publishStatus: PublishStatus.pending,
      },
    });
  }

  async getMe(userId: string): Promise<{ organizer: Organizer | null }> {
    const organizer = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });
    return { organizer };
  }

  async canPublish(userId: string): Promise<{ canPublish: boolean }> {
    const organizer = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });
    return {
      canPublish: organizer?.publishStatus === PublishStatus.approved,
    };
  }
}
