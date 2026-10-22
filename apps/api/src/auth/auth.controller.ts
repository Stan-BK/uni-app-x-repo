import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { AuthService } from "./auth.service";
import { PatchMeDto } from "./dto/patch-me.dto";
import { WeixinLoginDto } from "./dto/weixin-login.dto";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/weixin/login")
  weixinLogin(@Body() dto: WeixinLoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(UserJwtGuard)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.userId);
  }

  @Patch("me")
  @UseGuards(UserJwtGuard)
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PatchMeDto,
  ) {
    return this.authService.updateMe(user.userId, dto);
  }
}
