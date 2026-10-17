import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ApplyOrganizerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
