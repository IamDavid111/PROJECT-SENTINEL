// SentinelQHSE icon registry — single source of truth for every icon the app renders.
//
// Icons render through @iconify/react from the locally-bundled HugeIcons set
// (no CDN, no runtime API calls). Feature code must never import an icon
// component directly — it should add a key here and consume it via
// <Icon name="..."/> from src/components/ui/icon.tsx. That keeps every swap
// and every new icon in exactly one file, and lets the design system own the
// icon vocabulary.
//
// Adding an icon: verify the name first (see rophi/UI_REVAMP.md §11 for the
// node one-liner), then add a semantic key → 'hugeicons:<name>' entry here.
import { addCollection } from '@iconify/react'
import { hugeiconsPartial } from './hugeicons-partial'

export const ICONS = {
  // —— Navigation / workspace shell ——
  dashboard: 'hugeicons:dashboard-square-01',
  reportIncident: 'hugeicons:siren',
  incidents: 'hugeicons:clipboard-check',
  inspections: 'hugeicons:scan-eye',
  correctiveActions: 'hugeicons:list-checks',
  assignedActions: 'hugeicons:list-checks',
  aiAssistant: 'hugeicons:sparkles',
  executiveAnalytics: 'hugeicons:analytics-01',
  knowledge: 'hugeicons:book-open-01',
  marketplace: 'hugeicons:store-01',
  administration: 'hugeicons:shield-01',
  profile: 'hugeicons:user-circle',
  preferences: 'hugeicons:settings-01',
  activityLog: 'hugeicons:activity-01',
  settings: 'hugeicons:gears',

  // —— Chrome / affordances ——
  search: 'hugeicons:search-01',
  menu: 'hugeicons:menu-01',
  close: 'hugeicons:delete-01',
  more: 'hugeicons:more-01',
  externalLink: 'hugeicons:external-link',
  link: 'hugeicons:link-01',
  help: 'hugeicons:help-circle',
  info: 'hugeicons:alert-02',
  question: 'hugeicons:question',
  notification: 'hugeicons:notification-01',
  notifications: 'hugeicons:bell',
  messages: 'hugeicons:message-01',
  mail: 'hugeicons:mail-01',
  sun: 'hugeicons:sun-01',
  moon: 'hugeicons:moon-02',
  logout: 'hugeicons:logout-01',
  power: 'hugeicons:power',
  lock: 'hugeicons:lock',

  // —— Navigation arrows / chevrons ——
  arrowRight: 'hugeicons:arrow-right-01',
  arrowLeft: 'hugeicons:arrow-left-01',
  chevronRight: 'hugeicons:chevron-right',
  chevronDown: 'hugeicons:chevron-down',
  chevronUp: 'hugeicons:chevron-up',

  // —— Actions / forms ——
  check: 'hugeicons:check',
  plus: 'hugeicons:plus',
  add: 'hugeicons:add-circle',
  minus: 'hugeicons:minus',
  edit: 'hugeicons:edit-01',
  trash: 'hugeicons:delete-01',
  copy: 'hugeicons:copy-01',
  share: 'hugeicons:share-01',
  download: 'hugeicons:download-01',
  upload: 'hugeicons:upload-01',
  refresh: 'hugeicons:refresh',
  filter: 'hugeicons:filter-horizontal',
  sort: 'hugeicons:sort-descending',
  eye: 'hugeicons:eye',
  viewOff: 'hugeicons:view-off',
  print: 'hugeicons:printer',
  star: 'hugeicons:star',

  // —— Status ——
  success: 'hugeicons:checkmark-circle-01',
  warning: 'hugeicons:alert-01',
  danger: 'hugeicons:alert-02',
  fire: 'hugeicons:fire-extinguisher',
  gauge: 'hugeicons:gauge',
  flame: 'hugeicons:flame',

  // —— Data / time / entities ——
  calendar: 'hugeicons:calendar-01',
  clock: 'hugeicons:clock-01',
  timer: 'hugeicons:timer-01',
  hourglass: 'hugeicons:hourglass',
  alarm: 'hugeicons:alarm-clock',
  location: 'hugeicons:location-01',
  target: 'hugeicons:target-01',
  building: 'hugeicons:building-01',
  factory: 'hugeicons:factory',
  drill: 'hugeicons:drill',
  ship: 'hugeicons:ship',
  truck: 'hugeicons:truck',
  warehouse: 'hugeicons:warehouse',
  construction: 'hugeicons:construction',
  crane: 'hugeicons:crane',
  health: 'hugeicons:health',
  heartPulse: 'hugeicons:heart-pulse',
  hardHat: 'hugeicons:hard-hat',
  fuel: 'hugeicons:fuel',
  leaf: 'hugeicons:leaf-01',
  recycle: 'hugeicons:recycle-01',
  oilBarrel: 'hugeicons:oil-barrel',
  container: 'hugeicons:container',
  ambulance: 'hugeicons:ambulance',
  bandage: 'hugeicons:bandage',

  // —— Files / data / modules ——
  file: 'hugeicons:file-01',
  fileAdd: 'hugeicons:file-add',
  fileCheck: 'hugeicons:file-check',
  fileDownload: 'hugeicons:file-download',
  fileSearch: 'hugeicons:file-search',
  fileLock: 'hugeicons:file-lock',
  folder: 'hugeicons:folder-01',
  folderOpen: 'hugeicons:folder-open',
  archive: 'hugeicons:archive-01',
  archiveRestore: 'hugeicons:archive-restore',
  invoice: 'hugeicons:invoice-01',
  uploadFile: 'hugeicons:file-upload',
  inbox: 'hugeicons:inbox',
  database: 'hugeicons:database-01',
  layers: 'hugeicons:layers-01',

  // —— Analytics ——
  analyticsUp: 'hugeicons:analytics-up',
  analyticsDown: 'hugeicons:analytics-down',
  trendingUp: 'hugeicons:trending-up',
  pieChart: 'hugeicons:pie-chart-01',
  dashboardCircle: 'hugeicons:dashboard-circle',
  waypoints: 'hugeicons:waypoints',

  // —— AI / knowledge ——
  aiBrain: 'hugeicons:ai-brain-01',
  chatBot: 'hugeicons:chat-bot',
  history: 'hugeicons:history',
  bookmark: 'hugeicons:bookmark-01',
  graduationCap: 'hugeicons:graduation-cap',

  // —— Devices ——
  camera: 'hugeicons:camera-01',
  tablet: 'hugeicons:tablet-01',
  smartphone: 'hugeicons:smartphone',

  // —— Loading ——
  spinner: 'hugeicons:loading-01',
  loader: 'hugeicons:loader',
} as const

export type IconName = keyof typeof ICONS

// Register ONLY the icons the registry uses (regenerated by
// scripts/generate-hugeicons.mjs into hugeicons-partial.ts). The full 6,091-icon
// set would add hundreds of KB to the main bundle for icons the app never
// renders; the filtered collection stays small yet fully offline.
// Aliases are dropped deliberately: @iconify/react silently fails registration
// when an alias target is missing, and the registry only uses primary icons.
addCollection(hugeiconsPartial)