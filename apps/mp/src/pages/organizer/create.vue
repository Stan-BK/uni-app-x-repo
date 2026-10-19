<template>
  <view class="page">
    <view class="card">
      <text class="title">{{ editingId ? "编辑活动" : "发布活动" }}</text>
      <text class="desc">填写完整信息后可保存草稿或直接发布。时间请使用 ISO 或本地日期时间字符串。</text>

      <view class="field">
        <text class="label">标题</text>
        <input v-model="form.title" class="input" placeholder="例如：周末城市徒步" />
      </view>
      <view class="field">
        <text class="label">封面 URL</text>
        <input
          v-model="form.coverUrl"
          class="input"
          placeholder="https://example.com/cover.jpg"
        />
      </view>
      <view class="field">
        <text class="label">分类</text>
        <input v-model="form.category" class="input" placeholder="徒步 / 露营 …" />
      </view>
      <view class="field">
        <text class="label">地点</text>
        <input v-model="form.place" class="input" placeholder="集合地点" />
      </view>
      <view class="field">
        <text class="label">开始时间</text>
        <input
          v-model="form.startAt"
          class="input"
          placeholder="2026-10-20T09:00:00"
        />
      </view>
      <view class="field">
        <text class="label">结束时间</text>
        <input
          v-model="form.endAt"
          class="input"
          placeholder="2026-10-20T18:00:00"
        />
      </view>
      <view class="field">
        <text class="label">名额</text>
        <input
          v-model="form.capacity"
          class="input"
          type="number"
          placeholder="20"
        />
      </view>
      <view class="field">
        <text class="label">活动须知</text>
        <textarea
          v-model="form.rules"
          class="textarea"
          placeholder="报名须知、装备要求等"
        />
      </view>
      <view class="field">
        <text class="label">费用类型</text>
        <picker :range="feeTypeLabels" :value="feeTypeIndex" @change="onFeeTypeChange">
          <view class="input picker">{{ feeTypeLabels[feeTypeIndex] }}</view>
        </picker>
      </view>
      <view v-if="form.feeType === 'paid'" class="field">
        <text class="label">费用（分）</text>
        <input
          v-model="form.feeCents"
          class="input"
          type="number"
          placeholder="例如 5000 表示 50 元"
        />
      </view>

      <view class="actions">
        <button class="ghost" :disabled="saving" @click="saveDraft">保存草稿</button>
        <button class="primary" :disabled="saving" @click="publish">发布</button>
      </view>
      <text v-if="msg" class="msg">{{ msg }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import {
  createActivity,
  getActivity,
  publishActivity,
  updateActivity,
  type UpsertBody,
} from "@/api/activities";
import { ApiError } from "@/utils/request";
import { useUserStore } from "@/stores/user";

const user = useUserStore();
const editingId = ref<string | null>(null);
const saving = ref(false);
const msg = ref("");

const feeTypeLabels = ["免费", "收费"];
const form = reactive({
  title: "",
  coverUrl: "https://example.com/cover-placeholder.jpg",
  category: "",
  place: "",
  startAt: "",
  endAt: "",
  capacity: "20",
  rules: "",
  feeType: "free" as "free" | "paid",
  feeCents: "0",
});

const feeTypeIndex = computed(() => (form.feeType === "paid" ? 1 : 0));

function onFeeTypeChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  form.feeType = idx === 1 ? "paid" : "free";
  if (form.feeType === "free") form.feeCents = "0";
}

function toIsoOrEmpty(value: string): string | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`时间格式无效：${t}`);
  }
  return d.toISOString();
}

function buildBody(): UpsertBody {
  const capacity = Number(form.capacity);
  const feeCents =
    form.feeType === "free" ? 0 : Number(form.feeCents || "0");
  return {
    title: form.title.trim(),
    coverUrl: form.coverUrl.trim(),
    category: form.category.trim(),
    place: form.place.trim(),
    startAt: toIsoOrEmpty(form.startAt),
    endAt: toIsoOrEmpty(form.endAt),
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : undefined,
    rules: form.rules.trim(),
    feeType: form.feeType,
    feeCents: Number.isFinite(feeCents) ? feeCents : 0,
  };
}

