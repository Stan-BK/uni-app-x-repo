import { LikeTargetType } from "@activity/shared";
import { IsIn, IsString } from "class-validator";

/** 点赞 / 取消点赞的统一返回：以服务端最新计数为准 */
export type LikeResultDto = {
  liked: boolean;
  likeCount: number;
};

/** POST / DELETE /community/likes 请求体 */
export class LikeTargetDto {
  @IsIn(Object.values(LikeTargetType))
  targetType!: LikeTargetType;

  @IsString()
  targetId!: string;
}
