import { IsNotEmpty, IsString } from "class-validator";

export class FreezeOrganizerDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
