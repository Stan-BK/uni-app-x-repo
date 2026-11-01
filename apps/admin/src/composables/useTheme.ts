import { ref } from "vue";

const STORAGE_KEY = "admin_theme";

function readInitial(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const isDark = ref(false);
let initialized = false;

/** 在应用挂载前调用一次，避免首屏闪烁。 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;
  isDark.value = readInitial();
  apply(isDark.value);
}

function apply(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  function setDark(dark: boolean) {
    isDark.value = dark;
    apply(dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }

  function toggle() {
    setDark(!isDark.value);
  }

  return { isDark, setDark, toggle };
}
