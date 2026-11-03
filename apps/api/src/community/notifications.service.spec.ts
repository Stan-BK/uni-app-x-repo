import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

type Row = {
  id: string;
  recipientId: string;
  actorId: string;
  type: string;
  postId: string;
  commentId: string | null;
  readAt: Date | null;
  createdAt: Date;
};
type Where = {
  recipientId?: string;
  readAt?: null;
  id?: { in: string[] };
};

const USERS: Record<string, { nickname: string | null; avatarUrl: string | null }> =
  {
    a1: { nickname: "小明", avatarUrl: "http://img/a1.png" },
    a2: { nickname: null, avatarUrl: null },
  };

describe("NotificationsService", () => {
  let service: NotificationsService;
  let rows: Row[];

  const match = (r: Row, w: Where = {}) => {
    if (w.recipientId !== undefined && r.recipientId !== w.recipientId)
      return false;
    if (w.readAt === null && r.readAt !== null) return false;
    if (w.id && !w.id.in.includes(r.id)) return false;
    return true;
  };

  function seed(p: Partial<Row> & { id: string; createdAt: number }) {
    rows.push({
      recipientId: "u1",
      actorId: "a1",
      type: "like_post",
      postId: "p1",
      commentId: null,
      readAt: null,
      ...p,
      createdAt: new Date(1_700_000_000_000 + p.createdAt * 1000),
    });
  }

  beforeEach(async () => {
    rows = [];
    const prisma = {
      notification: {
        findMany: async ({
          where,
          orderBy,
          skip = 0,
          take = 1000,
        }: {
          where: Where;
          orderBy: { createdAt: "desc" };
          skip?: number;
          take?: number;
        }) => {
          expect(orderBy).toEqual({ createdAt: "desc" });
          return rows
            .filter((r) => match(r, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(skip, skip + take)
            .map((r) => ({
              ...r,
              actor: { id: r.actorId, ...USERS[r.actorId] },
            }));
        },
        count: async ({ where }: { where: Where }) =>
          rows.filter((r) => match(r, where)).length,
        updateMany: async ({
          where,
          data,
        }: {
          where: Where;
          data: { readAt: Date };
        }) => {
          const hit = rows.filter((r) => match(r, where));
          for (const r of hit) r.readAt = data.readAt;
          return { count: hit.length };
        },
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  describe("list", () => {
    it("仅当前用户，createdAt 倒序，含 actor 昵称头像/type/postId/commentId/readAt", async () => {
      const readAt = new Date(1_700_001_000_000);
      seed({ id: "n1", createdAt: 1 });
      seed({
        id: "n2",
        createdAt: 3,
        type: "like_comment",
        commentId: "c1",
        readAt,
      });
      seed({ id: "n3", createdAt: 2, actorId: "a2", type: "comment_post" });
      seed({ id: "other", createdAt: 9, recipientId: "u2" });

      const res = await service.list("u1");

      expect(res.total).toBe(3);
      expect(res.items.map((i) => i.id)).toEqual(["n2", "n3", "n1"]);
      expect(res.items[0]).toEqual({
        id: "n2",
        type: "like_comment",
        postId: "p1",
        commentId: "c1",
        actor: { id: "a1", nickname: "小明", avatarUrl: "http://img/a1.png" },
        readAt: readAt.toISOString(),
        createdAt: new Date(1_700_000_003_000).toISOString(),
      });
      // 无昵称兜底、未读 readAt 为 null
      expect(res.items[1].actor).toEqual({
        id: "a2",
        nickname: "用户",
        avatarUrl: null,
      });
      expect(res.items[1].readAt).toBeNull();
    });

    it("分页", async () => {
      for (let i = 0; i < 5; i++) seed({ id: `n${i}`, createdAt: i });
      const res = await service.list("u1", { page: 2, pageSize: 2 });
      expect(res.items.map((i) => i.id)).toEqual(["n2", "n1"]);
      expect(res).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    });
  });

  describe("unreadCount", () => {
    it("只统计当前用户未读", async () => {
      seed({ id: "n1", createdAt: 1 });
      seed({ id: "n2", createdAt: 2, readAt: new Date() });
      seed({ id: "n3", createdAt: 3 });
      seed({ id: "x", createdAt: 4, recipientId: "u2" });
      expect(await service.unreadCount("u1")).toEqual({ count: 2 });
      expect(await service.unreadCount("nobody")).toEqual({ count: 0 });
    });
  });

  describe("markRead", () => {
    it("ids：只更新属于当前用户的行，他人的忽略", async () => {
      seed({ id: "n1", createdAt: 1 });
      seed({ id: "n2", createdAt: 2 });
      seed({ id: "x", createdAt: 3, recipientId: "u2" });

      const res = await service.markRead("u1", { ids: ["n1", "x", "ghost"] });

      expect(res).toEqual({ updated: 1 });
      expect(rows.find((r) => r.id === "n1")!.readAt).toBeInstanceOf(Date);
      expect(rows.find((r) => r.id === "n2")!.readAt).toBeNull();
      expect(rows.find((r) => r.id === "x")!.readAt).toBeNull();
    });

    it("ids：已读行不被重复覆盖 readAt", async () => {
      const old = new Date(1_600_000_000_000);
      seed({ id: "n1", createdAt: 1, readAt: old });
      const res = await service.markRead("u1", { ids: ["n1"] });
      expect(res).toEqual({ updated: 0 });
      expect(rows[0].readAt).toBe(old);
    });

    it("all：标记当前用户全部未读，不影响他人", async () => {
      seed({ id: "n1", createdAt: 1 });
      seed({ id: "n2", createdAt: 2 });
      seed({ id: "n3", createdAt: 3, readAt: new Date(1_600_000_000_000) });
      seed({ id: "x", createdAt: 4, recipientId: "u2" });

      const res = await service.markRead("u1", { all: true });

      expect(res).toEqual({ updated: 2 });
      expect(rows.filter((r) => r.recipientId === "u1").every((r) => r.readAt))
        .toBe(true);
      expect(rows.find((r) => r.id === "x")!.readAt).toBeNull();
      expect(await service.unreadCount("u1")).toEqual({ count: 0 });
    });

    it("既无 ids 也非 all → 400", async () => {
      await expect(service.markRead("u1", {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.markRead("u1", { ids: [] })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
