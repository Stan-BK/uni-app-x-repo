/** 扫码适配：优先走统一 uni.scanCode，不支持端（如 H5）返回明确错误。 */

export function scanQrCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof uni.scanCode !== "function") {
      reject(new Error("当前环境不支持扫码"));
      return;
    }
    uni.scanCode({
      onlyFromCamera: false,
      success: (res) => resolve(String(res.result || "").trim()),
      fail: (err) => {
        const errMsg = err?.errMsg || "";
        if (/cancel/i.test(errMsg)) {
          reject(
            Object.assign(new Error(errMsg || "cancel"), {
              errMsg,
              cancelled: true,
            }),
          );
          return;
        }
        if (/not\s*(supported|implemented)/i.test(errMsg)) {
          reject(Object.assign(new Error("当前环境不支持扫码"), { errMsg }));
          return;
        }
        reject(Object.assign(new Error(errMsg || "扫码失败"), { errMsg }));
      },
    });
  });
}
