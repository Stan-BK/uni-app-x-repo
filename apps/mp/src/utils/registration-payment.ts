import {
  syncRegistrationPayment,
  type RegistrationPayParams,
} from "@/api/registrations";

export function isRegistrationPaymentConfirmed(input: {
  status: string;
  paymentStatus?: "pending" | "paid" | null;
}): boolean {
  return input.status === "confirmed" || input.paymentStatus === "paid";
}

function isPayCancelled(err: unknown): boolean {
  const msg =
    (err as { errMsg?: string })?.errMsg ??
    (err instanceof Error ? err.message : "");
  return /cancel/i.test(msg);
}

/** 拉起微信支付；用户取消返回 cancel，其它失败返回 fail，成功返回 success */
export async function launchWechatRegistrationPay(
  pay: RegistrationPayParams,
): Promise<"success" | "cancel" | "fail"> {
  try {
    await uni.requestPayment({
      provider: "wxpay",
      timeStamp: pay.timeStamp,
      nonceStr: pay.nonceStr,
      package: pay.package,
      signType: pay.signType,
      paySign: pay.paySign,
    });
    return "success";
  } catch (err) {
    if (isPayCancelled(err)) return "cancel";
    return "fail";
  }
}

/** 支付 sheet 关闭后同步服务端状态 */
export async function syncAfterPaymentSheet(registrationId: string) {
  return syncRegistrationPayment(registrationId);
}

/** 微信支付成功但服务端尚未确认时的提示 */
export const REGISTRATION_PAYMENT_PENDING_CONFIRM_TOAST =
  "支付结果确认中，请到我的报名查看";
