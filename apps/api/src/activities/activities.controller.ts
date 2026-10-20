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
import { CanPublishGuard } from "../common/guards/can-publish.guard";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { ListMyRegistrationsQuery } from "../registrations/dto/list-my-registrations.query";
import { RegistrationsService } from "../registrations/registrations.service";
import { ActivitiesService } from "./activities.service";
import { CancelActivityDto } from "./dto/cancel-activity.dto";
import { UpsertActivityDto } from "./dto/upsert-activity.dto";

@Controller("organizer/activities")
@UseGuards(UserJwtGuard, CanPublishGuard)
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly registrations: RegistrationsService,
  ) {}

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

  @Get(":id/registrations")
  listRegistrations(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Query() query: ListMyRegistrationsQuery,
  ) {
    return this.registrations.listForOrganizer(user.userId, id, query);
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
