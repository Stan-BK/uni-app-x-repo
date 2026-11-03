<template>
  <view
    class="page page-l2 create-page"
    :class="{ 'create-page--with-bar': showActionBar }"
  >
    <view class="hero">
      <view class="hero-top">
        <text class="hero-kicker">活动发布</text>
        <text v-if="isPublishedEdit" class="hero-tag hero-tag--muted">已发布</text>
        <text
          v-else-if="!isNewActivity && lifecycle === 'draft'"
          class="hero-tag hero-tag--brand"
          >草稿</text
        >
      </view>
      <text class="hero-title">{{ pageTitle }}</text>
      <text class="hero-desc">{{ pageDesc }}</text>
    </view>

    <uni-forms
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      label-width="auto"
      err-show-type="undertext"
    >
      <view class="section">
        <view class="section-head">
          <text class="section-title">封面</text>
          <text class="section-hint">必填 · 建议 16:9</text>
        </view>
        <uni-forms-item name="coverUrl" class="cover-item">
          <view class="cover-picker" @click="chooseCover">
            <image
              v-if="coverPreview"
              class="cover-img"
              :src="coverPreview"
              mode="aspectFill"
            />
            <view v-else class="cover-placeholder">
              <view class="cover-plus">
                <text class="cover-plus-icon">+</text>
              </view>
              <text class="cover-placeholder-title">添加活动封面</text>
              <text class="cover-placeholder-sub">支持相册 / 拍照，≤5MB</text>
            </view>
            <view v-if="coverPreview && !uploadingCover" class="cover-change">
              <text class="cover-change-text">更换封面</text>
            </view>
            <view v-if="uploadingCover" class="cover-mask">
              <text class="cover-mask-text">封面上传中…</text>
            </view>
          </view>
        </uni-forms-item>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">基本信息</text>
        </view>

        <uni-forms-item name="title" label="标题" required>
          <uni-easyinput
            v-model="form.title"
            placeholder="例如：周末城市徒步"
            primary-color="#1E9B88"
            :styles="easyinputStyles"
            :clearable="true"
          />
        </uni-forms-item>

        <uni-forms-item name="category" label="分类" required>
          <uni-data-select
            v-model="form.category"
            :localdata="categoryOptions"
            placeholder="请选择分类"
            :clear="true"
          />
        </uni-forms-item>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">时间与地点</text>
          <text class="section-hint">集合点写清楚，方便报名者到场</text>
        </view>

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
          <text
            v-if="form.placeLat != null && form.placeLng != null"
            class="place-coord"
          >
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
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">报名设置</text>
          <text class="section-hint">名额与费用</text>
        </view>

        <uni-forms-item name="capacity" label="名额" required>
          <view class="inline-row">
            <uni-number-box v-model="form.capacity" :min="1" :max="9999" />
            <text class="inline-unit">人</text>
          </view>
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

        <uni-forms-item
          v-if="form.feeType === 'paid'"
          name="refundable"
          class="switch-item"
        >
          <view class="switch-field">
            <view class="switch-copy">
              <text class="switch-label">可退款</text>
              <text class="field-hint">首期不开放在线退款，仅作活动说明预留</text>
            </view>
            <switch
              :checked="form.refundable"
              color="#1E9B88"
              @change="onRefundableChange"
            />
          </view>
        </uni-forms-item>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">活动须知</text>
          <text class="section-hint">报名须知、装备要求等</text>
        </view>
        <uni-forms-item name="rules" label="须知内容" required>
          <uni-easyinput
            v-model="form.rules"
            type="textarea"
            :autoHeight="true"
            placeholder="写清楚集合方式、装备要求、取消规则等"
            primary-color="#1E9B88"
            :styles="easyinputStyles"
          />
        </uni-forms-item>
      </view>
    </uni-forms>

    <view v-if="showActionBar" class="action-bar">
      <view class="action-row">
        <button
          v-if="!isNewActivity || user.canPublish"
          class="ed-btn-secondary action-btn"
          hover-class="none"
          :disabled="saving"
          @click="saveDraft"
        >
          保存草稿
        </button>
        <button
          v-if="user.canPublish"
          class="ed-btn action-btn action-btn--primary"
          hover-class="none"
          :disabled="saving"
          @click="publish"
        >
          发布
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
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

/** 仅新建与草稿可改；已发布须先退回草稿 */
const canEditContent = computed(() => {
  if (!editingId.value) return true;
  return lifecycle.value === "draft";
});

/** 底部固定操作栏：只读或没有任何可执行操作时收起 */
const showActionBar = computed(() => {
  if (!canEditContent.value) return false;
  return !isNewActivity.value || user.canPublish;
});

const pageTitle = computed(() => {
  if (isPublishedEdit.value) return "已发布活动";
  if (editingId.value) return "编辑活动";
  return "发布活动";
});

