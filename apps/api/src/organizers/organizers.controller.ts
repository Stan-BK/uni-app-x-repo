import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { ApplyOrganizerDto } from "./dto/apply-organizer.dto";
import { OrganizersService } from "./organizers.service";

@Controller("organizers")
@UseGuards(UserJwtGuard)
export class OrganizersController {
  constructor(private readonly organizersService: OrganizersService) {}

  @Post("apply")
  apply(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ApplyOrganizerDto,
  ) {
    return this.organizersService.apply(user.userId, dto);
  }

  @Get("me")
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.organizersService.getMe(user.userId);
  }

  @Get("can-publish")
  canPublish(@CurrentUser() user: CurrentUserPayload) {
    return this.organizersService.canPublish(user.userId);
  }
}
