import { createDefaultSettings } from './settings';
import type { ProjectSettings } from './types';

export const SETTINGS_STORAGE_KEY = 'paraglider-render:settings-preset';

const SETTINGS_STORAGE_VERSION = 4;

interface StoredSettingsPreset {
  version: number;
  settings: ProjectSettings;
}

export function loadSettingsPreset(): ProjectSettings {
  const fallback = createDefaultSettings();
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null') as unknown;
    const settings = migrateStoredSettings(stored, fallback);
    if (!isProjectSettings(settings, fallback)) return fallback;
    return settings;
  } catch {
    return fallback;
  }
}

export function saveSettingsPreset(settings: ProjectSettings): void {
  const preset: StoredSettingsPreset = { version: SETTINGS_STORAGE_VERSION, settings };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preset));
}

function migrateStoredSettings(value: unknown, fallback: ProjectSettings): unknown {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  if (value.version === SETTINGS_STORAGE_VERSION) return value.settings;
  if (!isRecord(value.settings.overlay)) return null;
  const overlay = { ...fallback.overlay, ...value.settings.overlay };
  if (value.version === 3) return { ...value.settings, overlay };
  if (value.version === 2) {
    return { ...value.settings, cameraKeyframes: [], overlay };
  }
  if (value.version === 1 && isRecord(value.settings.routeStyle)) {
    return {
      ...value.settings,
      cameraKeyframes: [],
      overlay,
      routeStyle: { ...fallback.routeStyle, ...value.settings.routeStyle },
    };
  }
  return null;
}

function isProjectSettings(value: unknown, expected: ProjectSettings): value is ProjectSettings {
  if (!hasSameShape(value, expected)) return false;
  const settings = value as ProjectSettings;
  return (
    ['1080p', '1440p', '4k'].includes(settings.outputPreset) &&
    ['landscape', 'vertical'].includes(settings.aspectRatio) &&
    [24, 30, 60].includes(settings.frameRate) &&
    ['metric', 'imperial'].includes(settings.unitSystem) &&
    settings.cameraKeyframes.every(
      (keyframe) =>
        typeof keyframe.id === 'string' &&
        Number.isFinite(keyframe.flightSeconds) &&
        hasSameShape(keyframe.camera, expected.camera),
    )
  );
}

function hasSameShape(value: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof expected !== 'object' || expected === null) return typeof value === typeof expected;
  if (Array.isArray(expected)) return Array.isArray(value);
  if (!isRecord(value)) return false;
  return Object.entries(expected).every(([key, expectedValue]) =>
    hasSameShape(value[key], expectedValue),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
