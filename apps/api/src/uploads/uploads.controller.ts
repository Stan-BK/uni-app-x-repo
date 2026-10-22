import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import type { Request } from "express";
import { mkdirSync } from "fs";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { CanPublishGuard } from "../common/guards/can-publish.guard";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const coversDir = join(process.cwd(), "uploads", "covers");
const avatarsDir = join(process.cwd(), "uploads", "avatars");
mkdirSync(coversDir, { recursive: true });
mkdirSync(avatarsDir, { recursive: true });

function publicApiBase(req: Request): string {
  return (
    process.env.PUBLIC_API_BASE?.replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}/api`
  );
}

function imageInterceptor(dir: string, maxBytes: number) {
  return FileInterceptor("file", {
    limits: { fileSize: maxBytes },
    storage: diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname || "").toLowerCase() || ".jpg";
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new Error("仅支持 jpg / png / webp / gif 图片"), false);
        return;
      }
      cb(null, true);
    },
  });
}

@Controller("me/uploads")
@UseGuards(UserJwtGuard)
export class UploadsController {
  @Post("cover")
  @UseGuards(CanPublishGuard)
  @UseInterceptors(imageInterceptor(coversDir, 5 * 1024 * 1024))
  uploadCover(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException("请选择封面图片");
    }
    return { url: `${publicApiBase(req)}/uploads/covers/${file.filename}` };
  }

  @Post("avatar")
  @UseInterceptors(imageInterceptor(avatarsDir, 2 * 1024 * 1024))
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException("请选择头像图片");
    }
    return { url: `${publicApiBase(req)}/uploads/avatars/${file.filename}` };
  }
}
