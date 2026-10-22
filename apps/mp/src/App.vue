<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";

function hideNativeTabBar() {
  uni.hideTabBar({ animation: false });
}

function installL2LeaveMotion() {
  // #ifdef H5
  const durationMs = 200;
  let pending = false;
  const scrollByRoute = new Map<string, number>();

  function currentPageEl(): HTMLElement | null {
    const pages = [...document.querySelectorAll("uni-page")].filter(
      (node) => !node.getAttribute("data-ed-motion"),
    );
    return (pages[pages.length - 1] as HTMLElement) ?? null;
  }

  function currentRoute(): string {
    const stack = getCurrentPages() as { route?: string }[];
    return stack[stack.length - 1]?.route ?? "";
  }

  function scrollerOf(el: HTMLElement): HTMLElement {
    return (
      (el.querySelector("uni-page-wrapper") as HTMLElement | null) ??
      (el.querySelector("uni-page-body") as HTMLElement | null) ??
      el
    );
  }

  function saveCurrentScroll() {
    const el = currentPageEl();
    if (!el) return;
    const route = currentRoute();
    if (!route) return;
    scrollByRoute.set(route, scrollerOf(el).scrollTop || 0);
  }

  function restoreCurrentScroll() {
    let tries = 0;
    const tick = () => {
      const el = currentPageEl();
      const route = currentRoute();
      const y = scrollByRoute.get(route);
      if (el && y != null && y > 0) {
        scrollerOf(el).scrollTop = y;
        uni.pageScrollTo({ scrollTop: y, duration: 0 });
      }
      tries += 1;
      if (tries < 12) window.setTimeout(tick, 40);
    };
    window.setTimeout(tick, 0);
  }

  function isL2Page(el: HTMLElement | null) {
    return Boolean(el?.querySelector(".page-l2"));
  }

  function clearMotionClones() {
    document.querySelectorAll("[data-ed-motion]").forEach((node) => node.remove());
  }

  function cloneCurrentPage(cls: string) {
    const el = currentPageEl();
    if (!el) return null;
    const host = document.querySelector("uni-app") ?? document.body;
    const scroller = scrollerOf(el);
    const scrollTop = scroller.scrollTop ?? 0;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.classList.add(cls);
    clone.setAttribute("data-ed-motion", cls);
    clone.setAttribute("aria-hidden", "true");
    host.appendChild(clone);
    scrollerOf(clone).scrollTop = scrollTop;
    window.setTimeout(() => clone.remove(), durationMs + 40);
    return clone;
  }

  function startLeaveOverlay() {
    clearMotionClones();
    if (!isL2Page(currentPageEl())) return;
    cloneCurrentPage("ed-page-leave");
  }

  function startEnterUnderlay() {
    saveCurrentScroll();
    const el = currentPageEl();
    if (!el?.querySelector(".page-l1")) return;
    clearMotionClones();
    cloneCurrentPage("ed-page-underlay");
  }

  const rawBack = uni.navigateBack.bind(uni);
  uni.navigateBack = ((opts: UniNamespace.NavigateBackOptions = {}) => {
    if (pending || !isL2Page(currentPageEl())) return rawBack(opts);
    pending = true;
    startLeaveOverlay();
    rawBack(opts);
    restoreCurrentScroll();
  }) as typeof uni.navigateBack;

  const rawNavigateTo = uni.navigateTo.bind(uni);
  uni.navigateTo = ((opts: UniNamespace.NavigateToOptions) => {
    startEnterUnderlay();
    return rawNavigateTo(opts);
  }) as typeof uni.navigateTo;

  const tryBindRouter = () => {
    const router = (
      getApp() as {
        $router?: {
          beforeEach: (
            fn: (
              to: { path: string; meta?: { isTabBar?: boolean } },
              from: { meta?: { isTabBar?: boolean } },
              next: () => void,
            ) => void,
          ) => void;
        };
      }
    ).$router;
    if (!router) return;
    router.beforeEach((to, from, next) => {
      if (pending) {
        pending = false;
        next();
        return;
      }
      if (from.meta?.isTabBar) {
        next();
        return;
      }
      const stack = getCurrentPages() as { route?: string }[];
      const toRoute = String(to.path || "").replace(/^\//, "");
      const idx = stack.findIndex((page) => page.route === toRoute);
      const isBack = idx >= 0 && idx < stack.length - 1;
      if (!isBack) {
        next();
        return;
      }
      pending = true;
      startLeaveOverlay();
      next();
      restoreCurrentScroll();
    });
  };
  window.setTimeout(tryBindRouter, 0);
  // #endif
}

onLaunch(() => {
  hideNativeTabBar();
  installL2LeaveMotion();
});
onShow(() => {
  hideNativeTabBar();
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style lang="scss">
$ed-motion-duration: 0.2s !default;
$ed-motion-ease: cubic-bezier(0.32, 0.72, 0, 1) !default;

page {
  background-color: $ed-color-canvas;
  color: $ed-color-text;
}

.page-l1,
.page-l2 {
  min-height: 100vh;
  box-sizing: border-box;
  background-color: $ed-color-canvas;
  color: $ed-color-text;
}

.page-l1 {
  isolation: isolate;
  padding: calc(
      24rpx + var(--status-bar-height, 0px) + env(safe-area-inset-top, 0px)
    )
    $ed-space-page-x calc(168rpx + env(safe-area-inset-bottom));
}

/* #ifdef H5 */
.page-l1 {
  padding-top: calc(44px + env(safe-area-inset-top, 0px));
}

uni-tabbar,
.uni-tabbar {
  display: none !important;
}

uni-app {
  overflow: hidden;
}

uni-page,
uni-page-wrapper,
uni-page-body {
  overflow-x: hidden;
}

[data-ed-motion="ed-page-underlay"] {
  position: fixed !important;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  background-color: $ed-color-canvas;
}

uni-page:has(.page-l2):not([data-ed-motion]) {
  position: relative;
  z-index: 30;
  min-height: 100%;
  background-color: $ed-color-canvas;
  animation: ed-l2-enter $ed-motion-duration $ed-motion-ease both;
}

[data-ed-motion="ed-page-leave"] {
  position: fixed !important;
  inset: 0;
  z-index: 200;
  pointer-events: none;
  background-color: $ed-color-canvas;
  will-change: transform;
  animation: ed-l2-leave $ed-motion-duration $ed-motion-ease forwards;
}

@keyframes ed-l2-enter {
  from {
    transform: translate3d(100%, 0, 0);
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}

@keyframes ed-l2-leave {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(100%, 0, 0);
  }
}
/* #endif */

.page-l2 {
  padding: 0 $ed-space-page-x 48rpx;
}

.ed-btn,
.ed-btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 28rpx;
  border-radius: $ed-radius-pill;
  border: none;
  padding: 0 32rpx;
}

.ed-btn {
  background: $ed-color-brand;
  color: #ffffff;
}

.ed-btn-secondary {
  background: $ed-color-btn-secondary;
  color: $ed-color-text;
}

.ed-btn-link {
  background: transparent;
  color: $ed-color-brand;
  border: none;
  font-size: 26rpx;
}

button.ed-btn::after,
button.ed-btn-secondary::after,
button.ed-btn-link::after {
  border: none;
}

.ed-tag {
  display: inline-block;
  font-size: 20rpx;
  font-weight: 500;
  line-height: 1.4;
  padding: 6rpx 16rpx;
  border-radius: $ed-radius-tag;
}

.ed-tag-open,
.ed-tag-confirmed {
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.ed-tag-paid,
.ed-tag-pending {
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
}

.ed-tag-waitlist {
  background: $ed-color-navy-soft;
  color: $ed-color-navy;
}

.ed-tag-full {
  background: $ed-color-full-bg;
  color: $ed-color-full-text;
}

.ed-tag-muted {
  background: transparent;
  color: $ed-color-text-secondary;
  padding-left: 0;
  padding-right: 0;
}
</style>
