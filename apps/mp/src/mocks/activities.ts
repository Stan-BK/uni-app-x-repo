/** Local mock data for MP UI preview — no real API. */

export type ActivityStatus = 'open' | 'full' | 'ended' | 'upcoming'

export type RegistrationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'waitlist'

export interface Activity {
  id: string
  title: string
  coverColor: string
  coverLabel: string
  startAt: string
  endAt: string
  place: string
  feeCents: number
  feeLabel: string
  organizer: string
  status: ActivityStatus
  statusLabel: string
  rules: string
  capacity: number
  enrolled: number
}

export interface Registration {
  id: string
  activityId: string
  activityTitle: string
  name: string
  phone: string
  status: RegistrationStatus
  statusLabel: string
  createdAt: string
}

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  open: '报名中',
  full: '已满员',
  ended: '已结束',
  upcoming: '未开始',
}

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
  waitlist: '候补中',
}

export const mockActivities: Activity[] = [
  {
    id: 'act-001',
    title: '周末城市徒步 · 滨江线',
    coverColor: '#0F766E',
    coverLabel: '徒步',
    startAt: '2026-10-25 09:00',
    endAt: '2026-10-25 12:30',
    place: '滨江公园东门集合',
    feeCents: 0,
    feeLabel: '免费',
    organizer: '城市探索社',
    status: 'open',
    statusLabel: ACTIVITY_STATUS_LABEL.open,
    rules:
      '请穿着舒适运动鞋，自备饮水。集合时间迟到超过 15 分钟视为自动放弃名额。活动过程中请听从领队安排，注意交通安全。',
    capacity: 30,
    enrolled: 18,
  },
  {
    id: 'act-002',
    title: '咖啡品鉴工作坊',
    coverColor: '#C2410C',
    coverLabel: '品鉴',
    startAt: '2026-10-26 14:00',
    endAt: '2026-10-26 16:00',
    place: '河西创意园 B 栋 3 层',
    feeCents: 6800,
    feeLabel: '¥68',
    organizer: '慢烘坊',
    status: 'open',
    statusLabel: ACTIVITY_STATUS_LABEL.open,
    rules:
      '费用含杯测样品与讲义。首期暂不支持在线支付，到场后线下缴费。过敏体质请提前告知主理人。',
    capacity: 12,
    enrolled: 9,
  },
  {
    id: 'act-003',
    title: '夜跑打卡 · 奥体环线',
    coverColor: '#1E3A5F',
    coverLabel: '夜跑',
    startAt: '2026-10-20 19:30',
    endAt: '2026-10-20 21:00',
    place: '奥体中心南门',
    feeCents: 0,
    feeLabel: '免费',
    organizer: '夜跑小队',
    status: 'full',
    statusLabel: ACTIVITY_STATUS_LABEL.full,
    rules:
      '名额已满。可提交候补，有人取消时按顺序通知。请佩戴反光装备，手机电量充足。',
    capacity: 20,
    enrolled: 20,
  },
  {
    id: 'act-004',
    title: '摄影外拍 · 老城巷弄',
    coverColor: '#57534E',
    coverLabel: '摄影',
    startAt: '2026-11-02 08:30',
    endAt: '2026-11-02 11:30',
    place: '老门东入口广场',
    feeCents: 9900,
    feeLabel: '¥99',
    organizer: '光影纪',
    status: 'upcoming',
    statusLabel: ACTIVITY_STATUS_LABEL.upcoming,
    rules:
      '自备相机或手机即可。费用含向导讲解，不含器材租赁。请尊重街坊隐私，避免闯入私人院落。',
    capacity: 15,
    enrolled: 4,
  },
  {
    id: 'act-005',
    title: '社区读书会 · 十月场',
    coverColor: '#3F6212',
    coverLabel: '读书',
    startAt: '2026-10-12 15:00',
    endAt: '2026-10-12 17:00',
    place: '社区图书馆二楼',
    feeCents: 0,
    feeLabel: '免费',
    organizer: '邻里书屋',
    status: 'ended',
    statusLabel: ACTIVITY_STATUS_LABEL.ended,
    rules: '本期已结束，欢迎关注下月主题预告。',
    capacity: 25,
    enrolled: 22,
  },
]

let mockRegistrations: Registration[] = [
  {
    id: 'reg-001',
    activityId: 'act-001',
    activityTitle: '周末城市徒步 · 滨江线',
    name: '陈晓',
    phone: '138****1201',
    status: 'confirmed',
    statusLabel: REGISTRATION_STATUS_LABEL.confirmed,
    createdAt: '2026-10-15 10:22',
  },
  {
    id: 'reg-002',
    activityId: 'act-002',
    activityTitle: '咖啡品鉴工作坊',
    name: '陈晓',
    phone: '138****1201',
    status: 'pending',
    statusLabel: REGISTRATION_STATUS_LABEL.pending,
    createdAt: '2026-10-16 18:05',
  },
  {
    id: 'reg-003',
    activityId: 'act-003',
    activityTitle: '夜跑打卡 · 奥体环线',
    name: '陈晓',
    phone: '138****1201',
    status: 'waitlist',
    statusLabel: REGISTRATION_STATUS_LABEL.waitlist,
    createdAt: '2026-10-14 21:40',
  },
]

export function listActivities(): Activity[] {
  return mockActivities
}

export function getActivityById(id: string): Activity | undefined {
  return mockActivities.find((item) => item.id === id)
}

export function listRegistrations(): Registration[] {
  return mockRegistrations
}

export function submitRegistration(input: {
  activityId: string
  name: string
  phone: string
}): Registration {
  const activity = getActivityById(input.activityId)
  const status: RegistrationStatus =
    activity?.status === 'full' ? 'waitlist' : 'pending'
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  const record: Registration = {
    id: `reg-${Date.now()}`,
    activityId: input.activityId,
    activityTitle: activity?.title ?? '未知活动',
    name: input.name.trim(),
    phone: input.phone.trim(),
    status,
    statusLabel: REGISTRATION_STATUS_LABEL[status],
    createdAt,
  }

  mockRegistrations = [record, ...mockRegistrations]
  return record
}

export function formatFeeBadge(activity: Activity): string {
  return activity.feeCents === 0 ? '免费' : activity.feeLabel
}
