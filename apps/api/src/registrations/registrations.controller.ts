import {
  Body,
  Controller,
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
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { ListMyRegistrationsQuery } from "./dto/list-my-registrations.query";
import { RegistrationsService } from "./registrations.service";

@Controller("registrations")
@UseGuards(UserJwtGuard)
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateRegistrationDto,
  ) {
    return this.registrationsService.create(user.userId, dto);
  }

  @Get("me")
  listMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListMyRegistrationsQuery,
  ) {
    return this.registrationsService.listMine(user.userId, query);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ) {
    return this.registrationsService.cancel(user.userId, id);
  }

  @Post(":id/payment-sync")
  syncPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ) {
    return this.registrationsService.syncPayment(user.userId, id);
  }
}
