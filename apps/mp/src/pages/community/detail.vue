<template>
  <view class="page page-l2">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="needLogin" class="state empty">
      <text class="empty-title">登录后查看动态</text>
      <button class="ed-btn" @click="onLogin">登录微信账号</button>
    </view>
    <view v-else-if="errorText" class="state empty">
      <text class="empty-title">{{ deleted ? "动态已删除" : "加载失败" }}</text>
      <text class="empty-desc">{{ errorText }}</text>
      <button class="ed-btn" @click="goCommunity">回到社区</button>
    </view>
    <template v-else-if="post">
      <view class="hero">
        <view class="hero-deco" aria-hidden="true" />
        <view class="head">
          <view class="avatar-ring">
            <image
              v-if="post.author.avatarUrl"
              class="avatar"
              :src="post.author.avatarUrl"
              mode="aspectFill"
            />
            <view v-else class="avatar avatar-fallback">
              <view class="avatar-head" />
              <view class="avatar-body" />
            </view>
          </view>
          <view class="head-meta">
            <text class="nickname">{{ post.author.nickname }}</text>
            <text class="time">{{ formatPostTime(post.createdAt) }}</text>
          </view>
          <view v-if="isAuthor" class="hero-del" hover-class="hero-del-pressed" @click="onDelete">
            删除
          </view>
        </view>

        <text v-if="post.body" class="body">{{ post.body }}</text>

        <view v-if="post.images.length" class="images" :class="imageLayoutClass">
          <image
            v-for="(img, index) in post.images"
            :key="`${img.url}-${index}`"
            class="img"
            :src="img.url"
            mode="aspectFill"
            @click="previewImage(index)"
          />
        </view>

        <view v-if="post.activities.length" class="tags">
          <view
            v-for="act in post.activities"
            :key="act.id"
            class="tag"
            hover-class="tag-pressed"
            @click="goActivity(act.id)"
          >
            <EdIcon name="calendar" size="24rpx" />
            <text class="tag-text">{{ act.title }}</text>
          </view>
        </view>
      </view>

      <view class="engage">
        <view
          class="engage-item"
          :class="{ 'is-on': post.likedByMe }"
          hover-class="engage-pressed"
          @click="onTogglePostLike"
        >
          <EdIcon :name="post.likedByMe ? 'like-active' : 'like'" size="36rpx" />
          <text class="engage-label">{{ post.likedByMe ? "已赞" : "点赞" }}</text>
          <text class="engage-count">{{ post.likeCount }}</text>
        </view>
        <view class="engage-item" hover-class="engage-pressed" @click="onReplyPost">
          <EdIcon name="comment" size="36rpx" />
          <text class="engage-label">评论</text>
          <text class="engage-count">{{ post.commentCount }}</text>
        </view>
        <button class="engage-item share-btn" open-type="share" hover-class="engage-pressed">
          <EdIcon name="share" size="36rpx" />
          <text class="engage-label">分享</text>
        </button>
      </view>

      <view class="card comments">
        <view class="section-head">
          <view class="section-ico">
            <EdIcon name="comment" size="30rpx" />
          </view>
          <text class="section-title">评论</text>
          <text class="section-count">{{ post.commentCount }}</text>
        </view>
        <view v-if="commentsLoading && !comments.length" class="c-state">加载中…</view>
        <view v-else-if="commentsError && !comments.length" class="c-state" @click="loadComments({ reset: true })">
          {{ commentsError }}，点击重试
        </view>
        <view v-else-if="!comments.length" class="c-state">还没有评论，来说点什么吧</view>
        <view v-else class="c-list">
          <view v-for="c in comments" :key="c.id" class="c-thread">
            <view
              :id="`comment-${c.id}`"
              class="c-item"
              :class="{ 'is-hit': highlightId === c.id }"
            >
              <image
                v-if="c.author.avatarUrl"
                class="c-avatar"
                :src="c.author.avatarUrl"
                mode="aspectFill"
              />
              <view v-else class="c-avatar avatar-fallback">
                <view class="avatar-head sm" />
                <view class="avatar-body sm" />
              </view>
              <view class="c-main">
                <view class="c-meta">
                  <text class="c-name">{{ c.author.nickname }}</text>
                  <text class="c-time">{{ formatPostTime(c.createdAt) }}</text>
                </view>
                <text v-if="c.body" class="c-body">{{ c.body }}</text>
                <image
                  v-if="c.imageUrl"
                  class="c-img"
                  :src="c.imageUrl"
                  mode="aspectFill"
                  @click="previewCommentImage(c.imageUrl)"
                />
                <view class="c-actions">
                  <view
                    class="c-act"
                    :class="{ 'is-on': c.likedByMe }"
                    hover-class="c-act-pressed"
                    @click="onToggleCommentLike(c)"
                  >
                    <EdIcon :name="c.likedByMe ? 'like-active' : 'like'" size="26rpx" />
                    <text class="c-act-text">{{ c.likeCount || "赞" }}</text>
                  </view>
                  <view class="c-act" hover-class="c-act-pressed" @click="onReply(c)">
                    <EdIcon name="reply" size="26rpx" />
                    <text class="c-act-text">回复</text>
                  </view>
                  <view v-if="isMine(c)" class="c-act c-del" @click="onDeleteComment(c)">
                    <text class="c-act-text">删除</text>
                  </view>
                </view>
              </view>
            </view>

            <view v-if="c.replies.length" class="replies">
              <view
                v-for="r in c.replies"
                :id="`comment-${r.id}`"
                :key="r.id"
                class="c-item reply"
                :class="{ 'is-hit': highlightId === r.id }"
              >
                <image
                  v-if="r.author.avatarUrl"
                  class="c-avatar sm"
                  :src="r.author.avatarUrl"
                  mode="aspectFill"
                />
                <view v-else class="c-avatar sm avatar-fallback">
                  <view class="avatar-head xs" />
                  <view class="avatar-body xs" />
                </view>
                <view class="c-main">
                  <view class="c-meta">
                    <text class="c-name">{{ r.author.nickname }}</text>
                    <text class="c-time">{{ formatPostTime(r.createdAt) }}</text>
                  </view>
                  <text v-if="r.body" class="c-body">{{ r.body }}</text>
                  <image
                    v-if="r.imageUrl"
                    class="c-img"
                    :src="r.imageUrl"
                    mode="aspectFill"
                    @click="previewCommentImage(r.imageUrl)"
                  />
                  <view class="c-actions">
                    <view
                      class="c-act"
                      :class="{ 'is-on': r.likedByMe }"
                      hover-class="c-act-pressed"
                      @click="onToggleCommentLike(r)"
                    >
                      <EdIcon :name="r.likedByMe ? 'like-active' : 'like'" size="26rpx" />
                      <text class="c-act-text">{{ r.likeCount || "赞" }}</text>
                    </view>
                    <view class="c-act" hover-class="c-act-pressed" @click="onReply(r)">
                      <EdIcon name="reply" size="26rpx" />
                      <text class="c-act-text">回复</text>
                    </view>
                    <view v-if="isMine(r)" class="c-act c-del" @click="onDeleteComment(r)">
                      <text class="c-act-text">删除</text>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view v-if="hasMoreComments" class="c-more" @click="loadComments()">
            {{ commentsLoading ? "加载中…" : "加载更多评论" }}
          </view>
        </view>
      </view>

      <view class="composer-gap" />
      <view class="composer">
        <view v-if="replyTo" class="reply-bar">
          <text class="reply-text">回复 @{{ replyTo.nickname }}</text>
          <text class="reply-cancel" @click="cancelReply">取消</text>
        </view>
        <view v-if="commentImage" class="pending-img">
          <image class="pending-thumb" :src="commentImage" mode="aspectFill" />
          <view class="pending-del" hover-class="none" @click="commentImage = ''">
            <text>×</text>
          </view>
        </view>
        <view class="composer-row">
          <view class="pick" hover-class="none" @click="onPickCommentImage">
            <view class="pick-ico" />
          </view>
          <input
            class="composer-input"
            type="text"
            confirm-type="send"
            :value="commentBody"
            :maxlength="COMMENT_MAX"
            :focus="inputFocus"
            :placeholder="replyTo ? `回复 @${replyTo.nickname}` : '写评论…'"
            placeholder-class="placeholder"
            cursor-spacing="20"
            @input="onCommentInput"
            @focus="inputFocus = true"
            @blur="inputFocus = false"
            @confirm="onSubmitComment"
          />
          <button
            class="send"
            :class="{ 'is-off': !canSend }"
            :loading="sending || uploading"
            hover-class="none"
            @click="onSubmitComment"
          >
            发送
          </button>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { onLoad, onReachBottom, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import { COMMUNITY_COMMENT_BODY_MAX } from "@activity/shared";
import { getPostShareMessage } from "@/adapters/share";
import {
  createCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPost,
  likeCommunityTarget,
  listCommunityComments,
  unlikeCommunityTarget,
  uploadCommunityImage,
  type CommunityComment,
  type CommunityCommentWithReplies,
  type CommunityLikeTargetType,
  type CommunityPost,
} from "@/api/community";
import EdIcon from "@/components/ed-icon/ed-icon.vue";
import { useUserStore } from "@/stores/user";
import { formatPostTime } from "@/utils/community";
import { ApiError } from "@/utils/request";

const COMMENT_MAX = COMMUNITY_COMMENT_BODY_MAX;
const COMMENT_PAGE_SIZE = 20;
/** 深链/发送后定位评论时最多连续翻页数，避免无限请求 */
const LOCATE_MAX_PAGES = 10;

const user = useUserStore();
const postId = ref("");
const post = ref<CommunityPost | null>(null);
const loading = ref(true);
const needLogin = ref(false);
const errorText = ref("");
const deleted = ref(false);

const comments = ref<CommunityCommentWithReplies[]>([]);
const commentsTotal = ref(0);
const commentsLoading = ref(false);
const commentsError = ref("");
let commentPage = 0;
let commentGen = 0;

const commentBody = ref("");
const commentImage = ref("");
const replyTo = ref<{ id: string; nickname: string } | null>(null);
const inputFocus = ref(false);
const sending = ref(false);
const uploading = ref(false);
const highlightId = ref("");
let pendingCommentId = "";
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
const likeBusy = new Set<string>();

const isAuthor = computed(
  () => Boolean(post.value && user.me && user.me.id === post.value.author.id),
);
const hasMoreComments = computed(() => comments.value.length < commentsTotal.value);
const imageLayoutClass = computed(() =>
  post.value ? `count-${Math.min(post.value.images.length, 3)}` : "count-1",
);
const canSend = computed(
  () => Boolean(commentBody.value.trim() || commentImage.value) && !sending.value && !uploading.value,
);

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
  return err instanceof Error ? err.message : "请求失败";
}

