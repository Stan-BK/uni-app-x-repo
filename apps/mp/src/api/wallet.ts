import { request } from "@/utils/request";

export type WalletView = {
  availableCents: number;
  pendingCents: number;
};

export function getWallet() {
  return request<WalletView>("/me/wallet");
}
