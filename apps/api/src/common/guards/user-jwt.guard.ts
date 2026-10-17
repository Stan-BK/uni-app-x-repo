import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type UserJwtPayload = {
  sub: string;
  typ: string;
};

@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: { userId: string } }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    try {
      const payload = this.jwt.verify<UserJwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_USER_SECRET"),
      });
      if (payload.typ !== "user" || !payload.sub) {
        throw new UnauthorizedException("Invalid user token");
      }
      req.user = { userId: payload.sub };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException("Invalid user token");
    }
  }
}
