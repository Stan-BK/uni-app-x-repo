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
import { PublisherGuard } from "../common/guards/publisher.guard";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const coversDir = join(process.cwd(), "uploads", "covers");
mkdirSync(coversDir, { recursive: true });

@Controller("organizer/uploads")
@UseGuards(UserJwtGuard, PublisherGuard)
export class UploadsController {
  @Post("cover")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: coversDir,
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
    }),
  )
  uploadCover(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException("请选择封面图片");
    }
    const publicBase =
      process.env.PUBLIC_API_BASE?.replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host")}/api`;
    return {
      url: `${publicBase}/uploads/covers/${file.filename}`,
    };
  }
}
