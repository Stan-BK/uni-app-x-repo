import { Transform } from "class-transformer";
import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { AuditAction, AuditTargetType } from "@activity/shared";

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export class ListAuditLogsQuery {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(Object.values(AuditAction))
  action?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(Object.values(AuditTargetType))
  targetType?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  targetId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  from?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
