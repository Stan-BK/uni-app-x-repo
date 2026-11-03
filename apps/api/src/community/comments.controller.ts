import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { PagingQuery } from "./dto/list-posts.query";

@Controller("community")
@UseGuards(UserJwtGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // 与 PostsController 的 posts/:id 段数不同，不会相互遮蔽
  @Get("posts/:postId/comments")
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Param("postId") postId: string,
    @Query() query: PagingQuery,
  ) {
    return this.commentsService.listForPost(postId, query, user.userId);
  }

  @Post("posts/:postId/comments")
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param("postId") postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(user.userId, postId, dto);
  }

  @Delete("comments/:id")
  async softDelete(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ): Promise<void> {
    await this.commentsService.softDelete(user.userId, id);
  }
}
