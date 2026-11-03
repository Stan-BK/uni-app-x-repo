import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  COMMUNITY_POST_BODY_MAX,
  CommunityDeletedBy,
  CommunityPostSort,
} from "@activity/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { communityHotScore } from "./community-hot-score";
import { isCommunityUploadUrl, PostsService } from "./posts.service";

describe("isCommunityUploadUrl", () => {
  const UUID = "123e4567-e89b-12d3-a456-426614174000";
  const originalBase = process.env.PUBLIC_API_BASE;

  afterEach(() => {
    if (originalBase === undefined) delete process.env.PUBLIC_API_BASE;
    else process.env.PUBLIC_API_BASE = originalBase;
  });

  it("合法 community URL 通过（含 /api 前缀与无前缀）", () => {
    delete process.env.PUBLIC_API_BASE;
    expect(
      isCommunityUploadUrl(`http://localhost:3000/api/uploads/community/${UUID}.png`),
    ).toBe(true);
    expect(
      isCommunityUploadUrl(`https://cdn.example.com/uploads/community/${UUID}.JPEG`),
    ).toBe(true);
  });

  it("恶意主机路径中含 /uploads/community/ 仍拒绝（配置 PUBLIC_API_BASE 时）", () => {
    process.env.PUBLIC_API_BASE = "https://api.example.com/api";
    expect(
      isCommunityUploadUrl(`https://evil.com/api/uploads/community/${UUID}.png`),
    ).toBe(false);
    expect(
      isCommunityUploadUrl(`https://api.example.com/api/uploads/community/${UUID}.png`),
    ).toBe(true);
  });

  it("evil.com/.../uploads/community/ 路径子串不通过", () => {
    delete process.env.PUBLIC_API_BASE;
    expect(
      isCommunityUploadUrl("https://evil.com/x/uploads/community/a.png"),
    ).toBe(false);
    expect(
      isCommunityUploadUrl(`https://evil.com/evil/api/uploads/community/${UUID}.png`),
    ).toBe(false);
  });

  it("javascript: / data: / ftp: 协议拒绝", () => {
    expect(
      isCommunityUploadUrl(`javascript:alert(1)//api/uploads/community/${UUID}.png`),
    ).toBe(false);
    expect(isCommunityUploadUrl("data:text/html,<script>")).toBe(false);
    expect(
      isCommunityUploadUrl(`ftp://h/api/uploads/community/${UUID}.png`),
    ).toBe(false);
  });

  it("错误路径/扩展名/非 UUID 文件名拒绝", () => {
    delete process.env.PUBLIC_API_BASE;
    expect(isCommunityUploadUrl(`http://h/api/uploads/covers/${UUID}.png`)).toBe(false);
    expect(isCommunityUploadUrl(`http://h/api/uploads/community/${UUID}.svg`)).toBe(false);
    expect(isCommunityUploadUrl("http://h/api/uploads/community/a.png")).toBe(false);
    expect(
      isCommunityUploadUrl(`http://h/api/uploads/community/../${UUID}.png`),
    ).toBe(false);
    expect(isCommunityUploadUrl(`http://h/api/uploads/community/${UUID}.png?x=1`)).toBe(false);
  });
});

type PostFixture = {
  id: string;
  authorId: string;
  body: string;
  likeCount: number;
  commentCount: number;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; nickname: string | null; avatarUrl: string | null };
  images: { id: string; url: string; sortOrder: number }[];
  activityLinks: {
    id: string;
    sortOrder: number;
    activity: { id: string; title: string };
  }[];
};

const HOUR = 3600 * 1000;
const IMG =
  "http://localhost:3000/api/uploads/community/123e4567-e89b-12d3-a456-426614174000.png";

function makePost(over: Partial<PostFixture> & { id: string }): PostFixture {
  const createdAt = over.createdAt ?? new Date();
  return {
    authorId: "u1",
    body: "hello",
    likeCount: 0,
    commentCount: 0,
    deletedAt: null,
    deletedBy: null,
    createdAt,
    updatedAt: createdAt,
    author: { id: "u1", nickname: "小明", avatarUrl: null },
    images: [],
    activityLinks: [],
    ...over,
  };
}

