<template>
  <view class="page page-l2">
    <view class="card">
      <text class="title">{{ pageTitle }}</text>
      <text class="desc">{{ pageDesc }}</text>

      <uni-forms
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        err-show-type="undertext"
      >
        <uni-forms-item name="title" label="标题" required>
          <uni-easyinput
            v-model="form.title"
            placeholder="例如：周末城市徒步"
            primary-color="#1E9B88"
            :styles="easyinputStyles"
            :clearable="true"
          />
        </uni-forms-item>

        <uni-forms-item name="coverUrl" label="封面" required>
          <view class="cover-picker" @click="chooseCover">
            <image
              v-if="coverPreview"
              class="cover-img"
              :src="coverPreview"
              mode="aspectFill"
            />
            <view v-else class="cover-placeholder">
              <text class="cover-placeholder-title">点击选择封面</text>
              <text class="cover-placeholder-sub">支持相册 / 拍照，≤5MB</text>
            </view>
            <view v-if="uploadingCover" class="cover-mask">上传中…</view>
          </view>
        </uni-forms-item>

        <uni-forms-item name="category" label="分类" required>
          <uni-data-select
            v-model="form.category"
            :localdata="categoryOptions"
            placeholder="请选择分类"
            :clear="true"
          />
        </uni-forms-item>

        <uni-forms-item name="place" label="地点" required>
          <view class="place-picker" @click="choosePlace">
            <text v-if="form.place" class="place-text">{{ form.place }}</text>
            <text v-else class="place-placeholder">点击从地图选择地点</text>
            <text class="place-action">地图选点</text>
          </view>
          <uni-easyinput
            v-if="form.place"
            v-model="form.place"
            class="place-edit"
            placeholder="可微调地址文案（集合点说明等）"
            primary-color="#1E9B88"
            :styles="easyinputStyles"
            :clearable="true"
          />
          <text v-if="form.placeLat != null && form.placeLng != null" class="place-coord">
            坐标 {{ form.placeLat.toFixed(5) }}, {{ form.placeLng.toFixed(5) }}
          </text>
        </uni-forms-item>

        <uni-forms-item name="startAt" label="开始时间" required>
          <uni-datetime-picker
            v-model="form.startAt"
            type="datetime"
            return-type="string"
            :clear-icon="true"
          />
        </uni-forms-item>

        <uni-forms-item name="endAt" label="结束时间" required>
          <uni-datetime-picker
            v-model="form.endAt"
            type="datetime"
            return-type="string"
            :clear-icon="true"
          />
        </uni-forms-item>

        <uni-forms-item name="registrationDeadlineAt" label="报名截止时间">
          <uni-datetime-picker
            v-model="form.registrationDeadlineAt"
            type="datetime"
            return-type="string"
            :clear-icon="true"
          />
          <text class="field-hint">不填则默认为活动开始时间</text>
        </uni-forms-item>

        <uni-forms-item name="allowUserCancel" label="用户取消报名">
          <uni-data-checkbox
            v-model="form.allowUserCancel"
            :localdata="allowCancelOptions"
            mode="tag"
          />
        </uni-forms-item>

        <uni-forms-item name="refundable" label="退款政策">
          <uni-data-checkbox
            v-model="form.refundable"
            :localdata="refundableOptions"
            mode="tag"
          />
          <text class="field-hint">首期不开放在线退款，仅作活动说明预留</text>
        </uni-forms-item>

        <uni-forms-item name="capacity" label="名额" required>
          <uni-number-box v-model="form.capacity" :min="1" :max="9999" />
        </uni-forms-item>

        <uni-forms-item name="rules" label="活动须知" required>
          <uni-easyinput
            v-model="form.rules"
            type="textarea"
            :autoHeight="true"
            placeholder="报名须知、装备要求等"
            primary-color="#1E9B88"
            :styles="easyinputStyles"
          />
        </uni-forms-item>

        <uni-forms-item name="feeType" label="费用类型" required>
          <uni-data-checkbox
            v-model="form.feeType"
            :localdata="feeTypeOptions"
            mode="tag"
          />
        </uni-forms-item>

        <uni-forms-item
          v-if="form.feeType === 'paid'"
          name="feeYuan"
          label="费用（元）"
          required
        >
          <uni-easyinput
            v-model="form.feeYuan"
            type="digit"
            placeholder="例如 50"
            primary-color="#1E9B88"
            :styles="easyinputStyles"
          />
        </uni-forms-item>
      </uni-forms>

      <view v-if="canEditContent" class="actions">
        <template v-if="isPublishedEdit">
          <button
            class="ed-btn"
            hover-class="none"
            :disabled="saving"
            @click="savePublished"
          >
            保存
          </button>
        </template>
        <template v-else>
          <button
            v-if="!isNewActivity || user.canPublish"
            class="ed-btn-secondary"
            hover-class="none"
            :disabled="saving"
            @click="saveDraft"
          >
            保存草稿
          </button>
          <button
            v-if="user.canPublish"
            class="ed-btn"
            hover-class="none"
            :disabled="saving"
            @click="publish"
          >
            发布
          </button>
        </template>
      </view>
      <text v-if="msg" class="msg">{{ msg }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import UniDataCheckbox from "@dcloudio/uni-ui/lib/uni-data-checkbox/uni-data-checkbox.vue";
import UniDataSelect from "@dcloudio/uni-ui/lib/uni-data-select/uni-data-select.vue";
import UniDatetimePicker from "@dcloudio/uni-ui/lib/uni-datetime-picker/uni-datetime-picker.vue";
import UniEasyinput from "@dcloudio/uni-ui/lib/uni-easyinput/uni-easyinput.vue";
import UniForms from "@dcloudio/uni-ui/lib/uni-forms/uni-forms.vue";
import UniFormsItem from "@dcloudio/uni-ui/lib/uni-forms-item/uni-forms-item.vue";
import UniNumberBox from "@dcloudio/uni-ui/lib/uni-number-box/uni-number-box.vue";
import {
  createActivity,
  getActivity,
  publishActivity,
  updateActivity,
  uploadCover,
  type Activity,
  type UpsertBody,
} from "@/api/activities";
import { ApiError } from "@/utils/request";
import { useUserStore } from "@/stores/user";
// 显式导入 uni-ui：pnpm monorepo 下仅靠 easycom 时 usingComponents 可能为空

type UniFormsInstance = {
  validate: (keepItem?: string[]) => Promise<Record<string, unknown>>;
  clearValidate: (names?: string | string[]) => void;
};

const user = useUserStore();
const formRef = ref<UniFormsInstance | null>(null);
const editingId = ref<string | null>(null);
/** 路由带 id 即为编辑；不要等 getActivity 完成再判断，避免 onShow 误当成新建 */
const isNewActivity = ref(true);
const lifecycle = ref<Activity["lifecycle"] | null>(null);
const saving = ref(false);
const uploadingCover = ref(false);
const coverPreview = ref("");
const msg = ref("");

const isPublishedEdit = computed(() => lifecycle.value === "published");

/** 新建、草稿、已发布可改；取消/下架/结束不可改 */
const canEditContent = computed(() => {
  if (!editingId.value) return true;
  const life = lifecycle.value;
  return life === "draft" || life === "published";
});

const pageTitle = computed(() => {
  if (isPublishedEdit.value) return "编辑已发布活动";
  if (editingId.value) return "编辑活动";
  return "发布活动";
});

const pageDesc = computed(() => {
  if (isPublishedEdit.value) {
    return "修改后点「保存」即可更新线上内容，无需再次发布。";
  }
  if (editingId.value && !canEditContent.value) {
    return "当前活动状态不可再编辑内容。";
  }
  return "填写信息后可保存草稿；发布前需补齐必填项。时间请用下方选择器。";
});

const feeTypeOptions = [
  { text: "免费", value: "free" },
  { text: "收费", value: "paid" },
];
const allowCancelOptions = [
  { text: "允许取消", value: true },
  { text: "不允许取消", value: false },
];
const refundableOptions = [
  { text: "不可退款", value: false },
  { text: "可退款", value: true },
];
/** 与 packages/shared ActivityCategory 同步；页面内写死避免 vendor 增量缓存旧枚举 */
const categoryOptions = [{ text: "观赛", value: "观赛" }];

/** 只改默认边框/底色。聚焦走 primaryColor，报错走组件内联色，样式里不要 !important 盖住。 */
const easyinputStyles = {
  color: "#24312d",
  backgroundColor: "#fffefb",
  disableColor: "#F7F6F6",
  borderColor: "#e7e2d9",
};

const form = reactive({
  title: "",
  coverUrl: "",
  category: "",
  place: "",
  placeLat: null as number | null,
  placeLng: null as number | null,
  startAt: "",
  endAt: "",
  registrationDeadlineAt: "",
  allowUserCancel: true as boolean,
  refundable: false as boolean,
  capacity: 20,
  rules: "",
  feeType: "free" as "free" | "paid",
  feeYuan: "",
});

function choosePlace() {
  uni.chooseLocation({
    success: (res) => {
      const name = (res.name || "").trim();
      const address = (res.address || "").trim();
      form.place = name && address && name !== address ? `${name} ${address}` : name || address;
      form.placeLat = typeof res.latitude === "number" ? res.latitude : null;
      form.placeLng = typeof res.longitude === "number" ? res.longitude : null;
      if (!form.place) {
        showError("未获取到地点名称，请重选或手动填写");
      }
    },
    fail: (err) => {
      const errMsg = String(err?.errMsg || "");
      if (errMsg.includes("cancel") || errMsg.includes("fail cancel")) return;
      if (errMsg.includes("auth deny") || errMsg.includes("authorize")) {
        uni.showModal({
          title: "需要位置权限",
          content: "请在设置中允许使用位置信息，以便从地图选择活动地点",
          confirmText: "去设置",
          success: (r) => {
            if (r.confirm) uni.openSetting({});
          },
        });
        return;
      }
      showError(errMsg || "打开地图选点失败");
    },
  });
}

async function chooseCover() {
  if (uploadingCover.value) return;
  try {
    const picked = await new Promise<UniApp.ChooseImageSuccessCallbackResult>(
      (resolve, reject) => {
        uni.chooseImage({
          count: 1,
          sizeType: ["compressed"],
          sourceType: ["album", "camera"],
          success: resolve,
          fail: reject,
        });
      },
    );
    const path = picked.tempFilePaths?.[0];
    if (!path) return;
    coverPreview.value = path;
    uploadingCover.value = true;
    const { url } = await uploadCover(path);
    form.coverUrl = url;
    coverPreview.value = url;
    uni.showToast({ title: "封面已上传", icon: "success" });
  } catch (e) {
    if (e && typeof e === "object" && "errMsg" in e) {
      const errMsg = String((e as { errMsg: string }).errMsg);
      if (errMsg.includes("cancel") || errMsg.includes("fail cancel")) return;
    }
    showError(errMessage(e));
  } finally {
    uploadingCover.value = false;
  }
}

function parseLocalDateTime(value: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  // uni-datetime-picker string: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD"
  const normalized = t.includes("T") ? t : t.replace(/-/g, "/");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoOrEmpty(value: string): string | undefined {
  if (!value?.trim()) return undefined;
  const d = parseLocalDateTime(value);
  if (!d) throw new Error(`时间格式无效：${value}`);
  return d.toISOString();
}

function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const rules = {
  title: {
    rules: [{ required: true, errorMessage: "请填写标题" }],
  },
  coverUrl: {
    rules: [{ required: true, errorMessage: "请选择封面" }],
  },
  category: {
    rules: [{ required: true, errorMessage: "请选择分类" }],
  },
  place: {
    rules: [{ required: true, errorMessage: "请从地图选择地点" }],
  },
  startAt: {
    rules: [{ required: true, errorMessage: "请选择开始时间" }],
  },
  endAt: {
    rules: [
      { required: true, errorMessage: "请选择结束时间" },
      {
        validateFunction: (
          _rule: unknown,
          value: string,
          data: { startAt?: string },
          callback: (err?: string) => void,
        ) => {
          const end = parseLocalDateTime(value || "");
          const start = parseLocalDateTime(data.startAt || "");
          if (end && start && end <= start) {
            callback("结束时间必须晚于开始时间");
            return;
          }
          callback();
        },
      },
    ],
  },
  registrationDeadlineAt: {
    rules: [
      {
        validateFunction: (
          _rule: unknown,
          value: string,
          data: { startAt?: string },
          callback: (err?: string) => void,
        ) => {
          if (!value?.trim()) {
            callback();
            return;
          }
          const deadline = parseLocalDateTime(value);
          const start = parseLocalDateTime(data.startAt || "");
          if (deadline && start && deadline > start) {
            callback("报名截止不能晚于开始时间");
            return;
          }
          callback();
        },
      },
    ],
  },
  capacity: {
    rules: [
      { required: true, errorMessage: "请填写名额" },
      {
        validateFunction: (
          _rule: unknown,
          value: number,
          _data: unknown,
          callback: (err?: string) => void,
        ) => {
          if (!value || Number(value) < 1) {
            callback("名额至少为 1");
            return;
          }
          callback();
        },
      },
    ],
  },
  rules: {
    rules: [{ required: true, errorMessage: "请填写活动须知" }],
  },
  feeType: {
    rules: [{ required: true, errorMessage: "请选择费用类型" }],
  },
  feeYuan: {
    rules: [
      {
        validateFunction: (
          _rule: unknown,
          value: string,
          data: { feeType?: string },
          callback: (err?: string) => void,
        ) => {
          if (data.feeType !== "paid") {
            callback();
            return;
          }
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) {
            callback("收费活动请填写大于 0 的费用（元）");
            return;
          }
          callback();
        },
      },
    ],
  },
};

function buildBody(): UpsertBody {
  const feeCents =
    form.feeType === "free"
      ? 0
      : Math.round(Number(form.feeYuan || "0") * 100);
  return {
    title: form.title.trim(),
    coverUrl: form.coverUrl.trim(),
    category: form.category.trim(),
    place: form.place.trim(),
    placeLat: form.placeLat,
    placeLng: form.placeLng,
    startAt: toIsoOrEmpty(form.startAt),
    endAt: toIsoOrEmpty(form.endAt),
    registrationDeadlineAt:
      toIsoOrEmpty(form.registrationDeadlineAt) ??
      toIsoOrEmpty(form.startAt),
    allowUserCancel: Boolean(form.allowUserCancel),
    refundable: Boolean(form.refundable),
    capacity: Number(form.capacity) > 0 ? Number(form.capacity) : undefined,
    rules: form.rules.trim(),
    feeType: form.feeType,
    feeCents: Number.isFinite(feeCents) ? feeCents : 0,
  };
}

function fillForm(a: Activity) {
  lifecycle.value = a.lifecycle;
  form.title = a.title ?? "";
  form.coverUrl = a.coverUrl ?? "";
  coverPreview.value = a.coverUrl ?? "";
  form.category = a.category ?? "";
  form.place = a.place ?? "";
  form.placeLat = a.placeLat ?? null;
  form.placeLng = a.placeLng ?? null;
  form.startAt = formatLocalDateTime(a.startAt);
  form.endAt = formatLocalDateTime(a.endAt);
  form.registrationDeadlineAt = formatLocalDateTime(
    a.registrationDeadlineAt ?? a.startAt,
  );
  form.allowUserCancel = a.allowUserCancel !== false;
  form.refundable = Boolean(a.refundable);
  form.capacity = a.capacity ?? 20;
  form.rules = a.rules ?? "";
  form.feeType = a.feeType ?? "free";
  form.feeYuan =
    a.feeType === "paid" && a.feeCents > 0
      ? String(a.feeCents / 100)
      : "";
}

function ensureLoggedIn(): boolean {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return false;
  }
  return true;
}

