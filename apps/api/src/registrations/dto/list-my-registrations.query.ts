import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListMyRegistrationsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  /** 按活动筛选（详情页判断是否已报名） */
  @IsOptional()
  @IsString()
  activityId?: string;

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
