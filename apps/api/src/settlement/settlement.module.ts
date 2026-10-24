import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettlementScanner } from "./settlement.scanner";
import { SettlementService } from "./settlement.service";
import { WalletController } from "./wallet.controller";

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [WalletController],
  providers: [SettlementService, SettlementScanner],
  exports: [SettlementService],
})
export class SettlementModule {}
