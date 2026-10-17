import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminRole, PublishStatus } from "@prisma/client";
import {
  CurrentAdmin,
  type CurrentAdminPayload,
} from "../common/decorators/current-admin.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminOrganizersService } from "./admin-organizers.service";
import { ApproveOrganizerDto } from "./dto/approve-organizer.dto";
import { FreezeOrganizerDto } from "./dto/freeze-organizer.dto";
import { RejectOrganizerDto } from "./dto/reject-organizer.dto";

@Controller("admin/organizers")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.operator, AdminRole.admin)
export class AdminOrganizersController {
  constructor(private readonly adminOrganizersService: AdminOrganizersService) {}

  @Get()
  list(@Query("status") status?: PublishStatus) {
    return this.adminOrganizersService.list(status);
  }

  @Post(":id/approve")
  approve(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: ApproveOrganizerDto,
  ) {
    return this.adminOrganizersService.approve(id, admin.adminId, dto);
  }

  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: RejectOrganizerDto,
  ) {
    return this.adminOrganizersService.reject(id, admin.adminId, dto);
  }

  @Post(":id/freeze")
  freeze(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: FreezeOrganizerDto,
  ) {
    return this.adminOrganizersService.freeze(id, admin.adminId, dto);
  }
}
