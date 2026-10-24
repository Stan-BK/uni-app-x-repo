import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettlementScanner } from "./settlement.scanner";
import { SettlementService } from "./settlement.service";
import { WalletController } from "./wallet.controller";

@Module({
  imports: [PrismaModule, AuthModule, PaymentsModule],
  controllers: [WalletController],
  providers: [SettlementService, SettlementScanner],
  exports: [SettlementService],
})
export class SettlementModule {}