async function ensureCanPublish(): Promise<boolean> {
  if (!ensureLoggedIn()) return false;
  if (!user.me) {
    try {
      await user.refreshIdentity();
    } catch {
      uni.showToast({ title: "无法确认发布权限", icon: "none" });
      return false;
    }
  }
  if (!user.canPublish) {
    uni.showToast({ title: "发布权限已关闭", icon: "none" });
    msg.value = "发布权限已关闭";
    return false;
  }
  return true;
}

const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  coverUrl: "封面",
  category: "分类",
  rules: "活动须知",
  place: "地点",
  startAt: "开始时间",
  endAt: "结束时间",
  capacity: "名额",
};

/** API 英文 Conflict 文案 → 中文（全站尚未统一错误码表前的局部映射） */
const API_MESSAGE_ZH: Record<string, string> = {
  "Only draft can be published": "仅草稿状态可发布",
  "Only published can unpublish to draft": "仅已发布活动可退回草稿",
  "Cannot cancel from current state": "当前状态不可取消",
  "Cannot edit activity in terminal state": "活动已结束/取消/下架，不可编辑",
  "title is required": "请填写标题",
};

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.fields?.length) {
      if (e.message.includes("请填写") || e.message.includes("发布失败")) {
        return e.message;
      }
      const labels = e.fields.map((k) => FIELD_LABELS[k] ?? k);
      return `发布失败，请填写：${labels.join("、")}`;
    }
    return API_MESSAGE_ZH[e.message] ?? e.message;
  }
  if (e instanceof Error) {
    return API_MESSAGE_ZH[e.message] ?? e.message;
  }
  return "操作失败";
}

