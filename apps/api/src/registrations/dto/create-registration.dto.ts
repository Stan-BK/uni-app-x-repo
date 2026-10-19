import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateRegistrationDto {
  @IsString()
  activityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  name!: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;
}
