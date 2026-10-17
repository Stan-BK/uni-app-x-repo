import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type AdminJwtPayload = {
  sub: string;
  typ: string;
  role: string;
};

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<
        Request & { admin?: { adminId: string; role: string } }
      >();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    try {
      const payload = this.jwt.verify<AdminJwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ADMIN_SECRET"),
      });
      if (payload.typ !== "admin" || !payload.sub || !payload.role) {
        throw new UnauthorizedException("Invalid admin token");
      }
      req.admin = { adminId: payload.sub, role: payload.role };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException("Invalid admin token");
    }
  }
}
