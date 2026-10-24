import { Injectable } from "@nestjs/common";

export const REGISTRATION_CANCEL_HOOK = Symbol("REGISTRATION_CANCEL_HOOK");

export interface RegistrationCancelHook {
  /** 取消某活动下全部有效免费报名（已确认） */
  cancelAllForActivity(activityId: string): Promise<void>;
  /** 活动关闭：关未支付单、退已支付、取消免费已确认报名 */
  closeActivity(activityId: string): Promise<void>;
}

@Injectable()
export class NoopRegistrationCancelHook implements RegistrationCancelHook {
  async cancelAllForActivity(_activityId: string): Promise<void> {
    // P0-4 接入真实报名取消
  }

  async closeActivity(_activityId: string): Promise<void> {
    // P0-4 接入真实报名取消
  }
}
