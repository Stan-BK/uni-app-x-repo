import { Body, Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { LikeTargetType } from "@activity/shared";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { LikeTargetDto } from "./dto/like.dto";
import { LikesService } from "./likes.service";

@Controller("community/likes")
@UseGuards(UserJwtGuard)
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post()
  like(@CurrentUser() user: CurrentUserPayload, @Body() dto: LikeTargetDto) {
    return dto.targetType === LikeTargetType.Post
      ? this.likesService.likePost(user.userId, dto.targetId)
      : this.likesService.likeComment(user.userId, dto.targetId);
  }

  @Delete()
  unlike(@CurrentUser() user: CurrentUserPayload, @Body() dto: LikeTargetDto) {
    return dto.targetType === LikeTargetType.Post
      ? this.likesService.unlikePost(user.userId, dto.targetId)
      : this.likesService.unlikeComment(user.userId, dto.targetId);
  }
}
