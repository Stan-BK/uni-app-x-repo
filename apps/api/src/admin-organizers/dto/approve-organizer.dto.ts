import { IsOptional, IsString } from "class-validator";

export class ApproveOrganizerDto {
  @IsOptional()
  @IsString()
  note?: string;
}
