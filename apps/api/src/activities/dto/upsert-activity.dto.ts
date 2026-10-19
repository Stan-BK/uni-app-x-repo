import { FeeType } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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
  @MaxLength(40)
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

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