function isMine(c: CommunityComment): boolean {
  return Boolean(user.me && user.me.id === c.author.id);
}

function hasComment(id: string): boolean {
  return comments.value.some(
    (c) => c.id === id || c.replies.some((r) => r.id === id),
  );
}

/** 登录闸：未登录弹窗确认；401 时清本地态 */
async function ensureLogin(reason: string): Promise<boolean> {
  if (user.isLoggedIn) return true;
  return user.promptLogin(reason);
}

function handleAuthError(e: unknown): boolean {
  if (e instanceof ApiError && e.status === 401) {
    user.logout();
    needLogin.value = true;
    post.value = null;
    return true;
  }
  return false;
}

async function load() {
  if (!postId.value) {
    loading.value = false;
    errorText.value = "缺少动态参数";
    return;
  }
  // 登录闸：接口需 JWT，分享进入的游客先走登录
  if (!user.isLoggedIn) {
    loading.value = false;
    needLogin.value = true;
    await user.promptLogin("登录后即可查看社区动态");
    if (!user.isLoggedIn) return;
  }
  needLogin.value = false;
  // 再次 onShow（如预览图返回）时保留已有内容，避免闪烁
  const first = !post.value;
  loading.value = first;
  errorText.value = "";
  deleted.value = false;
  try {
    if (!user.me) await user.refreshIdentity().catch(() => undefined);
    post.value = await getCommunityPost(postId.value);
  } catch (e) {
    post.value = null;
    if (!handleAuthError(e)) {
      deleted.value = e instanceof ApiError && e.status === 404;
      errorText.value = deleted.value
        ? "该动态已被删除或不存在"
        : errMessage(e);
    }
  } finally {
    loading.value = false;
  }
  // 评论仅首次进入加载；之后 onShow 只刷新动态计数
  if (first && post.value) {
    const target = pendingCommentId;
    pendingCommentId = "";
    await loadComments({ reset: true, untilId: target });
    if (target) await locateComment(target);
  }
}

