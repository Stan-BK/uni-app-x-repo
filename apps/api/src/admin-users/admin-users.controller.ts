import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import {
  CurrentAdmin,
  type CurrentAdminPayload,
} from "../common/decorators/current-admin.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminJwtGuard } from "../common/guards/admin-jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminUsersService } from "./admin-users.service";
import { FreezePublishDto } from "./dto/freeze-publish.dto";

@Controller("admin/users")
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.operator, AdminRole.admin)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.adminUsersService.list({
      page: page === undefined ? undefined : Number(page),
      pageSize: pageSize === undefined ? undefined : Number(pageSize),
    });
  }

  @Post(":id/freeze-publish")
  freezePublish(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: FreezePublishDto,
  ) {
    return this.adminUsersService.freezePublish(id, admin.adminId, dto);
  }

  @Post(":id/unfreeze-publish")
  unfreezePublish(
    @Param("id") id: string,
    @CurrentAdmin() admin: CurrentAdminPayload,
    @Body() dto: FreezePublishDto,
  ) {
    return this.adminUsersService.unfreezePublish(id, admin.adminId, dto);
  }
}
