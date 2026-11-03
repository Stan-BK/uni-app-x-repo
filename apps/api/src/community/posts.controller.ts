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
import { CreatePostDto } from "./dto/create-post.dto";
import {
  ListActivityCandidatesQuery,
  ListPostsQuery,
} from "./dto/list-posts.query";
import { PostsService } from "./posts.service";

@Controller("community")
@UseGuards(UserJwtGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get("posts")
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListPostsQuery,
  ) {
    return this.postsService.list(query, user.userId);
  }

  // 静态路由须声明在 posts/:id 之前，避免 "mine" 被当作 id
  @Get("posts/mine")
  listMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListPostsQuery,
  ) {
    return this.postsService.listMine(user.userId, query);
  }

  @Get("activity-candidates")
  listActivityCandidates(@Query() query: ListActivityCandidatesQuery) {
    return this.postsService.listActivityCandidates(query.q, query.page);
  }

  @Get("posts/:id")
  getById(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
    return this.postsService.getById(id, user.userId);
  }

  @Post("posts")
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.create(user.userId, dto);
  }

  @Delete("posts/:id")
  async softDelete(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ): Promise<void> {
    await this.postsService.softDelete(user.userId, id);
  }
}
