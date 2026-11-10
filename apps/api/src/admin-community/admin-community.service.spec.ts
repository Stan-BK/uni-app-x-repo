import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommunityDeletedBy } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST_INCLUDE } from "../community/posts.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { AdminCommunityService } from "./admin-community.service";

describe("AdminCommunityService", () => {
  let service: AdminCommunityService;
  const auditLogCreate = vi.fn();
  const prisma = {
    post: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    comment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        post: prisma.post,
        comment: prisma.comment,
        auditLog: { create: auditLogCreate },
      }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCommunityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminCommunityService);
  });

  it("softDeletePost 条件更新 deletedAt:null、标记 deletedBy=admin 并写审计", async () => {
    prisma.post.updateMany.mockResolvedValue({ count: 1 });

    await service.softDeletePost("p1", "admin-1");

    const updateArg = prisma.post.updateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "p1", deletedAt: null });
    expect(updateArg.data.deletedBy).toBe(CommunityDeletedBy.admin);
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorType: "admin",
        actorId: "admin-1",
        action: "soft_delete_post",
        targetType: "post",
        targetId: "p1",
      },
    });
  });

  it("动态不存在（更新 0 行） → 404 动态不存在，不写审计", async () => {
    prisma.post.updateMany.mockResolvedValue({ count: 0 });
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(service.softDeletePost("nope", "admin-1")).rejects.toThrow(
      new NotFoundException("动态不存在"),
    );
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("更新 0 行且动态已删 → 404 动态已删除，不写审计", async () => {
    prisma.post.updateMany.mockResolvedValue({ count: 0 });
    prisma.post.findUnique.mockResolvedValue({ id: "p1" });

    await expect(service.softDeletePost("p1", "admin-1")).rejects.toThrow(
      new NotFoundException("动态已删除"),
    );
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("连续两次软删：第二次 404，审计只写一次", async () => {
    prisma.post.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.post.findUnique.mockResolvedValue({ id: "p1" });

    await service.softDeletePost("p1", "admin-1");
    await expect(service.softDeletePost("p1", "admin-2")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0][0].data.actorId).toBe("admin-1");
  });

  describe("softDeleteComment", () => {
    it("一级评论：级联软删未删回复，commentCount 扣本次实际条数并写审计", async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: "c1",
        postId: "p1",
        parentId: null,
      });
      prisma.comment.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });
      prisma.post.updateMany.mockResolvedValue({ count: 1 });

      await service.softDeleteComment("c1", "admin-1");

      const [selfCall, replyCall] = prisma.comment.updateMany.mock.calls.map(
        (c) => c[0],
      );
      expect(selfCall.where).toEqual({ id: "c1", deletedAt: null });
      expect(selfCall.data.deletedBy).toBe(CommunityDeletedBy.admin);
      expect(selfCall.data.deletedAt).toBeInstanceOf(Date);
      expect(replyCall.where).toEqual({ parentId: "c1", deletedAt: null });
      expect(replyCall.data.deletedBy).toBe(CommunityDeletedBy.admin);

      expect(prisma.post.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", commentCount: { gte: 3 } },
        data: { commentCount: { decrement: 3 } },
      });
      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      expect(auditLogCreate).toHaveBeenCalledWith({
        data: {
          actorType: "admin",
          actorId: "admin-1",
          action: "soft_delete_comment",
          targetType: "comment",
          targetId: "c1",
        },
      });
    });

    it("二级回复：不级联，只扣 1", async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: "r1",
        postId: "p1",
        parentId: "c1",
      });
      prisma.comment.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.post.updateMany.mockResolvedValue({ count: 1 });

      await service.softDeleteComment("r1", "admin-1");

      expect(prisma.comment.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", commentCount: { gte: 1 } },
        data: { commentCount: { decrement: 1 } },
      });
      expect(auditLogCreate).toHaveBeenCalledTimes(1);
    });

    it("commentCount 不足时兜底归 0，不出现负数", async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: "c1",
        postId: "p1",
        parentId: null,
      });
      prisma.comment.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });
      prisma.post.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await service.softDeleteComment("c1", "admin-1");

      expect(prisma.post.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: "p1", commentCount: { lt: 3 } },
        data: { commentCount: 0 },
      });
    });

    it("评论不存在 → 404 评论不存在，不扣减、不写审计", async () => {
      prisma.comment.findUnique.mockResolvedValue(null);

      await expect(service.softDeleteComment("nope", "admin-1")).rejects.toThrow(
        new NotFoundException("评论不存在"),
      );
      expect(prisma.comment.updateMany).not.toHaveBeenCalled();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("已删除（更新 0 行）→ 404 评论已删除，不扣减、不写审计", async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: "c1",
        postId: "p1",
        parentId: null,
      });
      prisma.comment.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.softDeleteComment("c1", "admin-1")).rejects.toThrow(
        new NotFoundException("评论已删除"),
      );
      expect(prisma.comment.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });
  });

  describe("listPosts", () => {
    it("无 q 时 where 仅 deletedAt:null，按 createdAt desc 分页", async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);

      const result = await service.listPosts({});

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("q 时 OR 匹配 body 与 author.nickname（insensitive）", async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);

      await service.listPosts({ q: "徒步", page: 2, pageSize: 10 });

      const arg = prisma.post.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({
        deletedAt: null,
        OR: [
          { body: { contains: "徒步", mode: "insensitive" } },
          { author: { nickname: { contains: "徒步", mode: "insensitive" } } },
        ],
      });
      expect(arg.skip).toBe(10);
      expect(arg.take).toBe(10);
    });
  });

  describe("listComments", () => {
    it("动态不存在 → 404", async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.listComments("nope", {})).rejects.toThrow(
        new NotFoundException("动态不存在"),
      );
    });

    it("动态已删 → 404", async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: "p1",
        deletedAt: new Date(),
      });
      await expect(service.listComments("p1", {})).rejects.toThrow(
        new NotFoundException("动态已删除"),
      );
    });

    it("仅拉取未删一级评论并带齐未删二级，DTO 无 likedByMe", async () => {
      prisma.post.findUnique.mockResolvedValue({ id: "p1", deletedAt: null });
      const createdAt = new Date("2026-11-02T00:00:00.000Z");
      prisma.comment.findMany.mockResolvedValue([
        {
          id: "c1",
          postId: "p1",
          parentId: null,
          body: "根评",
          imageUrl: null,
          likeCount: 0,
          createdAt,
          author: { id: "u1", nickname: "甲", avatarUrl: null },
          replyToAuthor: null,
          replies: [
            {
              id: "c2",
              postId: "p1",
              parentId: "c1",
              body: "回复",
              imageUrl: null,
              likeCount: 0,
              createdAt,
              author: { id: "u2", nickname: "乙", avatarUrl: null },
              replyToAuthor: {
                id: "u1",
                nickname: "甲",
                avatarUrl: null,
              },
            },
          ],
        },
      ]);
      prisma.comment.count.mockResolvedValue(1);

      const result = await service.listComments("p1", { page: 1, pageSize: 20 });

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { postId: "p1", parentId: null, deletedAt: null },
        }),
      );
      expect(result.total).toBe(1);
      expect(result.items[0]).not.toHaveProperty("likedByMe");
      expect(result.items[0].replies[0]).not.toHaveProperty("likedByMe");
      expect(result.items[0].replies[0].body).toBe("回复");
    });
  });

  describe("getPost", () => {
    it("未删动态返回 Admin DTO（无 likedByMe）", async () => {
      const createdAt = new Date("2026-11-01T00:00:00.000Z");
      prisma.post.findUnique.mockResolvedValue({
        id: "p1",
        body: "hello",
        likeCount: 1,
        commentCount: 2,
        deletedAt: null,
        createdAt,
        author: { id: "u1", nickname: "小明", avatarUrl: null },
        images: [],
        activityLinks: [],
      });

      const dto = await service.getPost("p1");

      expect(dto).toMatchObject({
        id: "p1",
        body: "hello",
        author: { id: "u1", nickname: "小明", avatarUrl: null },
        likeCount: 1,
        commentCount: 2,
      });
      expect(dto).not.toHaveProperty("likedByMe");
      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: "p1" },
        include: POST_INCLUDE,
      });
    });

    it("不存在 → 404 动态不存在", async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getPost("nope")).rejects.toThrow(
        new NotFoundException("动态不存在"),
      );
    });

    it("已删 → 404 动态已删除", async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: "p1",
        deletedAt: new Date(),
        body: "",
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        author: { id: "u1", nickname: null, avatarUrl: null },
        images: [],
        activityLinks: [],
      });
      await expect(service.getPost("p1")).rejects.toThrow(
        new NotFoundException("动态已删除"),
      );
    });
  });
});