function showError(text: string) {
  msg.value = text;
  // toast 过长会被系统截断；长文案以底部 msg 为准，toast 只给短提示
  const toastTitle =
    text.length > 20 ? `${text.slice(0, 18)}…` : text;
  uni.showToast({
    title: toastTitle,
    icon: "none",
    duration: 2500,
  });
}

async function validateForm(): Promise<boolean> {
  try {
    await formRef.value?.validate();
    return true;
  } catch (e) {
    // uni-forms 校验失败会抛出错误数组或对象
    const first =
      Array.isArray(e) && e[0]?.errorMessage
        ? String(e[0].errorMessage)
        : "请完善必填项";
    showError(first);
    return false;
  }
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
  if (editingId.value) {
    if (!ensureLoggedIn()) return;
  } else if (!(await ensureCanPublish())) {
    return;
  }
  if (!form.title.trim()) {
    showError("保存草稿至少填写标题");
    return;
  }
  formRef.value?.clearValidate();
  saving.value = true;
  msg.value = "";
  try {
    await saveOrCreate();
    msg.value = "草稿已保存";
    uni.showToast({ title: "已保存", icon: "success" });
  } catch (e) {
    showError(errMessage(e));
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!(await ensureCanPublish())) return;
  if (isPublishedEdit.value) {
    showError("活动已发布，请使用「保存」更新内容");
    return;
  }
  const ok = await validateForm();
  if (!ok) return;
  saving.value = true;
  msg.value = "";
  try {
    const id = await saveOrCreate();
    await publishActivity(id);
    lifecycle.value = "published";
    msg.value = "已发布";
    uni.showToast({ title: "已发布", icon: "success" });
    setTimeout(() => {
      uni.navigateBack({
        fail: () => {
          uni.redirectTo({ url: "/pages/organizer/list" });
        },
      });
    }, 500);
  } catch (e) {
    showError(errMessage(e));
  } finally {
    saving.value = false;
  }
}

