import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  COMMUNITY_COMMENT_BODY_MAX,
  CommunityDeletedBy,
  NotificationType,
} from "@activity/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { CommentsService } from "./comments.service";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const IMG = `http://localhost:3000/api/uploads/community/${UUID}.png`;

type PostRow = {
  id: string;
  authorId: string;
  commentCount: number;
  deletedAt: Date | null;
};
type CommentRow = {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  imageUrl: string | null;
  likeCount: number;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
};
type NotificationRow = {
  recipientId: string;
  actorId: string;
  type: string;
  postId: string;
  commentId: string | null;
};

const USERS: Record<string, { nickname: string | null; avatarUrl: string | null }> = {
  u1: { nickname: "作者", avatarUrl: null },
  u2: { nickname: null, avatarUrl: null },
  u3: { nickname: "第三人", avatarUrl: null },
};

type Where = {
  id?: string;
  postId?: string;
  parentId?: string | null;
  deletedAt?: null;
  commentCount?: { gte?: number; lt?: number };
};

function matchComment(c: CommentRow, w: Where = {}) {
  if (w.id !== undefined && c.id !== w.id) return false;
  if (w.postId !== undefined && c.postId !== w.postId) return false;
  if (w.parentId !== undefined && c.parentId !== w.parentId) return false;
  if (w.deletedAt === null && c.deletedAt !== null) return false;
  return true;
}

