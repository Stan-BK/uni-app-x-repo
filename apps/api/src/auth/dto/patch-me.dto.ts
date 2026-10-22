import { IsOptional, IsString, MaxLength } from "class-validator";
import { NICKNAME_MAX_LENGTH } from "@activity/shared";

export class PatchMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(NICKNAME_MAX_LENGTH)
  nickname?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