/** 已发布活动：只 PATCH 更新，不再调 publish */
async function savePublished() {
  if (!ensureLoggedIn()) return;
  if (!editingId.value || !isPublishedEdit.value) {
    showError("当前不是已发布活动");
    return;
  }
  const ok = await validateForm();
  if (!ok) return;
  saving.value = true;
  msg.value = "";
  try {
    await updateActivity(editingId.value, buildBody());
    msg.value = "已保存";
    uni.showToast({ title: "已保存", icon: "success" });
  } catch (e) {
    showError(errMessage(e));
  } finally {
    saving.value = false;
  }
}

async function loadActivity(id: string) {
  try {
    const a = await getActivity(id);
    editingId.value = a.id;
    fillForm(a);
    if (
      a.lifecycle === "cancelled" ||
      a.lifecycle === "removed" ||
      a.lifecycle === "ended"
    ) {
      showError("该活动当前状态不可编辑");
    }
  } catch (e) {
    showError(errMessage(e));
  }
}

onLoad((query) => {
  const id = String(query?.id ?? "").trim();
  isNewActivity.value = !id;
  if (id) {
    void loadActivity(id);
  }
});

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  void user.refreshIdentity()
    .then(() => {
      if (isNewActivity.value && user.me && !user.canPublish) {
        uni.showToast({ title: "发布权限已关闭", icon: "none" });
      }
    })
    .catch(() => {
      /* 网络失败时保留本地态 */
    });
});
</script>

