import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListMyRegistrationsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  /** 按活动筛选（详情页判断是否已报名） */
  @IsOptional()
  @IsString()
  activityId?: string;

  /** 发起人名单按签到状态筛选 */
  @IsOptional()
  @IsIn(["true", "false"])
  checkedIn?: string;

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
