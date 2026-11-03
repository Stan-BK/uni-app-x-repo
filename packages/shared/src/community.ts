export const CommunityPostSort = {
  Latest: "latest",
  Hot: "hot",
} as const;
export type CommunityPostSort =
  (typeof CommunityPostSort)[keyof typeof CommunityPostSort];

export const CommunityDeletedBy = {
  Author: "author",
  Admin: "admin",
} as const;
export type CommunityDeletedBy =
  (typeof CommunityDeletedBy)[keyof typeof CommunityDeletedBy];

/** 规格 §3.6 */
export const COMMUNITY_HOT_HALF_LIFE_HOURS = 48;
export const COMMUNITY_HOT_GRAVITY = 1.5;
export const COMMUNITY_HOT_AGE_OFFSET_HOURS = 2;

export const COMMUNITY_POST_BODY_MAX = 200;
export const COMMUNITY_POST_IMAGES_MAX = 3;
export const COMMUNITY_POST_ACTIVITIES_MAX = 3;
export const COMMUNITY_COMMENT_BODY_MAX = 100;
export const COMMUNITY_COMMENT_IMAGES_MAX = 1;

export const LikeTargetType = {
  Post: "post",
  Comment: "comment",
} as const;
export type LikeTargetType =
  (typeof LikeTargetType)[keyof typeof LikeTargetType];

export const NotificationType = {
  LikePost: "like_post",
  LikeComment: "like_comment",
  CommentPost: "comment_post",
  ReplyComment: "reply_comment",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];
