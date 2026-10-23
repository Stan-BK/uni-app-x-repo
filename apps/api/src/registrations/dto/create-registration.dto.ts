import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { PHONE_PATTERN, REAL_NAME_MAX_LENGTH } from "@activity/shared";

export class CreateRegistrationDto {
  @IsString()
  activityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(REAL_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  @Matches(PHONE_PATTERN)
  phone!: string;
}
