import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentAdminPayload = {
  adminId: string;
  role: string;
};

export const CurrentAdmin = createParamDecorator(
  (data: keyof CurrentAdminPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ admin?: CurrentAdminPayload }>();
    const admin = req.admin;
    if (!admin) return undefined;
    return data ? admin[data] : admin;
  },
);
