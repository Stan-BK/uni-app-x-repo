import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import {
  NICKNAME_MAX_LENGTH,
  PHONE_PATTERN,
  REAL_NAME_MAX_LENGTH,
} from "@activity/shared";

export class PatchMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(NICKNAME_MAX_LENGTH)
  nickname?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(REAL_NAME_MAX_LENGTH)
  realName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== "")
  @IsString()
  @Matches(PHONE_PATTERN)
  phone?: string | null;
}
