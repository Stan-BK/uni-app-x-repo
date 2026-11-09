<template>
  <view class="page page-l2 detail-page" :class="{ 'detail-page--with-bar': showActionBar }">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!activity" class="state">活动不存在或无权查看</view>
    <view v-else class="card">
      <image
        v-if="activity.coverUrl"
        class="cover"
        :src="activity.coverUrl"
        mode="aspectFill"
      />
      <text class="title">{{ activity.title || "未命名活动" }}</text>
      <text class="badge ed-tag" :class="lifecycleTagClass(activity.lifecycle)">{{
        lifecycleLabel(activity.lifecycle)
      }}</text>

      <view class="block">
        <text class="label">分类</text>
        <text class="value">{{ activity.category || "—" }}</text>
      </view>
      <view class="block">
        <text class="label">地点</text>
        <text class="value">{{ activity.place || "—" }}</text>
        <text
          v-if="activity.placeLat != null && activity.placeLng != null"
          class="coord"
        >
          {{ activity.placeLat.toFixed(5) }}, {{ activity.placeLng.toFixed(5) }}
        </text>
      </view>
      <view class="block">
        <text class="label">时间</text>
        <text class="value">{{ formatRange(activity.startAt, activity.endAt) }}</text>
      </view>
      <view class="block">
        <text class="label">名额</text>
        <text class="value">{{ activity.capacity }}</text>
      </view>
      <view class="block">
        <text class="label">费用</text>
        <text class="value">{{ feeText(activity) }}</text>
      </view>
      <view class="block">
        <text class="label">活动须知</text>
        <text class="value rules">{{ activity.rules || "—" }}</text>
      </view>
      <view v-if="activity.cancelReason" class="block">
        <text class="label">取消原因</text>
        <text class="value">{{ activity.cancelReason }}</text>
      </view>
      <view v-if="activity.removeReason" class="block">
        <text class="label">下架原因</text>
        <text class="value">{{ activity.removeReason }}</text>
      </view>

      <view
        v-if="activityId"
        class="people-block"
        hover-class="none"
        @click="goRegistrations"
      >
        <view class="section-head">
          <image
            class="section-ico"
            src="/static/ico/people-title.png"
            mode="aspectFit"
          />
          <text class="section-title">报名名单</text>
          <text class="attendees-quota">{{ confirmedCount }}/{{ activity.capacity }}</text>
        </view>
        <view v-if="people.length" class="people-row">
          <scroll-view
            class="attendees-scroll"
            scroll-x
            :show-scrollbar="false"
            enable-flex
          >
            <view class="attendees">
              <view
                v-for="person in people"
                :key="person.id"
                class="attendee"
              >
                <image
                  v-if="personAvatar(person)"
                  class="attendee-avatar"
                  :src="personAvatar(person)"
                  mode="aspectFill"
                />
                <view v-else class="attendee-avatar attendee-fallback">
                  <view class="attendee-head" />
                  <view class="attendee-body" />
                </view>
                <text class="attendee-name">{{ personName(person) }}</text>
              </view>
            </view>
          </scroll-view>
        </view>
        <text v-else class="people-empty">暂无报名，点此查看名单</text>
      </view>
    </view>

    <view v-if="showActionBar" class="action-bar">
      <view class="action-row">
        <template v-if="isDraft">
          <button
            class="ed-btn-secondary action-btn"
            hover-class="none"
            :disabled="acting"
            @click="goEdit"
          >
            编辑
          </button>
          <button
            v-if="user.canPublish"
            class="ed-btn action-btn action-btn--primary"
            hover-class="none"
            :disabled="acting"
            @click="onPublish"
          >
            发布
          </button>
        </template>
        <template v-else-if="isPublished">
          <button
            class="ed-btn-secondary action-btn"
            hover-class="none"
            :disabled="acting"
            @click="onUnpublish"
          >
            退回草稿
          </button>
          <button
            class="action-btn action-btn--danger"
            hover-class="none"
            :disabled="acting"
            @click="onTakeDown"
          >
            下架
          </button>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import {
  cancelActivity,
  getActivity,
  publishActivity,
  unpublishActivity,
  type Activity,
} from "@/api/activities";
import {
  listOrganizerRegistrations,
  type Registration,
} from "@/api/registrations";
import { useUserStore } from "@/stores/user";
import { displayRegistrationName } from "@/utils/registration-display";
import { ApiError } from "@/utils/request";

