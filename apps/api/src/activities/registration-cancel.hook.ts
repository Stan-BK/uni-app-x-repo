import { Injectable } from "@nestjs/common";

export const REGISTRATION_CANCEL_HOOK = Symbol("REGISTRATION_CANCEL_HOOK");

export interface RegistrationCancelHook {
  /** 取消某活动下全部有效报名；P0-4 前可为空操作 */
  cancelAllForActivity(activityId: string): Promise<void>;
}

@Injectable()
export class NoopRegistrationCancelHook implements RegistrationCancelHook {
  async cancelAllForActivity(_activityId: string): Promise<void> {
    // P0-4 接入真实报名取消
  }
}
