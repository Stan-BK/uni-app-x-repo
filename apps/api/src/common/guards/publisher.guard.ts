import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PublishStatus } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Requires UserJwtGuard first (request.user.userId).
 * Passes only when the user's Organizer.publishStatus === approved.
 * Used by organizer activity publish routes.
 */
@Injectable()
export class PublisherGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId: string } }>();
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user");
    }

    const organizer = await this.prisma.organizer.findUnique({
      where: { ownerUserId: userId },
    });

    if (organizer?.publishStatus !== PublishStatus.approved) {
      throw new ForbiddenException("Publisher approval required");
    }

    return true;
  }
}
