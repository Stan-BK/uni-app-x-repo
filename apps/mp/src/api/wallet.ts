import type {
  WalletLedgerItem,
  WalletPaged,
  WalletPendingItem,
  WalletView,
} from "@activity/shared";
import { request } from "@/utils/request";

export type { WalletView, WalletLedgerItem, WalletPendingItem, WalletPaged };

/** 小程序运行时无 URLSearchParams，手动拼查询串 */
function toQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function getWallet() {
  return request<WalletView>("/me/wallet");
}

export function getWalletLedger(
  params: { page?: number; pageSize?: number } = {},
) {
  return request<WalletPaged<WalletLedgerItem>>(
    `/me/wallet/ledger${toQuery(params)}`,
  );
}

export function getWalletPending(
  params: { page?: number; pageSize?: number } = {},
) {
  return request<WalletPaged<WalletPendingItem>>(
    `/me/wallet/pending${toQuery(params)}`,
  );
}
