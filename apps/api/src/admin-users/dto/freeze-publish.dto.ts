import { IsNotEmpty, IsString } from "class-validator";

export class FreezePublishDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
