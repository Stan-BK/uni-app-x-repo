import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AdminRole } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<{ admin?: { adminId: string; role: string } }>();
    const role = req.admin?.role;
    if (!role || !required.includes(role as AdminRole)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
