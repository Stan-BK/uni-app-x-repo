export const CheckInErrorCode = {
  TokenInvalid: "CHECK_IN_TOKEN_INVALID",
  TokenExpired: "CHECK_IN_TOKEN_EXPIRED",
  NotAllowed: "CHECK_IN_NOT_ALLOWED",
  Forbidden: "CHECK_IN_FORBIDDEN",
  AlreadyDone: "CHECK_IN_ALREADY_DONE",
  CancelNotAllowed: "CHECK_IN_CANCEL_NOT_ALLOWED",
  RegistrationNotFound: "REGISTRATION_NOT_FOUND",
} as const;
export type CheckInErrorCode =
  (typeof CheckInErrorCode)[keyof typeof CheckInErrorCode];
