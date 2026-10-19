import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ActivityLifecycle } from "@prisma/client";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { PublisherGuard } from "../common/guards/publisher.guard";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { ActivitiesService } from "./activities.service";
import { CancelActivityDto } from "./dto/cancel-activity.dto";
import { UpsertActivityDto } from "./dto/upsert-activity.dto";

@Controller("organizer/activities")
@UseGuards(UserJwtGuard, PublisherGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertActivityDto,
  ) {
    return this.activitiesService.create(user.userId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query("lifecycle") lifecycle?: ActivityLifecycle,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    return this.activitiesService.listMine(user.userId, {
      lifecycle,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
    return this.activitiesService.getMine(user.userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: UpsertActivityDto,
  ) {
    return this.activitiesService.update(user.userId, id, dto);
  }

  @Post(":id/publish")
  publish(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
    return this.activitiesService.publish(user.userId, id);
  }

  @Post(":id/unpublish")
  unpublish(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
    return this.activitiesService.unpublish(user.userId, id);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: CancelActivityDto,
  ) {
    return this.activitiesService.cancel(user.userId, id, dto.reason);
  }
}
