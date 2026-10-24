import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettlementScanner } from "./settlement.scanner";
import { SettlementService } from "./settlement.service";

@Module({
  imports: [PrismaModule, PaymentsModule],
  providers: [SettlementService, SettlementScanner],
  exports: [SettlementService],
})
export class SettlementModule {}
