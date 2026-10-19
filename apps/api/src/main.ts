import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true, credentials: true });
  // 开发期本地封面；OSS 接入后可改写上传实现，静态前缀可保留兼容
  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/api/uploads/",
  });
  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0：允许手机真机预览通过局域网访问（勿只绑 127.0.0.1）
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://${host}:${port}/api`);
}
bootstrap();
