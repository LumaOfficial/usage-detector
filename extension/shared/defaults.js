export const APP_NAME = 'Usage Detector';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  trackingEnabled: true,
  idleSeconds: 60,
  retentionDays: 90,
  ignore: ['localhost', '127.0.0.1'],
});

export const STORAGE_KEYS = Object.freeze({
  settings: 'settings',
  daily: 'daily',
  tracker: 'tracker',
  meta: 'meta',
});
