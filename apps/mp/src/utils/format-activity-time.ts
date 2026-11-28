const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** 活动列表横卡用短时间：`11月30日 (周日) 10:00`；无效为「时间待定」。 */
export function formatActivityTime(iso?: string | null): string {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间待定";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const week = WEEKDAY_LABEL[d.getDay()];
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${month}月${day}日 (${week}) ${clock}`;
}
