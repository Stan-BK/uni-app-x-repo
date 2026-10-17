import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import type { AdminRole, AdminUser } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import type { AdminLoginDto } from "./dto/admin-login.dto";

export type AdminAuthView = {
  id: string;
  email: string;
  displayName: string | null;
  role: AdminRole;
};

export type AdminLoginResult = {
  accessToken: string;
  admin: AdminAuthView;
};

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminLoginResult> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (!admin || admin.status !== "active") {
      throw new UnauthorizedException("Invalid credentials");
    }

    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueToken(admin);
  }

  private issueToken(admin: AdminUser): AdminLoginResult {
    const secret = this.config.getOrThrow<string>("JWT_ADMIN_SECRET");
    const expiresIn = (this.config.get<string>("JWT_EXPIRES_IN") ??
      "7d") as JwtSignOptions["expiresIn"];
    const accessToken = this.jwt.sign(
      { sub: admin.id, typ: "admin", role: admin.role },
      { secret, expiresIn },
    );
    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role,
      },
    };
  }
}
