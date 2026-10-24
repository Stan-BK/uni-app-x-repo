import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { SettlementService } from "./settlement.service";

@Controller("me")
export class WalletController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get("wallet")
  @UseGuards(UserJwtGuard)
  getWallet(@CurrentUser() user: CurrentUserPayload) {
    return this.settlementService.getWallet(user.userId);
  }
}