describe("PostsService", () => {
  let service: PostsService;
  let store: PostFixture[];

  const tx = {
    post: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    activity: { findMany: vi.fn(), count: vi.fn() },
    post: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };

  /** 内存 fake：按 where/orderBy/skip/take 过滤，使排序断言有意义 */
  function wireStore() {
    prisma.post.findMany.mockImplementation(
      async (args: {
        where?: {
          deletedAt?: null;
          authorId?: string;
          createdAt?: { gte: Date };
        };
        orderBy?: { createdAt: "asc" | "desc" };
        skip?: number;
        take?: number;
      }) => {
        let rows = store.filter((p) => {
          if (args.where?.deletedAt === null && p.deletedAt !== null)
            return false;
          if (args.where?.authorId && p.authorId !== args.where.authorId)
            return false;
          if (
            args.where?.createdAt?.gte &&
            p.createdAt < args.where.createdAt.gte
          )
            return false;
          return true;
        });
        if (args.orderBy?.createdAt) {
          const dir = args.orderBy.createdAt === "desc" ? -1 : 1;
          rows = [...rows].sort(
            (a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()),
          );
        }
        const skip = args.skip ?? 0;
        return rows.slice(
          skip,
          args.take === undefined ? undefined : skip + args.take,
        );
      },
    );
    prisma.post.count.mockImplementation(
      async (args: { where?: { deletedAt?: null; authorId?: string } }) =>
        store.filter(
          (p) =>
            (args.where?.deletedAt !== null || p.deletedAt === null) &&
            (!args.where?.authorId || p.authorId === args.where.authorId),
        ).length,
    );
    prisma.post.findUnique.mockImplementation(
      async (args: { where: { id: string } }) =>
        store.find((p) => p.id === args.where.id) ?? null,
    );
    prisma.post.update.mockImplementation(
      async (args: {
        where: { id: string };
        data: { deletedAt: Date; deletedBy: string };
      }) => {
        const row = store.find((p) => p.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    store = [];
    wireStore();
    const mod = await Test.createTestingModule({
      providers: [PostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(PostsService);
  });

  describe("create", () => {
    it("正文与图皆空 → BadRequest", async () => {
      await expect(
        service.create("u1", { body: "   ", imageUrls: [], activityIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("正文超 200 字 → BadRequest", async () => {
      await expect(
        service.create("u1", {
          body: "字".repeat(COMMUNITY_POST_BODY_MAX + 1),
          imageUrls: [],
          activityIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("图片超过 3 张 → BadRequest", async () => {
      await expect(
        service.create("u1", {
          body: "x",
          imageUrls: [IMG, IMG, IMG, IMG],
          activityIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("图片非 community 上传路径 → BadRequest", async () => {
      await expect(
        service.create("u1", {
          body: "x",
          imageUrls: ["https://evil.example.com/a.png"],
          activityIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create("u1", {
          body: "x",
          imageUrls: ["not a url"],
          activityIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("活动不可发现 → BadRequest", async () => {
      prisma.activity.findMany.mockResolvedValue([{ id: "a1", title: "T" }]);
      await expect(
        service.create("u1", {
          body: "x",
          imageUrls: [],
          activityIds: ["a1", "a2"],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const where = prisma.activity.findMany.mock.calls[0][0].where;
      expect(where.lifecycle).toBe("published");
      expect(where.endAt.gt).toBeInstanceOf(Date);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("成功：返回作者展示名（空昵称→用户）、图片、活动", async () => {
      prisma.activity.findMany.mockResolvedValue([{ id: "a1", title: "徒步" }]);
      tx.post.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) =>
          makePost({
            id: "p1",
            body: "hi",
            author: { id: "u1", nickname: null, avatarUrl: null },
            images: [{ id: "i1", url: IMG, sortOrder: 0 }],
            activityLinks: [
              {
                id: "l1",
                sortOrder: 0,
                activity: { id: "a1", title: "徒步" },
              },
            ],
          }),
      );

      const res = await service.create("u1", {
        body: " hi ",
        imageUrls: [IMG],
        activityIds: ["a1"],
      });

      const data = tx.post.create.mock.calls[0][0].data;
      expect(data.authorId).toBe("u1");
      expect(data.body).toBe("hi");
      expect(data.likeCount).toBe(0);
      expect(data.commentCount).toBe(0);
      expect(data.images.create).toEqual([{ url: IMG, sortOrder: 0 }]);
      expect(data.activityLinks.create).toEqual([
        { activityId: "a1", sortOrder: 0 },
      ]);

      expect(res.author.nickname).toBe("用户");
      expect(res.images).toEqual([{ url: IMG, sortOrder: 0 }]);
      expect(res.activities).toEqual([{ id: "a1", title: "徒步" }]);
      expect(res.likedByMe).toBe(false);
      expect(res.likeCount).toBe(0);
    });

    it("仅图片（正文为空）可发布", async () => {
      tx.post.create.mockResolvedValue(
        makePost({
          id: "p2",
          body: "",
          images: [{ id: "i1", url: IMG, sortOrder: 0 }],
        }),
      );
      const res = await service.create("u1", {
        body: "",
        imageUrls: [IMG],
        activityIds: [],
      });
      expect(res.body).toBe("");
      expect(prisma.activity.findMany).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("latest：仅未删、createdAt desc", async () => {
      const now = Date.now();
      store = [
        makePost({ id: "old", createdAt: new Date(now - 3 * HOUR) }),
        makePost({
          id: "deleted",
          createdAt: new Date(now - 1 * HOUR),
          deletedAt: new Date(),
          deletedBy: CommunityDeletedBy.Author,
        }),
        makePost({ id: "new", createdAt: new Date(now - 2 * HOUR) }),
      ];

      const res = await service.list({ sort: CommunityPostSort.Latest });

      expect(res.items.map((p) => p.id)).toEqual(["new", "old"]);
      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
      const args = prisma.post.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ deletedAt: null });
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });

    it("latest 默认排序且 pageSize 上限 50", async () => {
      const res = await service.list({ pageSize: 999 });
      expect(res.pageSize).toBe(50);
      expect(prisma.post.findMany.mock.calls[0][0].take).toBe(50);
    });

    it("hot：顺序符合 communityHotScore（高赞旧帖 vs 低赞新帖）", async () => {
      const now = Date.now();
      const oldHigh = makePost({
        id: "old-high",
        likeCount: 100,
        createdAt: new Date(now - 24 * HOUR),
      });
      const newLow = makePost({
        id: "new-low",
        likeCount: 1,
        createdAt: new Date(now - 1 * HOUR),
      });
      const newZero = makePost({
        id: "new-zero",
        createdAt: new Date(now - 0.5 * HOUR),
      });
      store = [newZero, oldHigh, newLow];

      const score = (p: PostFixture) =>
        communityHotScore({
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          ageHours: (now - p.createdAt.getTime()) / HOUR,
        });
      const expected = [oldHigh, newLow, newZero]
        .sort((a, b) => score(b) - score(a))
        .map((p) => p.id);

      const res = await service.list({ sort: CommunityPostSort.Hot });

      expect(res.items.map((p) => p.id)).toEqual(expected);
      expect(res.items[0].id).toBe("old-high");
      const args = prisma.post.findMany.mock.calls[0][0];
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.createdAt.gte).toBeInstanceOf(Date);
      expect(args.take).toBe(200);
    });

    it("hot：同分时较新者优先，并按页切片", async () => {
      const now = Date.now();
      store = [
        makePost({ id: "z1", createdAt: new Date(now - 5 * HOUR) }),
        makePost({ id: "z2", createdAt: new Date(now - 2 * HOUR) }),
        makePost({ id: "z3", createdAt: new Date(now - 9 * HOUR) }),
      ];
      const p1 = await service.list({
        sort: CommunityPostSort.Hot,
        page: 1,
        pageSize: 2,
      });
      const p2 = await service.list({
        sort: CommunityPostSort.Hot,
        page: 2,
        pageSize: 2,
      });
      expect(p1.items.map((p) => p.id)).toEqual(["z2", "z1"]);
      expect(p2.items.map((p) => p.id)).toEqual(["z3"]);
    });

    it("非法 sort → BadRequest", async () => {
      await expect(service.list({ sort: "bogus" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("getById / listMine", () => {
    it("getById 返回未删动态", async () => {
      store = [makePost({ id: "p1" })];
      const res = await service.getById("p1");
      expect(res.id).toBe("p1");
      expect(res.author.nickname).toBe("小明");
    });

    it("getById 不存在 → NotFound", async () => {
      await expect(service.getById("nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("listMine 仅作者自己的未删动态，createdAt desc", async () => {
      const now = Date.now();
      store = [
        makePost({ id: "m1", createdAt: new Date(now - 3 * HOUR) }),
        makePost({ id: "m2", createdAt: new Date(now - 1 * HOUR) }),
        makePost({
          id: "m3",
          createdAt: new Date(now),
          deletedAt: new Date(),
        }),
        makePost({ id: "other", authorId: "u2", createdAt: new Date(now) }),
      ];
      const res = await service.listMine("u1", {});
      expect(res.items.map((p) => p.id)).toEqual(["m2", "m1"]);
      expect(res.total).toBe(2);
    });
  });

  describe("softDelete", () => {
    it("作者删除后不在 list 中，getById 抛 NotFound（已删除语义）", async () => {
      store = [makePost({ id: "p1", authorId: "u1" })];

      await service.softDelete("u1", "p1");

      expect(prisma.post.update).toHaveBeenCalledTimes(1);
      const data = prisma.post.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.deletedBy).toBe(CommunityDeletedBy.Author);

      const list = await service.list({});
      expect(list.items).toHaveLength(0);

      const err = await service.getById("p1").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(JSON.stringify((err as NotFoundException).getResponse())).toContain(
        "已删除",
      );
    });

    it("非作者删除 → Forbidden", async () => {
      store = [makePost({ id: "p1", authorId: "u1" })];
      await expect(service.softDelete("u2", "p1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it("不存在 → NotFound", async () => {
      await expect(service.softDelete("u1", "nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("listActivityCandidates", () => {
    it("仅返回可发现活动 {id,title}，支持 q 与分页", async () => {
      prisma.activity.findMany.mockResolvedValue([
        { id: "a1", title: "徒步" },
      ]);
      prisma.activity.count.mockResolvedValue(1);

      const res = await service.listActivityCandidates("徒", 2);

      expect(res).toEqual({
        items: [{ id: "a1", title: "徒步" }],
        total: 1,
        page: 2,
        pageSize: 20,
      });
      const args = prisma.activity.findMany.mock.calls[0][0];
      expect(args.where.lifecycle).toBe("published");
      expect(args.where.endAt.gt).toBeInstanceOf(Date);
      expect(args.where.title).toEqual({
        contains: "徒",
        mode: "insensitive",
      });
      expect(args.skip).toBe(20);
      expect(args.take).toBe(20);
      expect(args.select).toEqual({ id: true, title: true });
    });
  });
});
