export function pickAvatarFromAlbum(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const path = res.tempFilePaths?.[0];
        if (!path) {
          reject(new Error("未选择图片"));
          return;
        }
        resolve(path);
      },
      fail: (err) => {
        const errMsg = err.errMsg || "";
        if (errMsg.includes("cancel")) {
          reject(Object.assign(new Error("cancel"), { cancelled: true }));
          return;
        }
        reject(new Error(errMsg || "选择图片失败"));
      },
    });
  });
}
