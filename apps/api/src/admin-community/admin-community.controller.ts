import { Controller, Delete, Param, UseGuards } from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import {
  CurrentAdmin,
  type CurrentAdminPayload,
} from "../common/decorators/current-admin.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminCommunityService } from "./admin-community.service";

@Controller("admin/community")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.operator, AdminRole.admin)
export class AdminCommunityController {
  constructor(private readonly adminCommunityService: AdminCommunityService) {}

  @Delete("posts/:id")
  async softDeletePost(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
  ): Promise<void> {
    await this.adminCommunityService.softDeletePost(id, admin.adminId);
  }

  @Delete("comments/:id")
  async softDeleteComment(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
  ): Promise<void> {
    await this.adminCommunityService.softDeleteComment(id, admin.adminId);
  }
}
