import { IsNotEmpty, IsString } from "class-validator";

export class CheckInWithTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
