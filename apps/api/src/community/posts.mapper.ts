import { Prisma } from "@prisma/client";

export const POST_INCLUDE = {
  author: { select: { id: true, nickname: true, avatarUrl: true } },
  images: { orderBy: { sortOrder: "asc" } },
  activityLinks: {
    orderBy: { sortOrder: "asc" },
    include: { activity: { select: { id: true, title: true } } },
  },
} satisfies Prisma.PostInclude;

export type PostRow = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>;

export const DEFAULT_AUTHOR_NAME = "用户";

export function authorDisplayName(nickname: string | null | undefined) {
  const name = nickname?.trim();
  return name ? name : DEFAULT_AUTHOR_NAME;
}

export function mapPost(row: PostRow, opts: { likedByMe?: boolean } = {}) {
  return {
    id: row.id,
    body: row.body,
    author: {
      id: row.author.id,
      nickname: authorDisplayName(row.author.nickname),
      avatarUrl: row.author.avatarUrl,
    },
    images: row.images.map((img) => ({
      url: img.url,
      sortOrder: img.sortOrder,
    })),
    activities: row.activityLinks.map((link) => ({
      id: link.activity.id,
      title: link.activity.title,
    })),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    likedByMe: opts.likedByMe ?? false,
    createdAt: row.createdAt.toISOString(),
  };
}

export type PostDto = ReturnType<typeof mapPost>;
