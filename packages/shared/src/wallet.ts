/** 与 Prisma LedgerEntryType 对齐；本阶段仅 settlement_credit */
export const LedgerEntryType = {
  SettlementCredit: "settlement_credit",
} as const;
export type LedgerEntryType =
  (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const LEDGER_ENTRY_TYPE_LABEL: Record<LedgerEntryType, string> = {
  settlement_credit: "结算入账",
};

export type WalletView = {
  availableCents: number;
  pendingCents: number;
};

export type WalletLedgerItem = {
  id: string;
  type: LedgerEntryType;
  availableDeltaCents: number;
  availableAfterCents: number;
  createdAt: string;
  title: string;
  activityId: string | null;
};

export type WalletPendingItem = {
  activityId: string;
  title: string;
  pendingCents: number;
  endAt: string;
  lifecycle: string;
};

export type WalletPaged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
