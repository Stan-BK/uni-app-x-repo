/** 点赞 / 取消点赞的统一返回：以服务端最新计数为准 */
export type LikeResultDto = {
  liked: boolean;
  likeCount: number;
};
