import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminAuditLogsService } from "./admin-audit-logs.service";
import { ListAuditLogsQuery } from "./dto/list-audit-logs.query";

@Controller("admin/audit-logs")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.admin)
export class AdminAuditLogsController {
  constructor(private readonly adminAuditLogsService: AdminAuditLogsService) {}

  @Get()
  list(@Query() query: ListAuditLogsQuery) {
    return this.adminAuditLogsService.list({
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId?.trim() || undefined,
      from: query.from,
      to: query.to,
      page: query.page === undefined ? undefined : Number(query.page),
      pageSize:
        query.pageSize === undefined ? undefined : Number(query.pageSize),
    });
  }
}
