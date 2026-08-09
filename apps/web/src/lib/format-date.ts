const LOCALE = "en-US" as const;

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnlyFmt = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeOnlyFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/** Format as "Apr 12, 2026, 2:18 PM" */
export function formatDate(date: string | Date): string {
  return dateTimeFmt.format(new Date(date));
}

/** Format as "Apr 12, 2026" */
export function formatDateShort(date: string | Date): string {
  return dateOnlyFmt.format(new Date(date));
}

/** Format as "2:18:22 PM" */
export function formatTime(date: string | Date): string {
  return timeOnlyFmt.format(new Date(date));
}
