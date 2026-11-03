import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";
import { LikesController } from "./likes.controller";
import { LikesService } from "./likes.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    PostsController,
    CommentsController,
    LikesController,
    NotificationsController,
  ],
  providers: [
    PostsService,
    CommentsService,
    LikesService,
    NotificationsService,
  ],
  exports: [PostsService, CommentsService, LikesService, NotificationsService],
})
export class CommunityModule {}
