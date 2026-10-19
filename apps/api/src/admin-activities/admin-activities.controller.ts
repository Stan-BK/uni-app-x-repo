import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ActivityLifecycle, AdminRole } from "@prisma/client";
import {
  CurrentAdmin,
  type CurrentAdminPayload,
} from "../common/decorators/current-admin.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminActivitiesService } from "./admin-activities.service";
import { RemoveActivityDto } from "./dto/remove-activity.dto";

@Controller("admin/activities")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.operator, AdminRole.admin)
export class AdminActivitiesController {
  constructor(private readonly adminActivitiesService: AdminActivitiesService) {}

  @Get()
  list(@Query("lifecycle") lifecycle?: ActivityLifecycle) {
    return this.adminActivitiesService.list(lifecycle);
  }

  @Post(":id/remove")
  remove(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: RemoveActivityDto,
  ) {
    return this.adminActivitiesService.remove(id, admin.adminId, dto);
  }
}
