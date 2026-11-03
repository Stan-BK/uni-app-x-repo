import { IsOptional, IsString, MaxLength } from "class-validator";
import { COMMUNITY_COMMENT_BODY_MAX } from "@activity/shared";

export class CreateCommentDto {
  /** trim 后可为空串（仅当有图）；业务规则由 CommentsService 兜底 */
  @IsOptional()
  @IsString()
  @MaxLength(COMMUNITY_COMMENT_BODY_MAX * 2)
  body?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** 可指向一级或二级评论；二级会被服务端改挂到一级祖先 */
  @IsOptional()
  @IsString()
  parentId?: string;
}