function fillForm(a: {
  title: string;
  coverUrl: string;
  category: string;
  place: string;
  startAt?: string | null;
  endAt?: string | null;
  capacity: number;
  rules: string;
  feeType: "free" | "paid";
  feeCents: number;
}) {
  form.title = a.title ?? "";
  form.coverUrl = a.coverUrl || form.coverUrl;
  form.category = a.category ?? "";
  form.place = a.place ?? "";
  form.startAt = a.startAt ? new Date(a.startAt).toISOString() : "";
  form.endAt = a.endAt ? new Date(a.endAt).toISOString() : "";
  form.capacity = String(a.capacity ?? 20);
  form.rules = a.rules ?? "";
  form.feeType = a.feeType ?? "free";
  form.feeCents = String(a.feeCents ?? 0);
}

function ensureCanPublish(): boolean {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return false;
  }
  if (!user.canPublish) {
    uni.showToast({ title: "暂无发布权限", icon: "none" });
    msg.value = "无发布权限";
    return false;
  }
  return true;
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "操作失败";
}

async function saveOrCreate(): Promise<string> {
  const body = buildBody();
  if (!body.title) {
    throw new Error("请填写标题");
  }
  if (editingId.value) {
    const updated = await updateActivity(editingId.value, body);
    return updated.id;
  }
  const created = await createActivity(body);
  editingId.value = created.id;
  return created.id;
}

async function saveDraft() {
  if (!ensureCanPublish()) return;
  saving.value = true;
  msg.value = "";
  try {
    await saveOrCreate();
    msg.value = "草稿已保存";
    uni.showToast({ title: "已保存", icon: "success" });
  } catch (e) {
    msg.value = errMessage(e);
    uni.showToast({ title: msg.value, icon: "none" });
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!ensureCanPublish()) return;
  saving.value = true;
  msg.value = "";
  try {
    const id = await saveOrCreate();
    await publishActivity(id);
    msg.value = "已发布";
    uni.showToast({ title: "已发布", icon: "success" });
    setTimeout(() => {
      uni.navigateBack({ fail: () => {
        uni.redirectTo({ url: "/pages/organizer/list" });
      }});
    }, 500);
  } catch (e) {
    msg.value = errMessage(e);
    uni.showToast({ title: msg.value, icon: "none" });
  } finally {
    saving.value = false;
  }
}

async function loadActivity(id: string) {
  try {
    const a = await getActivity(id);
    editingId.value = a.id;
    fillForm(a);
  } catch (e) {
    msg.value = errMessage(e);
    uni.showToast({ title: msg.value, icon: "none" });
  }
}

onLoad((query) => {
  const id = String(query?.id ?? "").trim();
  if (id) {
    void loadActivity(id);
  }
});

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  void user.refreshIdentity().then(() => {
    if (!user.canPublish) {
      uni.showToast({ title: "暂无发布权限", icon: "none" });
    }
  });
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx;
  box-sizing: border-box;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.desc {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 28rpx;
}
.field {
  margin-bottom: 24rpx;
}
.label {
  display: block;
  font-size: 26rpx;
  margin-bottom: 8rpx;
}
.input {
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
}
.picker {
  color: #111827;
}
.textarea {
  width: 100%;
  min-height: 160rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 8rpx;
}
button.primary {
  background: #0f766e;
  color: #fff;
}
button.ghost {
  background: #e5e7eb;
  color: #111827;
}
button::after {
  border: none;
}
button[disabled] {
  opacity: 0.5;
}
.msg {
  display: block;
  margin-top: 16rpx;
  color: #0f766e;
  font-size: 24rpx;
}
</style>
