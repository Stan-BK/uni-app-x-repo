import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  COMMUNITY_POST_ACTIVITIES_MAX,
  COMMUNITY_POST_BODY_MAX,
  COMMUNITY_POST_IMAGES_MAX,
  CommunityPostSort,
} from "@activity/shared";
import {
  ActivityLifecycle,
  CommunityDeletedBy as PrismaCommunityDeletedBy,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { communityHotScore } from "./community-hot-score";
import type { CreatePostDto } from "./dto/create-post.dto";
import { mapPost, POST_INCLUDE, type PostRow } from "./posts.mapper";

const HOT_WINDOW_MS = 30 * 24 * 3600 * 1000;
const HOT_CANDIDATE_LIMIT = 200;
const HOUR_MS = 3600 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type ListPostsInput = {
  sort?: string;
  page?: number;
  pageSize?: number;
};

/**
 * 上传接口返回 `{publicApiBase}/uploads/community/{uuid}.{ext}`，
 * 默认 publicApiBase 以 `/api` 结尾；兼容 PUBLIC_API_BASE 省略 `/api` 的部署。
 */
const COMMUNITY_UPLOAD_PATH_RE =
  /^(?:\/api)?\/uploads\/community\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|gif)$/i;

export function isCommunityUploadUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return false;
  }
  if (!COMMUNITY_UPLOAD_PATH_RE.test(parsed.pathname)) {
    return false;
  }
  const base = process.env.PUBLIC_API_BASE?.trim();
  if (base) {
    try {
      if (parsed.origin !== new URL(base).origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function normalizePaging(input: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(input.pageSize) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreatePostDto) {
    const body = (dto.body ?? "").trim();
    const imageUrls = dto.imageUrls ?? [];
    const activityIds = [...new Set(dto.activityIds ?? [])];

    if (body.length > COMMUNITY_POST_BODY_MAX) {
      throw new BadRequestException(
        `正文最多 ${COMMUNITY_POST_BODY_MAX} 字`,
      );
    }
    if (imageUrls.length > COMMUNITY_POST_IMAGES_MAX) {
      throw new BadRequestException(
        `图片最多 ${COMMUNITY_POST_IMAGES_MAX} 张`,
      );
    }
    if (activityIds.length > COMMUNITY_POST_ACTIVITIES_MAX) {
      throw new BadRequestException(
        `最多关联 ${COMMUNITY_POST_ACTIVITIES_MAX} 个活动`,
      );
    }
    if (!body && imageUrls.length === 0) {
      throw new BadRequestException("正文与图片至少填写一项");
    }
    if (!imageUrls.every(isCommunityUploadUrl)) {
      throw new BadRequestException("图片地址无效");
    }
    await this.assertDiscoverableActivities(activityIds, new Date());

    const row = await this.prisma.$transaction((tx) =>
      tx.post.create({
        data: {
          authorId,
          body,
          likeCount: 0,
          commentCount: 0,
          images: {
            create: imageUrls.map((url, sortOrder) => ({ url, sortOrder })),
          },
          activityLinks: {
            create: activityIds.map((activityId, sortOrder) => ({
              activityId,
              sortOrder,
            })),
          },
        },
        include: POST_INCLUDE,
      }),
    );
    return mapPost(row);
  }

  async list(input: ListPostsInput) {
    const sort = input.sort ?? CommunityPostSort.Latest;
    if (sort !== CommunityPostSort.Latest && sort !== CommunityPostSort.Hot) {
      throw new BadRequestException("Invalid sort");
    }
    const { page, pageSize } = normalizePaging(input);

    if (sort === CommunityPostSort.Latest) {
      return this.listLatest({ deletedAt: null }, page, pageSize);
    }
    return this.listHot(page, pageSize);
  }

  async listMine(authorId: string, input: ListPostsInput) {
    const { page, pageSize } = normalizePaging(input);
    return this.listLatest({ deletedAt: null, authorId }, page, pageSize);
  }

  async getById(id: string) {
    const row = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!row) throw new NotFoundException("动态不存在");
    if (row.deletedAt) throw new NotFoundException("动态已删除");
    return mapPost(row);
  }

  async softDelete(userId: string, id: string) {
    const row = await this.prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, deletedAt: true },
    });
    if (!row) throw new NotFoundException("动态不存在");
    if (row.authorId !== userId) {
      throw new ForbiddenException("只能删除自己的动态");
    }
    if (row.deletedAt) throw new NotFoundException("动态已删除");
    await this.prisma.post.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: PrismaCommunityDeletedBy.author,
      },
    });
  }

  async listActivityCandidates(q?: string, page?: number) {
    const paging = normalizePaging({ page });
    const keyword = q?.trim() ?? "";
    const where = {
      ...this.discoverableWhere(new Date()),
      ...(keyword
        ? { title: { contains: keyword, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy: { startAt: "asc" },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        select: { id: true, title: true },
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, page: paging.page, pageSize: paging.pageSize };
  }

  private async listLatest(
    where: { deletedAt: null; authorId?: string },
    page: number,
    pageSize: number,
  ) {
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: POST_INCLUDE,
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items: rows.map((r) => mapPost(r)), total, page, pageSize };
  }

  /** 候选窗内存算分后分页；total 为候选窗内条数（≤200） */
  private async listHot(page: number, pageSize: number) {
    const now = Date.now();
    const rows = await this.prisma.post.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: new Date(now - HOT_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      take: HOT_CANDIDATE_LIMIT,
      include: POST_INCLUDE,
    });
    const scored = rows.map((row: PostRow) => ({
      row,
      score: communityHotScore({
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        ageHours: Math.max(0, (now - row.createdAt.getTime()) / HOUR_MS),
      }),
    }));
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.row.createdAt.getTime() - a.row.createdAt.getTime(),
    );
    const start = (page - 1) * pageSize;
    return {
      items: scored.slice(start, start + pageSize).map((s) => mapPost(s.row)),
      total: scored.length,
      page,
      pageSize,
    };
  }

  /** 与 PublicActivitiesService.publicListWhere 一致（ADR-0006） */
  private discoverableWhere(now: Date) {
    return {
      lifecycle: ActivityLifecycle.published,
      endAt: { gt: now },
    };
  }

  private async assertDiscoverableActivities(ids: string[], now: Date) {
    if (ids.length === 0) return;
    const found = await this.prisma.activity.findMany({
      where: { id: { in: ids }, ...this.discoverableWhere(now) },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException("关联的活动不可用");
    }
  }
}
