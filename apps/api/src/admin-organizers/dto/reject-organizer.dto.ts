import { IsNotEmpty, IsString } from "class-validator";

export class RejectOrganizerDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
