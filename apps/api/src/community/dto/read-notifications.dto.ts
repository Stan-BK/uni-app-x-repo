import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export const READ_NOTIFICATIONS_IDS_MAX = 100;

/** ids 与 all 二选一；all=true 优先 */
export class ReadNotificationsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(READ_NOTIFICATIONS_IDS_MAX)
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
