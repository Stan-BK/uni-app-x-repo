<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { adminLogin } from "../api/admin";
import { ApiError, setAdminToken } from "../api/http";

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

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    const result = await adminLogin(form.email.trim(), form.password);
    setAdminToken(result.accessToken);
    const redirect =
      typeof route.query.redirect === "string"
        ? route.query.redirect
        : "/users";
    await router.replace(redirect);
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <el-card class="card" shadow="never">
      <template #header>
        <span>运营后台登录</span>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent
      >
        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            autocomplete="username"
            clearable
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="onSubmit">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f7fa;
  padding: 24px;
}
.card {
  width: min(400px, 100%);
}
.submit {
  width: 100%;
}
</style>
