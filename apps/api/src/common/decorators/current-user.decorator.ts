import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentUserPayload = {
  userId: string;
};

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: CurrentUserPayload }>();
    const user = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
