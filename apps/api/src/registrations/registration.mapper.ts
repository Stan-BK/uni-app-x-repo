import type { Registration } from "@prisma/client";
import type { ClientPayParams } from "../payments/wechat-pay.port";

export type RegistrationDto = {
  id: string;
  activityId: string;
  userId: string;
  name: string;
  phone: string;
  status: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateRegistrationDto = RegistrationDto & {
  alreadyRegistered: boolean;
  pay?: ClientPayParams | null;
  paymentStatus?: "pending" | "paid" | null;
};

export function toRegistrationDto(row: Registration): RegistrationDto {
  return {
    id: row.id,
    activityId: row.activityId,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    status: row.status,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
