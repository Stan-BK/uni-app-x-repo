import { Controller, Delete, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import {
  CurrentAdmin,
  type CurrentAdminPayload,
} from "../common/decorators/current-admin.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminCommunityService } from "./admin-community.service";
import { ListAdminPostsQuery } from "./dto/list-admin-posts.query";

@Controller("admin/community")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.operator, AdminRole.admin)
export class AdminCommunityController {
  constructor(private readonly adminCommunityService: AdminCommunityService) {}

  @Get("posts")
  listPosts(@Query() query: ListAdminPostsQuery) {
    return this.adminCommunityService.listPosts(query);
  }

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
