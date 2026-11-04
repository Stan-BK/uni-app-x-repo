import { ElMessage } from "element-plus";
import { ApiError, isMaintenanceError } from "../api/http";

type RouterLike = {
  replace: (to: string) => Promise<unknown>;
};

/**
 * 列表取数失败的统一处理：
 * - 401：登录态已失效（token 在 api/http 里清理），跳登录
 * - 403：角色不足，跳回默认页（审计日志等页面会返回）
 * - 维护窗：请求层已节流提示，此处不再重复 ElMessage
 * - 其它：提示后端 message，回退到页面给的兜底文案
 *
 * 返回 true 表示已经跳转，调用方无需再提示。
 */
export async function handleListError(
  error: unknown,
  router: RouterLike,
  fallback: string,
): Promise<boolean> {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      await router.replace("/login");
      return true;
    }
    if (error.status === 403) {
      await router.replace("/users");
      return true;
    }
    if (isMaintenanceError(error)) {
      return false;
    }
    ElMessage.error(error.message || fallback);
    return false;
  }
  ElMessage.error(fallback);
  return false;
}
