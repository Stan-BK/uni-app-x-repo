import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { ListWalletPageQuery } from "./dto/list-wallet-page.query";
import { SettlementService } from "./settlement.service";

@Controller("me")
export class WalletController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get("wallet")
  @UseGuards(UserJwtGuard)
  getWallet(@CurrentUser() user: CurrentUserPayload) {
    return this.settlementService.getWallet(user.userId);
  }

  @Get("wallet/ledger")
  @UseGuards(UserJwtGuard)
  listLedger(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListWalletPageQuery,
  ) {
    return this.settlementService.listLedger(user.userId, query);
  }

  @Get("wallet/pending")
  @UseGuards(UserJwtGuard)
  listPending(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListWalletPageQuery,
  ) {
    return this.settlementService.listPending(user.userId, query);
  }
}
