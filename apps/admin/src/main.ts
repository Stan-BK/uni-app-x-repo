import { createApp } from "vue";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "./styles/index.css";
import App from "./App.vue";
import { initTheme } from "./composables/useTheme";
import { vAuth } from "./directives/auth";
import { router } from "./router";

initTheme();

createApp(App)
  .use(router)
  .use(ElementPlus, { locale: zhCn })
  .directive("auth", vAuth)
  .mount("#app");
