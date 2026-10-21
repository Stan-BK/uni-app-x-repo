export const BusinessEvent = {
  UserLogin: "user.login",
  ActivityPublish: "activity.publish",
  RegistrationCreate: "registration.create",
} as const;
export type BusinessEvent =
  (typeof BusinessEvent)[keyof typeof BusinessEvent];
