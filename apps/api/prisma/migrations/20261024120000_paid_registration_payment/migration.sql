-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'pending_payment' BEFORE 'confirmed';

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('pending', 'paid', 'closed', 'refunded');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('user_cancel', 'activity_closed');

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "outTradeNo" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'pending',
    "prepayId" TEXT,
    "transactionId" TEXT,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "outRefundNo" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_outTradeNo_key" ON "PaymentOrder"("outTradeNo");

-- CreateIndex
CREATE INDEX "PaymentOrder_registrationId_status_idx" ON "PaymentOrder"("registrationId", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_expireAt_idx" ON "PaymentOrder"("status", "expireAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentOrderId_key" ON "Refund"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_outRefundNo_key" ON "Refund"("outRefundNo");

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PaymentOrder_one_pending_per_registration"
  ON "PaymentOrder" ("registrationId") WHERE status = 'pending';
CREATE UNIQUE INDEX "PaymentOrder_one_paid_per_registration"
  ON "PaymentOrder" ("registrationId") WHERE status = 'paid';
