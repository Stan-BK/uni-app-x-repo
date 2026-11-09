/** 报名记录上用于展示的姓名相关字段 */
export type RegistrationDisplayPerson = {
  name?: string | null;
  nickname?: string | null;
};

/**
 * 所有者侧主标题：报名姓名优先，其次昵称，否则「用户」。
 */
export function displayRegistrationName(
  person: RegistrationDisplayPerson,
): string {
  const name = person.name?.trim() ?? "";
  if (name) return name;
  const nickname = person.nickname?.trim() ?? "";
  if (nickname) return nickname;
  return "用户";
}

/**
 * 名单卡片次行：昵称非空且与主名不同时返回「微信：{nickname}」，否则 null。
 */
export function registrationWeixinSubtitle(
  person: RegistrationDisplayPerson,
): string | null {
  const nickname = person.nickname?.trim() ?? "";
  if (!nickname) return null;
  const primary = displayRegistrationName(person);
  if (nickname === primary) return null;
  return `微信：${nickname}`;
}
