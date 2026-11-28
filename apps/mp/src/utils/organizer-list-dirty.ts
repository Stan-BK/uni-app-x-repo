/** 「我的活动」列表：详情/编辑改过数据时再刷新，避免返回时无意义重拉 */

let dirty = true;

export function markOrganizerListDirty() {
  dirty = true;
}

/** 读取并清除；true 表示本次 onShow 需要拉列表 */
export function consumeOrganizerListDirty() {
  const next = dirty;
  dirty = false;
  return next;
}
