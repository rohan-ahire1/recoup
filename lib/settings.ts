import { all, get, run } from './db';

export type DeliveryMode = 'prepare' | 'auto';

export interface Settings {
  businessName: string;
  senderName: string;
  timezone: string;
  replyToEmail: string;
  /** 'prepare': drafts wait in "To send". 'auto': send through a connected provider. */
  deliveryMode: DeliveryMode;
  /** A template set id, or 'auto' to pick a tone from each customer's history. */
  defaultTemplateSet: number | 'auto';
  savedViews: { name: string; query: string }[];
  /** Show the demo time-travel strip under the top bar (demo mode only). */
  showDemoBar: boolean;
}

/** Texts must respect the customer's local hours, so default to a US zone rather than the server's (often UTC). */
const DEFAULT_TIMEZONE = 'America/Chicago';

const DEFAULTS: Settings = {
  businessName: 'Ferro Service Co.',
  senderName: 'Marco',
  timezone: DEFAULT_TIMEZONE,
  replyToEmail: '',
  deliveryMode: 'prepare',
  defaultTemplateSet: 'auto',
  savedViews: [],
  showDemoBar: true,
};

export function getSettings(): Settings {
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const row of all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    if (row.key in DEFAULTS) out[row.key] = JSON.parse(row.value);
  }
  return out as unknown as Settings;
}

export function setSetting(key: string, value: unknown) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

export function saveSettings(partial: Partial<Settings>) {
  for (const [key, value] of Object.entries(partial)) setSetting(key, value);
}

/** Demo mode can push the clock forward so a 15-day sequence plays out in a minute. */
export function getClockOffset(): number {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = 'clockOffsetMs'");
  return row ? Number(JSON.parse(row.value)) : 0;
}

export function setClockOffset(ms: number) {
  setSetting('clockOffsetMs', ms);
}

/** Every piece of time logic reads "now" from here. */
export function getNow(): number {
  return Date.now() + getClockOffset();
}
