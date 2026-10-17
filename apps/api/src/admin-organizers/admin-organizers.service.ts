import { Injectable, NotFoundException } from "@nestjs/common";
import { PublishStatus, type Organizer } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ApproveOrganizerDto } from "./dto/approve-organizer.dto";
import type { FreezeOrganizerDto } from "./dto/freeze-organizer.dto";
import type { RejectOrganizerDto } from "./dto/reject-organizer.dto";

@Injectable()
export class AdminOrganizersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: PublishStatus): Promise<Organizer[]> {
    const publishStatus = status ?? PublishStatus.pending;
    return this.prisma.organizer.findMany({
      where: { publishStatus },
      orderBy: { createdAt: "asc" },
    });
  }

  async approve(
    id: string,
    adminId: string,
    dto: ApproveOrganizerDto,
  ): Promise<Organizer> {
    await this.requireOrganizer(id);
    const note = dto.note ?? null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizer.update({
        where: { id },
        data: {
          publishStatus: PublishStatus.approved,
          reviewNote: note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "approve",
          targetType: "organizer",
          targetId: id,
          reason: note,
        },
      });
      return updated;
    });
  }

  async reject(
    id: string,
    adminId: string,
    dto: RejectOrganizerDto,
  ): Promise<Organizer> {
    await this.requireOrganizer(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizer.update({
        where: { id },
        data: {
          publishStatus: PublishStatus.rejected,
          reviewNote: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "reject",
          targetType: "organizer",
          targetId: id,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }

  async freeze(
    id: string,
    adminId: string,
    dto: FreezeOrganizerDto,
  ): Promise<Organizer> {
    await this.requireOrganizer(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizer.update({
        where: { id },
        data: {
          publishStatus: PublishStatus.frozen,
          reviewNote: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "freeze",
          targetType: "organizer",
          targetId: id,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }

  private async requireOrganizer(id: string): Promise<Organizer> {
    const organizer = await this.prisma.organizer.findUnique({ where: { id } });
    if (!organizer) {
      throw new NotFoundException("Organizer not found");
    }
    return organizer;
  }
}
