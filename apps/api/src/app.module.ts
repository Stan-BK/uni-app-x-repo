import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivitiesModule } from "./activities/activities.module";
import { AdminActivitiesModule } from "./admin-activities/admin-activities.module";
import { AdminAuditLogsModule } from "./admin-audit-logs/admin-audit-logs.module";
import { AdminAuthModule } from "./admin-auth/admin-auth.module";
import { AdminUsersModule } from "./admin-users/admin-users.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PaymentsModule } from "./payments/payments.module";
import { PublicActivitiesModule } from "./public-activities/public-activities.module";
import { RegistrationsModule } from "./registrations/registrations.module";
import { UploadsModule } from "./uploads/uploads.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    PrismaModule,
    AuthModule,
    ActivitiesModule,
    PublicActivitiesModule,
    PaymentsModule,
    RegistrationsModule,
    UploadsModule,
    AdminAuthModule,
    AdminUsersModule,
    AdminActivitiesModule,
    AdminAuditLogsModule,
  ],
})
export class AppModule {}
