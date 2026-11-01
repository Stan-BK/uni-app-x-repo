import type { Directive } from "vue";
import { can, type Capability } from "../permissions";

/**
 * `v-auth`：无权限时直接从 DOM 移除元素（不是隐藏），避免「看不见但可点击」。
 *
 * 用法：
 * ```vue
 * <el-button v-auth="Capability.RemoveActivity">下架</el-button>
 * <el-button v-auth="[Capability.RemoveActivity, Capability.ManagePublish]">任一即可</el-button>
 * ```
 *
 * 注意：这是 UI 保护，不是安全边界；接口鉴权仍以后端为准。
 */
export const vAuth: Directive<HTMLElement, Capability | Capability[]> = {
  mounted(el, binding) {
    if (!can(binding.value)) {
      el.remove();
    }
  },
};
