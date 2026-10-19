import { Test } from "@nestjs/testing";
import { RegistrationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaRegistrationCancelHook } from "./prisma-registration-cancel.hook";

describe("PrismaRegistrationCancelHook", () => {
  let hook: PrismaRegistrationCancelHook;
  const prisma = {
    registration: { updateMany: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaRegistrationCancelHook,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    hook = moduleRef.get(PrismaRegistrationCancelHook);
  });

  it("cancels all confirmed registrations for activity", async () => {
    prisma.registration.updateMany.mockResolvedValue({ count: 2 });

    await hook.cancelAllForActivity("act-1");

    expect(prisma.registration.updateMany).toHaveBeenCalledOnce();
    const [args] = prisma.registration.updateMany.mock.calls[0] as [
      {
        where: { activityId: string; status: RegistrationStatus };
        data: { status: RegistrationStatus; cancelledAt: Date };
      },
    ];
    expect(args.where).toEqual({
      activityId: "act-1",
      status: RegistrationStatus.confirmed,
    });
    expect(args.data.status).toBe(RegistrationStatus.cancelled);
    expect(args.data.cancelledAt).toBeInstanceOf(Date);
  });
});