const pageDesc = computed(() => {
  if (isPublishedEdit.value) {
    return "已发布活动不可直接修改，请先退回草稿。";
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
  refundable: false as boolean,
  capacity: 20,
  rules: "",
  feeType: "free" as "free" | "paid",
  feeYuan: "",
});

function onRefundableChange(e: { detail: { value: boolean } }) {
  form.refundable = Boolean(e.detail.value);
}

watch(
  () => form.feeType,
  (feeType) => {
    if (feeType !== "paid") form.refundable = false;
  },
);

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
    allowUserCancel: true,
    refundable: form.feeType === "paid" && Boolean(form.refundable),
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
  "Cannot edit published activity": "已发布活动不可直接修改，请先退回草稿",
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
  if (saving.value) return;
  if (!form.title.trim()) {
    showError("保存草稿至少填写标题");
    return;
  }
  formRef.value?.clearValidate();
  saving.value = true;
  msg.value = "";
  try {
    if (editingId.value) {
      if (!ensureLoggedIn()) return;
    } else if (!(await ensureCanPublish())) {
      return;
    }
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
  if (saving.value) return;
  if (isPublishedEdit.value) {
    showError("已发布活动不可直接修改，请先退回草稿");
    return;
  }
  saving.value = true;
  msg.value = "";
  try {
    if (!(await ensureCanPublish())) {
      saving.value = false;
      return;
    }
    const ok = await validateForm();
    if (!ok) {
      saving.value = false;
      return;
    }
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
    saving.value = false;
  }
}

async function loadActivity(id: string) {
  try {
    const a = await getActivity(id);
    editingId.value = a.id;
    fillForm(a);
    if (
      a.lifecycle === "published" ||
      a.lifecycle === "cancelled" ||
      a.lifecycle === "removed" ||
      a.lifecycle === "ended"
    ) {
      showError(
        a.lifecycle === "published"
          ? "已发布活动不可直接修改，请先退回草稿"
          : "该活动当前状态不可编辑",
      );
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
    uni.navigateBack();
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
.create-page {
  padding-bottom: 48rpx;
}

.create-page--with-bar {
  padding-bottom: calc(168rpx + env(safe-area-inset-bottom));
}

/* 页头：微型 kicker + 大标题 + 说明，和二级页的编辑部版式一致 */
.hero {
  padding: 40rpx 0 28rpx;
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.hero-kicker {
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  color: $ed-color-brand-strong;
}

.hero-tag {
  margin-left: auto;
  padding: 6rpx 16rpx;
  font-size: 20rpx;
  font-weight: 500;
  line-height: 1.4;
  border-radius: $ed-radius-tag;
  background: $ed-color-btn-secondary;
  color: $ed-color-text-secondary;
}

.hero-tag--brand {
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.hero-tag--muted {
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
}

.hero-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 44rpx;
  font-weight: 600;
  line-height: 1.3;
  color: $ed-color-text;
}

.hero-desc {
  display: block;
  font-size: 24rpx;
  line-height: 1.55;
  color: $ed-color-text-secondary;
}

/* 表单分组卡片 */
.section {
  margin-bottom: 24rpx;
  padding: 28rpx $ed-space-card 6rpx;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-card;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1.4;
  color: $ed-color-text;
}

.section-hint {
  flex-shrink: 0;
  font-size: 22rpx;
  line-height: 1.4;
  color: $ed-color-text-muted;
}

/* 封面 */
.cover-picker {
  position: relative;
  width: 100%;
  height: 336rpx;
  overflow: hidden;
  background: $ed-color-brand-soft;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
}

.cover-img {
  width: 100%;
  height: 100%;
}

.cover-placeholder {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  box-sizing: border-box;
  border-radius: $ed-radius-input;
}

.cover-plus {
  display: flex;
  width: 76rpx;
  height: 76rpx;
  align-items: center;
  justify-content: center;
  margin-bottom: 4rpx;
  border-radius: 50%;
  background: $ed-color-brand;
}

.cover-plus-icon {
  font-size: 44rpx;
  font-weight: 300;
  line-height: 1;
  color: #ffffff;
}

.cover-placeholder-title {
  font-size: 28rpx;
  font-weight: 500;
  line-height: 1.4;
  color: $ed-color-brand-strong;
}

.cover-placeholder-sub {
  font-size: 22rpx;
  line-height: 1.4;
  color: $ed-color-text-secondary;
}

.cover-change {
  position: absolute;
  right: 16rpx;
  bottom: 16rpx;
  padding: 10rpx 24rpx;
  border-radius: $ed-radius-pill;
  background: rgba(36, 49, 45, 0.72);
}

.cover-change-text {
  font-size: 22rpx;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.95);
}

.cover-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(36, 49, 45, 0.55);
}

.cover-mask-text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.95);
}

/* 地点选择行 */
.place-picker {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 84rpx;
  padding: 16rpx 20rpx;
  box-sizing: border-box;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
}

.place-text {
  flex: 1;
  font-size: 28rpx;
  line-height: 1.45;
  color: $ed-color-text;
}

.place-placeholder {
  flex: 1;
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

.place-action {
  flex-shrink: 0;
  padding: 8rpx 20rpx;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.4;
  color: $ed-color-brand-strong;
  background: $ed-color-brand-soft;
  border-radius: $ed-radius-pill;
}

.place-edit {
  margin-top: 12rpx;
}

.place-coord {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: $ed-color-text-muted;
}

/* 名额 / 单位 */
.inline-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.inline-unit {
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

/* 可退款开关行 */
.switch-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  min-height: 72rpx;
}

.switch-copy {
  flex: 1;
}

.switch-label {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
  line-height: 1.4;
  color: $ed-color-text;
}

.field-hint {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: $ed-color-text-muted;
}

/* 底部固定操作栏 */
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

button[disabled] {
  opacity: 0.5;
}

/* uni-ui 组件对齐设计 token */
:deep(.uni-forms) {
  width: 100%;
}

:deep(.uni-forms-item) {
  margin-bottom: 26rpx;
}

:deep(.uni-forms-item__label) {
  height: auto;
  padding: 0 0 12rpx;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 1.4;
  color: $ed-color-text-secondary;
}

:deep(.uni-forms-item__label.no-label) {
  height: 0;
  padding: 0;
}

:deep(.uni-forms-item__label .is-required) {
  margin-right: 4rpx;
  font-weight: 500;
  color: $ed-color-accent;
}

/* 错误文案改为文档流内显示，避免盖住控件 */
:deep(.uni-forms-item__error) {
  position: static;
  padding-top: 10rpx;
  transform: none;
  font-size: 22rpx;
  line-height: 1.4;
  color: $ed-color-terracotta;
}

:deep(.uni-forms-item__error.msg--active) {
  transform: none;
}

:deep(.uni-easyinput__content.is-input-border) {
  min-height: 84rpx;
  background-color: $ed-color-surface;
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

:deep(.uni-easyinput__content-input) {
  height: 84rpx;
  font-size: 28rpx;
  color: $ed-color-text;
}

:deep(.uni-easyinput__placeholder-class) {
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

:deep(.uni-easyinput__content-textarea) {
  min-height: 200rpx;
  padding: 20rpx 0;
  font-size: 28rpx;
  line-height: 1.6;
  color: $ed-color-text;
}

:deep(.uni-select) {
  min-height: 84rpx;
  padding: 0 20rpx;
  border-radius: $ed-radius-input !important;
  border-color: $ed-color-border !important;
  background-color: $ed-color-surface !important;
}

:deep(.uni-select__input-text) {
  font-size: 28rpx;
  color: $ed-color-text;
}

:deep(.uni-select__input-text.uni-select__input-placeholder) {
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

:deep(.uni-date-editor--x) {
  width: 100%;
}

:deep(.uni-date-x),
:deep(.uni-date-x--border) {
  min-height: 84rpx;
  border-radius: $ed-radius-input !important;
  border-color: $ed-color-border !important;
  background-color: $ed-color-surface !important;
}

:deep(.uni-date__x-input) {
  height: 82rpx;
  font-size: 28rpx;
  line-height: 82rpx;
  color: $ed-color-text;
}

:deep(.uni-numbox) {
  overflow: hidden;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
}

:deep(.uni-numbox-btns) {
  padding: 0 26rpx;
  background: $ed-color-btn-secondary;
}

:deep(.uni-numbox--text) {
  font-size: 32rpx;
  line-height: 40rpx;
  color: $ed-color-text;
}

:deep(.uni-numbox__value) {
  width: 96rpx;
  height: 76rpx;
  margin: 0;
  font-size: 28rpx;
  color: $ed-color-text;
  background: $ed-color-surface;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag) {
  min-height: 72rpx;
  padding: 0 40rpx;
  border-radius: $ed-radius-pill !important;
  border-color: $ed-color-border !important;
  background-color: $ed-color-btn-secondary !important;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag .checklist-text) {
  font-size: 26rpx;
  line-height: 72rpx;
  color: $ed-color-text;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag.is-checked) {
  border-color: $ed-color-brand !important;
  background-color: $ed-color-brand !important;
}

:deep(.uni-data-checklist .checklist-group .checklist-box.is--tag.is-checked .checklist-text) {
  color: rgba(255, 255, 255, 0.95) !important;
}

:deep(.switch-item .uni-forms-item__label) {
  display: none;
  height: 0;
  padding: 0;
}
</style>

