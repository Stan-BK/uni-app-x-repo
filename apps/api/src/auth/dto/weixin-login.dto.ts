import { IsNotEmpty, IsString } from "class-validator";

export class WeixinLoginDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