<style scoped lang="scss">
.card {
  margin-top: 24rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
}

.title {
  display: block;
  font-size: 38rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 12rpx;
}

.desc {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  line-height: 1.5;
  margin-bottom: 20rpx;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 24rpx;
}

.actions button {
  margin: 0;
  font-weight: 600;
}

button[disabled] {
  opacity: 0.5;
}

.msg {
  display: block;
  margin-top: 16rpx;
  color: $ed-color-terracotta;
  font-size: 24rpx;
  line-height: 1.5;
}

.cover-picker {
  position: relative;
  width: 100%;
  height: 280rpx;
  border-radius: $ed-radius-input;
  overflow: hidden;
  background: $ed-color-brand-soft;
  border: 1rpx solid $ed-color-border;
}

.cover-img {
  width: 100%;
  height: 100%;
}

.cover-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  background: $ed-color-brand;
}

.cover-placeholder-title {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.95);
}

.cover-placeholder-sub {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.78);
}

.cover-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
}

.place-picker {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 72rpx;
  padding: 16rpx 20rpx;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
  background: $ed-color-surface;
  box-sizing: border-box;
}

.place-text {
  flex: 1;
  font-size: 28rpx;
  color: $ed-color-text;
  line-height: 1.4;
}

.place-placeholder {
  flex: 1;
  font-size: 28rpx;
  color: $ed-color-text-muted;
}

.place-action {
  flex-shrink: 0;
  font-size: 24rpx;
  color: $ed-color-brand;
}

.place-edit {
  margin-top: 12rpx;
}

.field-hint,
.place-coord {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
  line-height: 1.4;
}

:deep(.uni-easyinput__content.is-input-border) {
  border-radius: $ed-radius-input !important;
}

:deep(
  .uni-easyinput__content.is-input-border:not(.is-focused):not(
      .is-input-error-border
    )
) {
  border-color: $ed-color-border;
  background-color: $ed-color-surface;
}

:deep(.uni-select),
:deep(.uni-date-x),
:deep(.uni-date-x--border) {
  border-radius: $ed-radius-input !important;
  border-color: $ed-color-border !important;
  background-color: $ed-color-surface !important;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag) {
  border-radius: $ed-radius-tag !important;
  border-color: $ed-color-border !important;
  background-color: $ed-color-btn-secondary !important;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag .checklist-text) {
  color: $ed-color-text;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag.is-checked) {
  border-color: $ed-color-brand !important;
  background-color: $ed-color-brand !important;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag.is-checked .checklist-text) {
  color: rgba(255, 255, 255, 0.95) !important;
}
</style>
