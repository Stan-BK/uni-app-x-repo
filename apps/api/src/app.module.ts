import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminAuthModule } from "./admin-auth/admin-auth.module";
import { AdminOrganizersModule } from "./admin-organizers/admin-organizers.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizersModule } from "./organizers/organizers.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizersModule,
    AdminAuthModule,
    AdminOrganizersModule,
  ],
})
export class AppModule {}