const user = useUserStore();
const loading = ref(true);
const acting = ref(false);
const activity = ref<Activity | null>(null);
const activityId = ref("");
const people = ref<Registration[]>([]);
const confirmedCount = ref(0);

const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  cancelled: "已取消",
  removed: "已下架",
  ended: "已结束",
};

const ERR_MAP: Record<string, string> = {
  "Only draft can be published": "仅草稿状态可发布",
  "Only published can unpublish to draft": "仅已发布活动可退回草稿",
  "Cannot cancel from current state": "当前状态不可下架",
  "Publish permission frozen": "发布权限已关闭",
};

const isDraft = computed(() => activity.value?.lifecycle === "draft");
const isPublished = computed(() => activity.value?.lifecycle === "published");
const showActionBar = computed(() => isDraft.value || isPublished.value);

function lifecycleLabel(lifecycle: string) {
  return LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
}

function lifecycleTagClass(lifecycle: string) {
  if (lifecycle === "published") return "ed-tag-confirmed";
  if (lifecycle === "draft") return "ed-tag-pending";
  return "ed-tag-muted";
}

function formatRange(start?: string | null, end?: string | null) {
  const fmt = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function feeText(a: Activity) {
  if (a.feeType === "free" || !a.feeCents) return "免费";
  return `¥${(a.feeCents / 100).toFixed(2)}`;
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return ERR_MAP[e.message] ?? e.message;
  if (e instanceof Error) return ERR_MAP[e.message] ?? e.message;
  return "操作失败";
}

function goEdit() {
  if (!activityId.value) return;
  uni.navigateTo({
    url: `/pages/organizer/create?id=${encodeURIComponent(activityId.value)}`,
  });
}

function personName(person: Registration) {
  return displayRegistrationName(person);
}

function personAvatar(person: Registration) {
  return person.avatarUrl?.trim() || "";
}

function goRegistrations() {
  if (!activityId.value) return;
  uni.navigateTo({
    url: `/pages/organizer/registrations?activityId=${encodeURIComponent(activityId.value)}`,
  });
}

async function onPublish() {
  if (!activityId.value || acting.value) return;
  if (!user.canPublish) {
    uni.showToast({ title: "发布权限已关闭", icon: "none" });
    return;
  }
  acting.value = true;
  try {
    activity.value = await publishActivity(activityId.value);
    uni.showToast({ title: "已发布", icon: "success" });
    await loadPeople(activityId.value);
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    acting.value = false;
  }
}

async function onUnpublish() {
  if (!activityId.value || acting.value) return;
  const res = await uni.showModal({
    title: "退回草稿",
    content: "退回后活动将下架，已确认报名会被取消。确定退回草稿？",
  });
  if (!res.confirm) return;
  acting.value = true;
  try {
    activity.value = await unpublishActivity(activityId.value);
    uni.showToast({ title: "已退回草稿", icon: "success" });
    await loadPeople(activityId.value);
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    acting.value = false;
  }
}

/** 所有者「下架」走取消活动（cancelled），与运营 removed 区分。 */
async function onTakeDown() {
  if (!activityId.value || acting.value) return;
  const res = await uni.showModal({
    title: "下架活动",
    content: "下架后不可再上架，已确认报名会被取消。确定下架该活动？",
  });
  if (!res.confirm) return;
  acting.value = true;
  try {
    activity.value = await cancelActivity(activityId.value);
    uni.showToast({ title: "已下架", icon: "success" });
    await loadPeople(activityId.value);
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    acting.value = false;
  }
}

async function loadPeople(id: string) {
  try {
    const res = await listOrganizerRegistrations(id, {
      page: 1,
      pageSize: 20,
      status: "confirmed",
    });
    people.value = res.items ?? [];
    confirmedCount.value = res.total ?? people.value.length;
  } catch {
    people.value = [];
    confirmedCount.value = 0;
  }
}

async function load(id: string) {
  loading.value = true;
  people.value = [];
  confirmedCount.value = 0;
  try {
    activity.value = await getActivity(id);
    await loadPeople(id);
  } catch (e) {
    activity.value = null;
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    loading.value = false;
  }
}

onLoad((query) => {
  const id = String(query?.id ?? "").trim();
  activityId.value = id;
  if (!id) {
    loading.value = false;
    activity.value = null;
  }
});

onShow(() => {
  void user.refreshIdentity().catch(() => {
    /* 网络失败时保留本地态 */
  });
  if (activityId.value) void load(activityId.value);
});
</script>

<style scoped lang="scss">
.detail-page--with-bar {
  padding-bottom: calc(168rpx + env(safe-area-inset-bottom));
}

.state {
  margin-top: 24rpx;
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.card {
  margin-top: 24rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
}

.cover {
  width: 100%;
  height: 280rpx;
  border-radius: $ed-radius-card;
  margin-bottom: 20rpx;
  background: $ed-color-border;
}

.title {
  display: block;
  font-size: 38rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 12rpx;
}

.badge {
  margin-bottom: 24rpx;
}

.block {
  margin-bottom: 20rpx;
}

.label {
  display: block;
  font-size: 22rpx;
  color: $ed-color-text-muted;
  margin-bottom: 6rpx;
}

.value {
  display: block;
  font-size: 28rpx;
  color: $ed-color-text;
  line-height: 1.5;
  white-space: pre-wrap;
}

.coord {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.rules {
  white-space: pre-wrap;
}

.people-block {
  margin: 8rpx 0 16rpx;
  padding-top: 8rpx;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
}

.section-ico {
  width: 56rpx;
  height: 44rpx;
  flex-shrink: 0;
}

.section-title {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.3;
}

.attendees-quota {
  font-size: 24rpx;
  color: $ed-color-text-muted;
}

.people-row {
  position: relative;
  display: flex;
  align-items: center;
}

.attendees-scroll {
  flex: 1;
  min-width: 0;
  height: 140rpx;
  white-space: nowrap;
}

.attendees-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.attendees {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  height: 140rpx;
}

.attendee {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 132rpx;
  height: 140rpx;
  flex-shrink: 0;
}

.attendee-avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $ed-color-brand-soft;
  border: 1rpx solid $ed-color-border;
  box-sizing: border-box;
}

.attendee-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.attendee-head {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 6rpx;
}

.attendee-body {
  width: 52rpx;
  height: 22rpx;
  border-radius: 26rpx 26rpx 0 0;
  background: $ed-color-brand;
}

.attendee-name {
  margin-top: 8rpx;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-text;
  line-height: 1.3;
}

.people-empty {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-muted;
  padding: 8rpx 0 12rpx;
}

.action-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  padding: 18rpx $ed-space-page-x calc(18rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: $ed-color-surface;
  border-top: 1rpx solid $ed-color-border;
}

.action-row {
  display: flex;
  gap: 16rpx;
}

.action-row button {
  margin: 0;
  font-weight: 600;
}

.action-btn {
  flex: 1;
  padding: 0;
  height: 88rpx;
  font-size: 28rpx;
  line-height: 88rpx;
}

.action-btn--primary {
  flex: 1.35;
}

.action-btn--danger {
  flex: 1;
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
  border: none;
  border-radius: $ed-radius-pill;
}

.action-btn--danger::after {
  border: none;
}

button[disabled] {
  opacity: 0.5;
}
</style>
