import { FeeType } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import { ACTIVITY_CATEGORIES } from "../activity-categories";

export class UpsertActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(ACTIVITY_CATEGORIES, { message: "分类不在可选列表中" })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rules?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  /** 报名截止；省略时服务端默认用 startAt */
  @IsOptional()
  @IsISO8601()
  registrationDeadlineAt?: string;

  @IsOptional()
  @IsBoolean()
  allowUserCancel?: boolean;

  /** 可退款预留；P0 不走支付 */
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  placeLat?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  placeLng?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  feeNote?: string;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
