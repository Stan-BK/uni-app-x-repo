import { LikeTargetType as PrismaLikeTargetType } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * 批量查询当前用户在一组目标上的点赞（单次查询，避免列表 N+1）。
 * 未登录/无目标时直接返回空集，不打库。
 */
export async function findLikedTargetIds(
  prisma: Pick<PrismaService, "like">,
  userId: string | undefined,
  targetType: PrismaLikeTargetType,
  targetIds: string[],
): Promise<Set<string>> {
  if (!userId || targetIds.length === 0) return new Set();
  const rows = await prisma.like.findMany({
    where: { userId, targetType, targetId: { in: targetIds } },
    select: { targetId: true },
  });
  return new Set(rows.map((r) => r.targetId));
}
