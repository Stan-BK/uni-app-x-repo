import UQRCode from "uqrcodejs";

/**
 * 用 uqrcodejs 计算二维码矩阵，再用 uni 旧版 Canvas API 自行绘制。
 * 不依赖库自带的 drawCanvas，避免各平台 canvas 上下文差异。
 * 二维码内容为纯 token 字符串（design §5.1）。
 */
export function drawQrToCanvas(
  canvasId: string,
  text: string,
  size: number,
  quietModules = 3,
): Promise<void> {
  const qr = new UQRCode();
  qr.data = text;
  qr.errorCorrectLevel = UQRCode.errorCorrectLevel.M;
  qr.make();

  const count: number = qr.moduleCount;
  const cell = Math.max(1, Math.floor(size / (count + quietModules * 2)));
  const offset = Math.floor((size - cell * count) / 2);

  const ctx = uni.createCanvasContext(canvasId);
  ctx.setFillStyle("#ffffff");
  ctx.fillRect(0, 0, size, size);
  ctx.setFillStyle("#000000");
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isBlack(row, col)) {
        ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
      }
    }
  }
  return new Promise((resolve) => {
    ctx.draw(false, () => resolve());
  });
}
