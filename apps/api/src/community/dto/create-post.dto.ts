import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  COMMUNITY_POST_ACTIVITIES_MAX,
  COMMUNITY_POST_BODY_MAX,
  COMMUNITY_POST_IMAGES_MAX,
} from "@activity/shared";

export class CreatePostDto {
  /** trim 后可为空串（仅当有图）；业务规则由 PostsService 兜底 */
  @IsOptional()
  @IsString()
  @MaxLength(COMMUNITY_POST_BODY_MAX * 2)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMMUNITY_POST_IMAGES_MAX)
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMMUNITY_POST_ACTIVITIES_MAX)
  @IsString({ each: true })
  activityIds?: string[];
}
