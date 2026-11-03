import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { LikesService } from "./likes.service";

type PostRow = {
  id: string;
  authorId: string;
  likeCount: number;
  deletedAt: Date | null;
};
type CommentRow = PostRow & { postId: string };
type LikeRow = { userId: string; targetType: string; targetId: string };
type NotificationRow = {
  recipientId: string;
  actorId: string;
  type: string;
  postId: string;
  commentId: string | null;
};
type CountWhere = { id: string; likeCount?: { gte?: number; lt?: number } };
type CountData = { likeCount: number | { decrement: number } };

describe("LikesService", () => {
  let service: LikesService;
  let posts: PostRow[];
  let comments: CommentRow[];
  let likes: LikeRow[];
  let notifications: NotificationRow[];
  let failNextLikeCreate: boolean;

  function countDelegate(rows: PostRow[]) {
    return {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { likeCount: { increment: number } };
      }) => {
        const r = rows.find((x) => x.id === where.id)!;
        r.likeCount += data.likeCount.increment;
        return r;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: CountWhere;
        data: CountData;
      }) => {
        const hit = rows.filter((r) => {
          if (r.id !== where.id) return false;
          const c = where.likeCount;
          if (c?.gte !== undefined && !(r.likeCount >= c.gte)) return false;
          if (c?.lt !== undefined && !(r.likeCount < c.lt)) return false;
          return true;
        });
        for (const r of hit) {
          r.likeCount =
            typeof data.likeCount === "number"
              ? data.likeCount
              : r.likeCount - data.likeCount.decrement;
        }
        return { count: hit.length };
      },
    };
  }

  function buildDb() {
    return {
      post: {
        ...countDelegate(posts),
        findUnique: async ({ where }: { where: { id: string } }) =>
          posts.find((p) => p.id === where.id) ?? null,
      },
      comment: {
        ...countDelegate(comments),
        findUnique: async ({ where }: { where: { id: string } }) => {
          const c = comments.find((x) => x.id === where.id);
          if (!c) return null;
          const post = posts.find((p) => p.id === c.postId)!;
          return { ...c, post: { deletedAt: post.deletedAt } };
        },
      },
      like: {
        findUnique: async ({
          where,
        }: {
          where: { userId_targetType_targetId: LikeRow };
        }) => {
          const k = where.userId_targetType_targetId;
          return (
            likes.find(
              (l) =>
                l.userId === k.userId &&
                l.targetType === k.targetType &&
                l.targetId === k.targetId,
            ) ?? null
          );
        },
        create: async ({ data }: { data: LikeRow }) => {
          if (failNextLikeCreate) {
            failNextLikeCreate = false;
            // 模拟并发对手已先落库
            likes.push({ ...data });
            const post = posts.find((p) => p.id === data.targetId);
            if (post) post.likeCount += 1;
            throw new Prisma.PrismaClientKnownRequestError("unique", {
              code: "P2002",
              clientVersion: "test",
            });
          }
          likes.push({ ...data });
          return data;
        },
        deleteMany: async ({ where }: { where: LikeRow }) => {
          const before = likes.length;
          likes = likes.filter(
            (l) =>
              !(
                l.userId === where.userId &&
                l.targetType === where.targetType &&
                l.targetId === where.targetId
              ),
          );
          return { count: before - likes.length };
        },
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
    failNextLikeCreate = false;
    posts = [
      { id: "p1", authorId: "u1", likeCount: 0, deletedAt: null },
      { id: "pd", authorId: "u1", likeCount: 0, deletedAt: new Date() },
    ];
    comments = [
      {
        id: "c1",
        postId: "p1",
        authorId: "u3",
        likeCount: 0,
        deletedAt: null,
      },
      {
        id: "cd",
        postId: "p1",
        authorId: "u3",
        likeCount: 0,
        deletedAt: new Date(),
      },
    ];
    likes = [];
    notifications = [];
    const db = buildDb();
    const prisma = {
      ...db,
      $transaction: async (fn: (t: typeof db) => Promise<unknown>) => fn(db),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LikesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LikesService);
  });

  describe("目标不存在或已软删 → 404", () => {
    it("动态不存在", async () => {
      await expect(service.likePost("u2", "nope")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("动态已软删", async () => {
      await expect(service.likePost("u2", "pd")).rejects.toThrow(
        NotFoundException,
      );
      expect(likes).toHaveLength(0);
      expect(notifications).toHaveLength(0);
    });

    it("评论不存在", async () => {
      await expect(service.likeComment("u2", "nope")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("评论已软删", async () => {
      await expect(service.likeComment("u2", "cd")).rejects.toThrow(
        NotFoundException,
      );
      expect(likes).toHaveLength(0);
    });

    it("评论所属动态已软删", async () => {
      comments.push({
        id: "c-in-deleted",
        postId: "pd",
        authorId: "u3",
        likeCount: 0,
        deletedAt: null,
      });
      await expect(service.likeComment("u2", "c-in-deleted")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("点赞动态", () => {
    it("首次点赞：计数 +1，给动态作者发 like_post 通知", async () => {
      const res = await service.likePost("u2", "p1");
      expect(res).toEqual({ liked: true, likeCount: 1 });
      expect(posts[0].likeCount).toBe(1);
      expect(likes).toEqual([
        { userId: "u2", targetType: "post", targetId: "p1" },
      ]);
      expect(notifications).toEqual([
        {
          recipientId: "u1",
          actorId: "u2",
          type: "like_post",
          postId: "p1",
          commentId: null,
        },
      ]);
    });

    it("重复点赞幂等：计数不变且不重复通知", async () => {
      await service.likePost("u2", "p1");
      const res = await service.likePost("u2", "p1");
      expect(res).toEqual({ liked: true, likeCount: 1 });
      expect(posts[0].likeCount).toBe(1);
      expect(likes).toHaveLength(1);
      expect(notifications).toHaveLength(1);
    });

    it("自赞：计数 +1，不发通知", async () => {
      const res = await service.likePost("u1", "p1");
      expect(res).toEqual({ liked: true, likeCount: 1 });
      expect(notifications).toHaveLength(0);
    });

    it("并发唯一约束冲突 P2002：视为幂等成功，返回最新计数", async () => {
      failNextLikeCreate = true;
      const res = await service.likePost("u2", "p1");
      expect(res).toEqual({ liked: true, likeCount: 1 });
      expect(posts[0].likeCount).toBe(1);
      expect(likes).toHaveLength(1);
    });

    it("非 P2002 错误原样抛出", async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          LikesService,
          {
            provide: PrismaService,
            useValue: {
              $transaction: async () => {
                throw new Error("boom");
              },
            },
          },
        ],
      }).compile();
      await expect(
        moduleRef.get(LikesService).likePost("u2", "p1"),
      ).rejects.toThrow("boom");
    });
  });

  describe("取消点赞", () => {
    it("删除 Like 行并递减计数", async () => {
      await service.likePost("u2", "p1");
      const res = await service.unlikePost("u2", "p1");
      expect(res).toEqual({ liked: false, likeCount: 0 });
      expect(likes).toHaveLength(0);
      expect(posts[0].likeCount).toBe(0);
    });

    it("计数下限 0（历史脏数据不会变负）", async () => {
      likes.push({ userId: "u2", targetType: "post", targetId: "p1" });
      posts[0].likeCount = 0;
      const res = await service.unlikePost("u2", "p1");
      expect(res).toEqual({ liked: false, likeCount: 0 });
      expect(posts[0].likeCount).toBe(0);
      expect(likes).toHaveLength(0);
    });

    it("未点赞时取消：成功空操作，计数不变", async () => {
      posts[0].likeCount = 3;
      const res = await service.unlikePost("u2", "p1");
      expect(res).toEqual({ liked: false, likeCount: 3 });
      expect(posts[0].likeCount).toBe(3);
    });

    it("目标不存在 → 404", async () => {
      await expect(service.unlikePost("u2", "nope")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("评论取消点赞同样递减", async () => {
      await service.likeComment("u2", "c1");
      const res = await service.unlikeComment("u2", "c1");
      expect(res).toEqual({ liked: false, likeCount: 0 });
      expect(comments[0].likeCount).toBe(0);
    });
  });

  describe("点赞评论", () => {
    it("给评论作者发 like_comment 通知，带 commentId 与 postId", async () => {
      const res = await service.likeComment("u2", "c1");
      expect(res).toEqual({ liked: true, likeCount: 1 });
      expect(comments[0].likeCount).toBe(1);
      expect(likes).toEqual([
        { userId: "u2", targetType: "comment", targetId: "c1" },
      ]);
      expect(notifications).toEqual([
        {
          recipientId: "u3",
          actorId: "u2",
          type: "like_comment",
          postId: "p1",
          commentId: "c1",
        },
      ]);
    });

    it("重复点赞评论幂等", async () => {
      await service.likeComment("u2", "c1");
      await service.likeComment("u2", "c1");
      expect(comments[0].likeCount).toBe(1);
      expect(notifications).toHaveLength(1);
    });

    it("自赞评论：计数 +1，不发通知", async () => {
      const res = await service.likeComment("u3", "c1");
      expect(res).toEqual({ liked: true, likeCount: 1 });
      expect(notifications).toHaveLength(0);
    });
  });
});