async function refreshPost() {
  if (!postId.value) return;
  try {
    post.value = await getCommunityPost(postId.value);
  } catch {
    /* 保留旧值 */
  }
}

async function loadComments(opts: { reset?: boolean; untilId?: string } = {}) {
  if (!postId.value) return;
  if (!opts.reset && commentsLoading.value) return;
  if (opts.reset) {
    commentGen += 1;
    commentPage = 0;
  }
  const gen = commentGen;
  commentsLoading.value = true;
  commentsError.value = "";
  try {
    let guard = 0;
    for (;;) {
      const next = commentPage + 1;
      const res = await listCommunityComments(postId.value, {
        page: next,
        pageSize: COMMENT_PAGE_SIZE,
      });
      if (gen !== commentGen) return;
      comments.value = next === 1 ? res.items : comments.value.concat(res.items);
      commentsTotal.value = res.total;
      commentPage = next;
      guard += 1;
      if (
        !opts.untilId ||
        hasComment(opts.untilId) ||
        comments.value.length >= res.total ||
        guard >= LOCATE_MAX_PAGES
      ) {
        break;
      }
    }
  } catch (e) {
    if (gen !== commentGen) return;
    if (handleAuthError(e)) return;
    commentsError.value = errMessage(e);
  } finally {
    if (gen === commentGen) commentsLoading.value = false;
  }
}

