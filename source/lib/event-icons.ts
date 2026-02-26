import type { CalendarConfig, CalendarEvent } from '../types.js';

const DEFAULT_EVENT_ICONS: Record<string, string> = {
  // Travel
  travel: '✈', flight: '✈', plane: '✈', airport: '✈',
  vacation: '⛱', holiday: '⛱', beach: '⛱',
  ski: '⛷', skiing: '⛷', snowboard: '⛷',
  // Health
  doctor: '✚', dentist: '✚', hospital: '✚', medical: '✚',
  gym: '💪', workout: '💪', exercise: '💪',
  run: '🏃', yoga: '🧘',
  // Social
  meeting: '👥', call: '📞', interview: '📞',
  party: '🎉', birthday: '🎂', dinner: '🍽',
  date: '♥', wedding: '💒',
  concert: '♪', music: '♪',
  // Work
  deadline: '⚑', release: '🚀', deploy: '🚀', launch: '🚀',
  review: '📝', exam: '📝', test: '📝',
  presentation: '📊', demo: '📊',
  standup: '👥', sync: '👥', retro: '👥',
  // Life
  pay: '💰', bill: '💰', rent: '💰', tax: '💰',
  move: '📦', clean: '🧹',
  haircut: '✂', barber: '✂',
  grocery: '🛒', shop: '🛒',
};

const STATUS_ICONS: Record<string, string> = {
  done: '✔',
  important: '‣',
};

const PRIVACY_ICON = '•';
const DEFAULT_ICON = '•';

export function getEventIcon(
  event: CalendarEvent,
  calendarConfig?: CalendarConfig,
  isGlobalPrivacy?: boolean,
): string {
  // Privacy mode — no icon hint
  if (isGlobalPrivacy || event.privacy) return PRIVACY_ICON;

  // Status overrides
  if (event.status !== 'normal' && STATUS_ICONS[event.status]) {
    return STATUS_ICONS[event.status]!;
  }

  // Explicit icon override
  if (event.icon) return event.icon;

  // Keyword matching
  const icons = { ...DEFAULT_EVENT_ICONS, ...(calendarConfig?.icons ?? {}) };
  const titleLower = event.title.toLowerCase();
  for (const [keyword, icon] of Object.entries(icons)) {
    if (titleLower.includes(keyword)) return icon;
  }

  return DEFAULT_ICON;
}

export function getPrivacyDisplay(title: string): string {
  return PRIVACY_ICON + ' ' + PRIVACY_ICON.repeat(Math.min(title.length, 12));
}