describe("CommentsService", () => {
  let service: CommentsService;
  let posts: PostRow[];
  let comments: CommentRow[];
  let notifications: NotificationRow[];
  let seq: number;
  let likedIds: string[];
  let clock: number;

  const withAuthor = (c: CommentRow) => ({
    ...c,
    author: { id: c.authorId, ...USERS[c.authorId] },
  });

  function seedComment(p: Partial<CommentRow> & { id: string }) {
    const row: CommentRow = {
      postId: "p1",
      authorId: "u1",
      parentId: null,
      body: "x",
      imageUrl: null,
      likeCount: 0,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(1_700_000_000_000 + clock++ * 1000),
      ...p,
    };
    comments.push(row);
    return row;
  }

  function buildDb() {
    return {
      post: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          posts.find((p) => p.id === where.id) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { commentCount: { increment: number } };
        }) => {
          const p = posts.find((x) => x.id === where.id)!;
          p.commentCount += data.commentCount.increment;
          return p;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: Where;
          data: { commentCount: number | { decrement: number } };
        }) => {
          const hit = posts.filter((p) => {
            if (p.id !== where.id) return false;
            const c = where.commentCount;
            if (c?.gte !== undefined && !(p.commentCount >= c.gte)) return false;
            if (c?.lt !== undefined && !(p.commentCount < c.lt)) return false;
            return true;
          });
          for (const p of hit) {
            p.commentCount =
              typeof data.commentCount === "number"
                ? data.commentCount
                : p.commentCount - data.commentCount.decrement;
          }
          return { count: hit.length };
        },
      },
      comment: {
        findFirst: async ({ where }: { where: Where }) =>
          comments.find((c) => matchComment(c, where)) ?? null,
        findUnique: async ({ where }: { where: { id: string } }) =>
          comments.find((c) => c.id === where.id) ?? null,
        create: async ({ data }: { data: Partial<CommentRow> }) => {
          const row: CommentRow = {
            id: `c${++seq}`,
            postId: data.postId!,
            authorId: data.authorId!,
            parentId: data.parentId ?? null,
            body: data.body ?? "",
            imageUrl: data.imageUrl ?? null,
            likeCount: 0,
            deletedAt: null,
            deletedBy: null,
            createdAt: new Date(1_700_000_000_000 + clock++ * 1000),
          };
          comments.push(row);
          return withAuthor(row);
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: Where;
          data: { deletedAt: Date; deletedBy: string };
        }) => {
          const hit = comments.filter((c) => matchComment(c, where));
          for (const c of hit) Object.assign(c, data);
          return { count: hit.length };
        },
        count: async ({ where }: { where: Where }) =>
          comments.filter((c) => matchComment(c, where)).length,
        findMany: async ({
          where,
          skip = 0,
          take = 1000,
        }: {
          where: Where;
          skip?: number;
          take?: number;
        }) =>
          comments
            .filter((c) => matchComment(c, where))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .slice(skip, skip + take)
            .map((c) => ({
              ...withAuthor(c),
              replies: comments
                .filter((r) => r.parentId === c.id && r.deletedAt === null)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                .map(withAuthor),
            })),
      },
      notification: {
        create: async ({ data }: { data: NotificationRow }) => {
          notifications.push(data);
          return data;
        },
      },
    };
  }

  beforeEach(async () => {
    seq = 0;
    clock = 0;
    posts = [
      { id: "p1", authorId: "u1", commentCount: 0, deletedAt: null },
      { id: "p2", authorId: "u1", commentCount: 0, deletedAt: null },
      { id: "pd", authorId: "u1", commentCount: 0, deletedAt: new Date() },
    ];
    comments = [];
    notifications = [];
    const db = buildDb();
    likedIds = [];
    const prisma = {
      ...db,
      like: {
        findMany: async (args: { where: { targetId: { in: string[] } } }) =>
          likedIds
            .filter((id) => args.where.targetId.in.includes(id))
            .map((targetId) => ({ targetId })),
      },
      $transaction: async (fn: (t: typeof db) => Promise<unknown>) => fn(db),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CommentsService);
  });

  describe("create 校验", () => {
    it("已软删动态不可评论 → 404", async () => {
      await expect(
        service.create("u2", "pd", { body: "hi" }),
      ).rejects.toThrow(new NotFoundException("动态已删除"));
      expect(comments).toHaveLength(0);
    });

    it("动态不存在 → 404", async () => {
      await expect(
        service.create("u2", "nope", { body: "hi" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("正文与图片都空 → 400", async () => {
      await expect(
        service.create("u2", "p1", { body: "   " }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("正文超过上限 → 400；恰好上限通过", async () => {
      await expect(
        service.create("u2", "p1", {
          body: "a".repeat(COMMUNITY_COMMENT_BODY_MAX + 1),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const ok = await service.create("u2", "p1", {
        body: "a".repeat(COMMUNITY_COMMENT_BODY_MAX),
      });
      expect(ok.body).toHaveLength(COMMUNITY_COMMENT_BODY_MAX);
    });

    it("imageUrl 非 community 路径 → 400；仅图片可发", async () => {
      await expect(
        service.create("u2", "p1", { imageUrl: "https://evil.com/a.png" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const ok = await service.create("u2", "p1", { imageUrl: IMG });
      expect(ok.imageUrl).toBe(IMG);
      expect(ok.body).toBe("");
    });
  });

  describe("create 挂载", () => {
    it("parentId 指向二级回复 → 挂到该回复的一级祖先", async () => {
      seedComment({ id: "root" });
      seedComment({ id: "reply", parentId: "root", authorId: "u3" });
      const c = await service.create("u2", "p1", {
        body: "再回",
        parentId: "reply",
      });
      expect(c.parentId).toBe("root");
    });

    it("parentId 指向一级 → 直接挂载", async () => {
      seedComment({ id: "root" });
      const c = await service.create("u2", "p1", { body: "回", parentId: "root" });
      expect(c.parentId).toBe("root");
    });

    it("parentId 属于其他动态 → 400", async () => {
      seedComment({ id: "other", postId: "p2" });
      await expect(
        service.create("u2", "p1", { body: "回", parentId: "other" }),
      ).rejects.toThrow(new BadRequestException("回复的评论不存在"));
    });

    it("parentId 已软删 → 400", async () => {
      seedComment({ id: "gone", deletedAt: new Date() });
      await expect(
        service.create("u2", "p1", { body: "回", parentId: "gone" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("create 计数与通知", () => {
    it("一级评论：commentCount++，通知动态作者 comment_post", async () => {
      const c = await service.create("u2", "p1", { body: "hi" });
      expect(posts[0].commentCount).toBe(1);
      expect(notifications).toEqual([
        {
          recipientId: "u1",
          actorId: "u2",
          type: NotificationType.CommentPost,
          postId: "p1",
          commentId: c.id,
        },
      ]);
      expect(c.author.nickname).toBe("用户"); // 昵称为空兜底
      expect(c.likedByMe).toBe(false);
    });

    it("作者自评自己的动态：计数增加但不通知", async () => {
      await service.create("u1", "p1", { body: "自言自语" });
      expect(posts[0].commentCount).toBe(1);
      expect(notifications).toHaveLength(0);
    });

    it("回复：只通知被回复者 reply_comment，不再通知动态作者", async () => {
      seedComment({ id: "root", authorId: "u3" });
      const c = await service.create("u2", "p1", {
        body: "回",
        parentId: "root",
      });
      expect(notifications).toEqual([
        {
          recipientId: "u3",
          actorId: "u2",
          type: NotificationType.ReplyComment,
          postId: "p1",
          commentId: c.id,
        },
      ]);
    });

    it("回复二级评论：通知被点的那条评论作者（非一级作者）", async () => {
      seedComment({ id: "root", authorId: "u1" });
      seedComment({ id: "reply", parentId: "root", authorId: "u3" });
      await service.create("u2", "p1", { body: "回", parentId: "reply" });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].recipientId).toBe("u3");
    });

    it("被回复者即动态作者：只有一条 reply_comment", async () => {
      seedComment({ id: "root", authorId: "u1" });
      await service.create("u2", "p1", { body: "回", parentId: "root" });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe(NotificationType.ReplyComment);
      expect(notifications[0].recipientId).toBe("u1");
    });

    it("回复自己的评论：不通知", async () => {
      seedComment({ id: "root", authorId: "u2" });
      await service.create("u2", "p1", { body: "补充", parentId: "root" });
      expect(notifications).toHaveLength(0);
    });
  });

  describe("softDelete", () => {
    it("非作者 → 403", async () => {
      seedComment({ id: "c", authorId: "u1" });
      await expect(service.softDelete("u2", "c")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(comments[0].deletedAt).toBeNull();
    });

    it("不存在 → 404", async () => {
      await expect(service.softDelete("u1", "nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("作者软删：commentCount--，deletedBy=author", async () => {
      posts[0].commentCount = 2;
      seedComment({ id: "a", authorId: "u2" });
      seedComment({ id: "b", authorId: "u2" });
      await service.softDelete("u2", "a");
      expect(posts[0].commentCount).toBe(1);
      expect(comments[0].deletedAt).toBeInstanceOf(Date);
      expect(comments[0].deletedBy).toBe(CommunityDeletedBy.Author);
    });

    it("已删再删：幂等，不重复扣减", async () => {
      posts[0].commentCount = 3;
      seedComment({ id: "a", authorId: "u2" });
      await service.softDelete("u2", "a");
      await service.softDelete("u2", "a");
      expect(posts[0].commentCount).toBe(2);
    });

    it("commentCount 下限 0", async () => {
      posts[0].commentCount = 0;
      seedComment({ id: "a", authorId: "u2" });
      await service.softDelete("u2", "a");
      expect(posts[0].commentCount).toBe(0);
    });

    it("删一级：级联软删未删回复，扣减 1+未删回复数，整枝从列表消失", async () => {
      seedComment({ id: "root", authorId: "u2" });
      seedComment({ id: "r1", parentId: "root", authorId: "u3" });
      seedComment({ id: "r2", parentId: "root", authorId: "u1" });
      seedComment({
        id: "r3",
        parentId: "root",
        authorId: "u3",
        deletedAt: new Date(),
      }); // 已删回复不重复计
      posts[0].commentCount = 3; // root + r1 + r2 = 3（r3 早已扣过）
      await service.softDelete("u2", "root");
      expect(posts[0].commentCount).toBe(0);
      expect(comments.every((c) => c.deletedAt !== null)).toBe(true);
      const list = await service.listForPost("p1");
      expect(list.items).toHaveLength(0);
      expect(list.total).toBe(0);
    });

    it("删二级回复：只扣 1，一级保留", async () => {
      posts[0].commentCount = 2;
      seedComment({ id: "root", authorId: "u1" });
      seedComment({ id: "r1", parentId: "root", authorId: "u2" });
      await service.softDelete("u2", "r1");
      expect(posts[0].commentCount).toBe(1);
      const list = await service.listForPost("p1");
      expect(list.items).toHaveLength(1);
      expect(list.items[0].replies).toHaveLength(0);
    });
  });

  describe("listForPost", () => {
    it("仅未删一级，各带未删回复且按 createdAt 升序", async () => {
      seedComment({ id: "t1" });
      seedComment({ id: "t2", deletedAt: new Date() });
      seedComment({ id: "t3" });
      seedComment({ id: "t1-r1", parentId: "t1", authorId: "u2" });
      seedComment({
        id: "t1-rx",
        parentId: "t1",
        deletedAt: new Date(),
      });
      seedComment({ id: "t1-r2", parentId: "t1", authorId: "u3" });
      seedComment({ id: "other", postId: "p2" });

      const list = await service.listForPost("p1");
      expect(list.items.map((i) => i.id)).toEqual(["t1", "t3"]);
      expect(list.total).toBe(2);
      expect(list.items[0].replies.map((r) => r.id)).toEqual([
        "t1-r1",
        "t1-r2",
      ]);
      expect(list.items[1].replies).toEqual([]);
      expect(list.items[0].replies[0].author.nickname).toBe("用户");
    });

    it("传 userId 时按批量查赞设置一级与回复的 likedByMe", async () => {
      seedComment({ id: "t1" });
      seedComment({ id: "t2" });
      seedComment({ id: "t1-r1", parentId: "t1", authorId: "u2" });
      seedComment({ id: "t1-r2", parentId: "t1", authorId: "u3" });
      likedIds = ["t2", "t1-r2"];

      const list = await service.listForPost("p1", {}, "u2");
      expect(list.items.map((i) => i.likedByMe)).toEqual([false, true]);
      expect(list.items[0].replies.map((r) => r.likedByMe)).toEqual([
        false,
        true,
      ]);

      const anon = await service.listForPost("p1");
      expect(anon.items.every((i) => !i.likedByMe)).toBe(true);
    });

    it("分页", async () => {
      for (let i = 0; i < 3; i++) seedComment({ id: `t${i}` });
      const list = await service.listForPost("p1", { page: 2, pageSize: 2 });
      expect(list.items.map((i) => i.id)).toEqual(["t2"]);
      expect(list.total).toBe(3);
    });

    it("动态已软删 → 404", async () => {
      await expect(service.listForPost("pd")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
