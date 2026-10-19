import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListPublicActivitiesQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  /** asc | desc；省略时按 sort 字段默认（startAt→asc，publishedAt→desc） */
  @IsOptional()
  @IsString()
  order?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
