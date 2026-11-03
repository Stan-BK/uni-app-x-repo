import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { PagingQuery } from "./dto/list-posts.query";
import { ReadNotificationsDto } from "./dto/read-notifications.dto";
import { NotificationsService } from "./notifications.service";

@Controller("community/notifications")
@UseGuards(UserJwtGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: PagingQuery,
  ) {
    return this.notificationsService.list(user.userId, query);
  }

  // 静态子路径，无 :id 路由，不存在遮蔽问题
  @Get("unread-count")
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.unreadCount(user.userId);
  }

  @Post("read")
  @HttpCode(200)
  markRead(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReadNotificationsDto,
  ) {
    return this.notificationsService.markRead(user.userId, dto);
  }
}
