<script setup lang="ts">
import { Lock, Message, Odometer, Right, Stamp, UserFilled } from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { adminLogin } from "../api/admin";
import { ApiError, setAdminProfile, setAdminToken } from "../api/http";

const router = useRouter();
const route = useRoute();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  email: "admin@example.com",
  password: "ChangeMeNow!",
});

const rules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "邮箱格式不正确", trigger: "blur" },
  ],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

const highlights = [
  { icon: Stamp, title: "操作全程留痕", desc: "冻结、恢复、下架都会写入审计日志" },
  { icon: UserFilled, title: "账号体系隔离", desc: "运营账号与小程序用户互不相通" },
  { icon: Right, title: "角色分级", desc: "运营负责处置，管理员可查看审计" },
];

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    const result = await adminLogin(form.email.trim(), form.password);
    setAdminToken(result.accessToken);
    setAdminProfile(result.admin);
    const redirect =
      typeof route.query.redirect === "string" ? route.query.redirect : "/users";
    await router.replace(redirect);
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <section class="login__brand">
      <div class="brand-top">
        <div class="brand-mark">
          <el-icon :size="22"><Odometer /></el-icon>
        </div>
        <div class="brand-text">
          <span class="brand-name">Activity</span>
          <span class="brand-sub">运营后台</span>
        </div>
      </div>

      <div class="brand-main">
        <p class="brand-eyebrow">Operations Console</p>
        <h1 class="brand-title">让每一场活动<br />都被认真运营</h1>
        <p class="brand-desc">
          统一管理用户发布权、活动生命周期与日常处置记录，权限边界清晰、每次操作可追溯。
        </p>

        <ul class="highlights">
          <li v-for="item in highlights" :key="item.title" class="highlight">
            <span class="highlight__icon">
              <el-icon :size="16"><component :is="item.icon" /></el-icon>
            </span>
            <span class="highlight__text">
              <strong>{{ item.title }}</strong>
              <small>{{ item.desc }}</small>
            </span>
          </li>
        </ul>
      </div>

      <p class="brand-footer">© 2026 Activity Platform · 仅限授权运营人员访问</p>
    </section>

    <section class="login__form-area">
      <div class="form-card">
        <header class="form-head">
          <h2>登录运营后台</h2>
          <p>使用管理员邮箱与密码登录</p>
        </header>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent
        >
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              type="email"
              autocomplete="username"
              :prefix-icon="Message"
              placeholder="name@company.com"
              clearable
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              :prefix-icon="Lock"
              placeholder="请输入密码"
              show-password
              @keyup.enter="onSubmit"
            />
          </el-form-item>

          <el-button
            type="primary"
            class="submit"
            size="large"
            :loading="loading"
            @click="onSubmit"
          >
            登录
          </el-button>
        </el-form>

        <p class="form-hint">登录即代表你同意遵守平台运营规范，敏感操作会被记录。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(420px, 0.95fr);
  min-height: 100vh;
  background: var(--bg-app);
}

/* ---------- 左侧品牌区 ---------- */

.login__brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 36px 48px 32px;
  color: #eef2ff;
  overflow: hidden;
  /* 品牌青绿 + 陶土橙，取自 docs/design/mp-urban-editorial.md */
  background:
    radial-gradient(120% 80% at 10% 0%, rgba(30, 155, 136, 0.55) 0%, transparent 55%),
    radial-gradient(90% 70% at 90% 100%, rgba(229, 111, 62, 0.32) 0%, transparent 60%),
    linear-gradient(155deg, #123f38 0%, #0e2f2a 55%, #0a211e 100%);
}

.login__brand::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px);
  background-size: 26px 26px;
  opacity: 0.35;
  mask-image: linear-gradient(180deg, transparent, #000 45%, transparent);
  pointer-events: none;
}

.brand-top {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(8px);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-name {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.brand-sub {
  font-size: 11.5px;
  color: rgba(238, 242, 255, 0.6);
}

.brand-main {
  position: relative;
  z-index: 1;
  max-width: 460px;
  padding-block: 32px;
}

.brand-eyebrow {
  font-size: 11.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(238, 242, 255, 0.5);
  margin-bottom: 18px;
}

.brand-title {
  font-size: clamp(30px, 3.4vw, 40px);
  line-height: 1.22;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.brand-desc {
  margin-top: 18px;
  font-size: 14px;
  line-height: 1.75;
  color: rgba(238, 242, 255, 0.66);
}

.highlights {
  list-style: none;
  margin: 34px 0 0;
  padding: 0;
  display: grid;
  gap: 16px;
}

.highlight {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.highlight__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #c7d4ff;
}

.highlight__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.highlight__text strong {
  font-size: 13.5px;
  font-weight: 600;
}

.highlight__text small {
  font-size: 12.5px;
  color: rgba(238, 242, 255, 0.55);
}

.brand-footer {
  position: relative;
  z-index: 1;
  font-size: 11.5px;
  color: rgba(238, 242, 255, 0.38);
}

/* ---------- 右侧表单区 ---------- */

.login__form-area {
  display: grid;
  place-items: center;
  padding: 40px 24px;
  background: var(--bg-app);
}

.form-card {
  width: min(400px, 100%);
}

.form-head h2 {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.form-head p {
  margin-top: 6px;
  font-size: 13.5px;
  color: var(--text-muted);
}

.form-card :deep(.el-form) {
  margin-top: 28px;
}

.form-card :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 550;
  color: var(--text-secondary);
}

.submit {
  width: 100%;
  margin-top: 6px;
  height: 42px;
  font-weight: 600;
  border-radius: var(--radius-sm);
}

.form-hint {
  margin-top: 20px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

@media (max-width: 960px) {
  .login {
    grid-template-columns: 1fr;
  }

  .login__brand {
    display: none;
  }
}
</style>
