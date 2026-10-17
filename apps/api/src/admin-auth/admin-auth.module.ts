import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_ADMIN_SECRET"),
        signOptions: {
          expiresIn: (config.get<string>("JWT_EXPIRES_IN") ??
            "7d") as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard, RolesGuard],
  exports: [AdminAuthService, JwtModule, AdminJwtGuard, RolesGuard],
})
export class AdminAuthModule {}