async function locateComment(id: string) {
  if (!hasComment(id)) {
    uni.showToast({ title: "该评论已删除或不存在", icon: "none" });
    return;
  }
  await nextTick();
  setTimeout(() => {
    let top: number | undefined;
    let scrollTop = 0;
    uni
      .createSelectorQuery()
      .select(`#comment-${id}`)
      .boundingClientRect((rect) => {
        if (rect && !Array.isArray(rect)) top = rect.top;
      })
      .selectViewport()
      .scrollOffset((view) => {
        const v = Array.isArray(view) ? view[0] : view;
        scrollTop = v?.scrollTop ?? 0;
      })
      .exec(() => {
        if (typeof top === "number") {
          uni.pageScrollTo({
            scrollTop: Math.max(0, top + scrollTop - 120),
            duration: 250,
          });
        }
      });
    highlightId.value = id;
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightId.value = "";
    }, 2600);
  }, 120);
}

async function onLogin() {
  await user.promptLogin("登录后即可查看社区动态");
  if (user.isLoggedIn) await load();
}

function previewImage(current: number) {
  if (!post.value) return;
  uni.previewImage({ urls: post.value.images.map((i) => i.url), current });
}

function previewCommentImage(url: string) {
  uni.previewImage({ urls: [url], current: url });
}

function goActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${encodeURIComponent(id)}` });
}

function goCommunity() {
  uni.switchTab({ url: "/pages/community/index" });
}

async function onDelete() {
  if (!post.value) return;
  const res = await uni.showModal({
    title: "删除动态",
    content: "删除后无法恢复，确定删除？",
    confirmText: "删除",
  });
  if (!res.confirm) return;
  try {
    await deleteCommunityPost(post.value.id);
    uni.showToast({ title: "已删除", icon: "none" });
    setTimeout(() => {
      uni.navigateBack({ fail: goCommunity });
    }, 500);
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  }
}

/** 通用点赞切换：以服务端返回的 liked/likeCount 为准 */
async function toggleLike(
  type: CommunityLikeTargetType,
  target: { id: string; likedByMe: boolean; likeCount: number },
) {
  const key = `${type}:${target.id}`;
  if (likeBusy.has(key)) return;
  if (!(await ensureLogin("登录后即可点赞"))) return;
  likeBusy.add(key);
  try {
    const res = target.likedByMe
      ? await unlikeCommunityTarget(type, target.id)
      : await likeCommunityTarget(type, target.id);
    target.likedByMe = res.liked;
    target.likeCount = res.likeCount;
  } catch (e) {
    if (!handleAuthError(e)) {
      uni.showToast({ title: errMessage(e), icon: "none" });
    }
  } finally {
    likeBusy.delete(key);
  }
}

function onTogglePostLike() {
  if (post.value) void toggleLike("post", post.value);
}

function onToggleCommentLike(c: CommunityComment) {
  void toggleLike("comment", c);
}

function onReplyPost() {
  replyTo.value = null;
  inputFocus.value = true;
}

function onReply(c: CommunityComment) {
  replyTo.value = { id: c.id, nickname: c.author.nickname };
  inputFocus.value = true;
}

function cancelReply() {
  replyTo.value = null;
}

function onCommentInput(e: Event) {
  commentBody.value =
    (e as unknown as { detail?: { value?: string } }).detail?.value ?? "";
}

function chooseOneImage(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => resolve((res.tempFilePaths as string[])[0] ?? null),
      fail: (err) => {
        const msg = err.errMsg || "";
        if (msg.includes("cancel")) {
          resolve(null);
          return;
        }
        reject(new Error(msg || "选择图片失败"));
      },
    });
  });
}

async function onPickCommentImage() {
  if (uploading.value) return;
  if (!(await ensureLogin("登录后即可评论"))) return;
  uploading.value = true;
  try {
    const path = await chooseOneImage();
    if (!path) return;
    const { url } = await uploadCommunityImage(path);
    commentImage.value = url;
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    uploading.value = false;
  }
}

async function onSubmitComment() {
  if (sending.value || uploading.value || !post.value) return;
  const text = commentBody.value.trim();
  if (!text && !commentImage.value) {
    uni.showToast({ title: "写点什么或添加图片吧", icon: "none" });
    return;
  }
  if (!(await ensureLogin("登录后即可评论"))) return;
  sending.value = true;
  try {
    const created = await createCommunityComment(post.value.id, {
      body: text || undefined,
      imageUrl: commentImage.value || undefined,
      parentId: replyTo.value?.id,
    });
    commentBody.value = "";
    commentImage.value = "";
    replyTo.value = null;
    inputFocus.value = false;
    // 重新拉取并翻页直到新评论出现（一级评论按时间升序排在末尾）
    await Promise.all([
      loadComments({ reset: true, untilId: created.id }),
      refreshPost(),
    ]);
    await locateComment(created.id);
  } catch (e) {
    if (!handleAuthError(e)) {
      uni.showToast({ title: errMessage(e), icon: "none" });
    }
  } finally {
    sending.value = false;
  }
}

async function onDeleteComment(c: CommunityComment) {
  const res = await uni.showModal({
    title: "删除评论",
    content: c.parentId ? "确定删除这条回复？" : "删除后其下回复也会一并删除，确定删除？",
    confirmText: "删除",
  });
  if (!res.confirm) return;
  try {
    await deleteCommunityComment(c.id);
    if (replyTo.value?.id === c.id) replyTo.value = null;
    await Promise.all([loadComments({ reset: true }), refreshPost()]);
    uni.showToast({ title: "已删除", icon: "none" });
  } catch (e) {
    if (!handleAuthError(e)) {
      uni.showToast({ title: errMessage(e), icon: "none" });
    }
  }
}

onLoad((query) => {
  postId.value = String(query?.id ?? "");
  pendingCommentId = String(query?.commentId ?? "");
});

onShow(() => {
  void load();
});

onReachBottom(() => {
  if (hasMoreComments.value) void loadComments();
});

onShareAppMessage(() => {
  if (!post.value) return { title: "社区", path: "/pages/community/index" };
  return getPostShareMessage(post.value);
});
</script>

<style scoped lang="scss">
.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
  margin-top: 24rpx;
}

.hero {
  position: relative;
  overflow: hidden;
  margin-top: 24rpx;
  padding: $ed-space-card;
  background: linear-gradient(160deg, #fffefb 0%, #fdfaf3 58%, #f3f8f2 100%);
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-card;
  box-shadow: 0 4rpx 16rpx rgba(36, 49, 45, 0.06);
}

.hero-deco {
  position: absolute;
  top: -110rpx;
  right: -80rpx;
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(30, 155, 136, 0.14) 0%, rgba(30, 155, 136, 0) 68%);
  pointer-events: none;
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.avatar-ring {
  flex-shrink: 0;
  padding: 4rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $ed-color-brand-soft, rgba(229, 111, 62, 0.24));
}

.avatar {
  display: block;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $ed-color-brand-soft;
}

.avatar-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.avatar-head {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 4rpx;
}

.avatar-body {
  width: 50rpx;
  height: 22rpx;
  border-radius: 25rpx 25rpx 0 0;
  background: $ed-color-brand;
}

.head-meta {
  flex: 1;
  min-width: 0;
}

.hero-del {
  flex-shrink: 0;
  padding: 8rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
  font-size: 22rpx;
  line-height: 1.3;
}

.hero-del-pressed {
  opacity: 0.72;
}

.nickname {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.time {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.body {
  display: block;
  font-size: 30rpx;
  line-height: 1.7;
  color: $ed-color-text;
  word-break: break-all;
  white-space: pre-wrap;
}

.images {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;
}

.img {
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.images.count-1 .img {
  width: 100%;
  height: 440rpx;
  border-radius: 24rpx;
}

.images.count-2 .img {
  width: calc(50% - 6rpx);
  height: 300rpx;
}

.images.count-3 .img {
  width: calc(33.33% - 8rpx);
  height: 210rpx;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  max-width: 100%;
  padding: 10rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.tag-pressed {
  background: #c4ece2;
}

.tag-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 1.4;
}

.engage {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  margin-top: 24rpx;
  padding: 20rpx;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-card;
  box-shadow: 0 2rpx 10rpx rgba(36, 49, 45, 0.05);
}

.engage-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  height: 124rpx;
  margin: 0;
  padding: 0;
  background: $ed-color-canvas;
  border: none;
  border-radius: 24rpx;
  line-height: 1.2;
  color: $ed-color-text-secondary;
  transition: background-color 0.2s $ed-motion-ease, color 0.2s $ed-motion-ease;
}

.engage-item::after {
  border: none;
}

.engage-pressed {
  background: $ed-color-btn-secondary;
}

.engage-item.is-on {
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.engage-label {
  font-size: 24rpx;
  color: currentColor;
}

.engage-count {
  font-size: 26rpx;
  font-weight: 700;
  color: currentColor;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 8rpx;
}

.section-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.section-count {
  padding: 2rpx 16rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-btn-secondary;
  font-size: 22rpx;
  font-weight: 600;
  color: $ed-color-text-secondary;
}

.c-state {
  padding: 48rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

.c-thread {
  padding: 28rpx 0;
  border-bottom: 1rpx solid $ed-color-border;
}

.c-thread:last-of-type {
  border-bottom: none;
}

.c-item {
  display: flex;
  gap: 16rpx;
  border-radius: $ed-radius-tag;
  transition: background-color 0.4s ease;
}

.c-item.is-hit {
  background: $ed-color-brand-soft;
  box-shadow: 0 0 0 10rpx $ed-color-brand-soft;
}

.c-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $ed-color-brand-soft;
}

.c-avatar.sm {
  width: 48rpx;
  height: 48rpx;
}

.avatar-head.sm {
  width: 20rpx;
  height: 20rpx;
  margin-bottom: 3rpx;
}

.avatar-body.sm {
  width: 36rpx;
  height: 16rpx;
}

.avatar-head.xs {
  width: 14rpx;
  height: 14rpx;
  margin-bottom: 2rpx;
}

.avatar-body.xs {
  width: 26rpx;
  height: 11rpx;
}

.c-main {
  flex: 1;
  min-width: 0;
}

.c-meta {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.c-name {
  font-size: 26rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.c-time {
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.c-body {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: $ed-color-text;
  word-break: break-all;
  white-space: pre-wrap;
}

.c-img {
  display: block;
  margin-top: 12rpx;
  width: 220rpx;
  height: 220rpx;
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.c-actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 12rpx;
}

.c-act {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  height: 48rpx;
  padding: 0 16rpx;
  border-radius: $ed-radius-pill;
  font-size: 24rpx;
  color: $ed-color-text-muted;
}

.c-act-pressed {
  background: $ed-color-canvas;
}

.c-act.is-on {
  color: $ed-color-brand-strong;
}

.c-act.is-on .c-act-text {
  font-weight: 700;
}

.c-act-text {
  font-size: 24rpx;
  color: currentColor;
  line-height: 1;
}

.c-del {
  margin-left: 8rpx;
  color: $ed-color-terracotta;
}

.replies {
  position: relative;
  margin: 18rpx 0 0 80rpx;
  padding: 18rpx 22rpx;
  background: $ed-color-canvas;
  border-radius: $ed-radius-tag;
  border-left: 6rpx solid $ed-color-brand-soft;
}

.replies .c-item + .c-item {
  margin-top: 20rpx;
}

.c-more {
  padding: 24rpx 0 4rpx;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-brand;
}

.composer-gap {
  height: calc(180rpx + env(safe-area-inset-bottom));
}

.composer {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(20rpx + env(safe-area-inset-bottom));
  z-index: 100;
  padding: 18rpx 20rpx;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: 40rpx;
  box-shadow: 0 14rpx 40rpx rgba(36, 49, 45, 0.14);
  box-sizing: border-box;
}

.reply-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4rpx 12rpx;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.reply-cancel {
  color: $ed-color-brand;
}

.pending-img {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 12rpx;
}

.pending-thumb {
  width: 120rpx;
  height: 120rpx;
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.pending-del {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: rgba(36, 49, 45, 0.78);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  line-height: 1;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.pick {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: $ed-color-text-secondary;
}

.pick-ico {
  width: 44rpx;
  height: 44rpx;
  background-color: currentColor;
  -webkit-mask-image: url("/static/ico/camera.svg");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: url("/static/ico/camera.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.composer-input {
  flex: 1;
  min-width: 0;
  height: 76rpx;
  padding: 0 28rpx;
  box-sizing: border-box;
  background: $ed-color-canvas;
  border: 1rpx solid $ed-color-border;
  border-radius: 38rpx;
  font-size: 28rpx;
  color: $ed-color-text;
}

.placeholder {
  color: $ed-color-text-muted;
}

.send {
  flex-shrink: 0;
  height: 76rpx;
  line-height: 76rpx;
  margin: 0;
  padding: 0 36rpx;
  border-radius: 38rpx;
  font-size: 28rpx;
  font-weight: 600;
  background: $ed-color-brand;
  color: #ffffff;
  box-shadow: 0 6rpx 14rpx rgba(30, 155, 136, 0.24);
}

.send::after {
  border: none;
}

.send.is-off {
  opacity: 0.45;
}

.state {
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: 32rpx;
  color: $ed-color-text;
  font-weight: 700;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: $ed-color-text-muted;
  margin-bottom: 40rpx;
}

.empty .ed-btn {
  width: auto;
  margin: 0;
}
</style>
