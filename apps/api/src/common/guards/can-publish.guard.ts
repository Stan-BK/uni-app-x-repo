import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CanPublishGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId: string } }>();
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException("Missing authenticated user");
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { canPublish: true },
    });
    if (!user?.canPublish) {
      throw new ForbiddenException("发布权限已关闭");
    }
    return true;
  }
}
