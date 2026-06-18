import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultSettings } from './settings';
import { loadSettingsPreset, saveSettingsPreset, SETTINGS_STORAGE_KEY } from './settingsStorage';

describe('settings preset storage', () => {
  beforeEach(() => localStorage.clear());

  it('uses the Volare application preset when no user preset exists', () => {
    expect(loadSettingsPreset()).toMatchObject({
      trimStartSeconds: 0,
      trimEndSeconds: 10_378,
      targetDurationSeconds: 60,
      outputPreset: '1080p',
      aspectRatio: 'vertical',
      frameRate: 30,
      bitrateMbps: 50,
      altitudeOffsetMeters: 0,
      unitSystem: 'metric',
      camera: {
        distanceMeters: 5000,
        elevationAngleDegrees: 20,
        lookAheadSeconds: 0.35,
        lagSeconds: 0,
        followSmoothingSeconds: 1.5,
        headingSmoothingSeconds: 8,
        headingOffsetDegrees: 180,
        fixedHeadingEnabled: true,
        fixedHeadingDegrees: 0,
        fieldOfViewDegrees: 25,
        minimumTerrainClearanceMeters: 30,
      },
      overlay: { backgroundOpacity: 0.35 },
      routeStyle: {
        showGhostRoute: false,
        trailLengthEnabled: true,
        trailLengthMeters: 5000,
        trailBorderColor: '#000000',
        trailBorderWidthPixels: 2,
        markerSizePixels: 10,
      },
    });
  });

  it('round-trips every project setting', () => {
    const settings = createDefaultSettings(120);
    settings.camera.followSmoothingSeconds = 12;
    settings.overlay.enabled = false;
    settings.routeStyle.markerColor = '#123456';

    saveSettingsPreset(settings);

    expect(loadSettingsPreset()).toEqual(settings);
  });

  it('falls back to defaults for malformed data', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{"version":1,"settings":{"frameRate":25}}');

    expect(loadSettingsPreset()).toEqual(createDefaultSettings());
  });

  it('adds new trail settings to version 1 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyRouteStyle = Object.fromEntries(
      Object.entries(legacySettings.routeStyle).filter(
        ([key]) =>
          ![
            'trailLengthEnabled',
            'trailLengthMeters',
            'trailBorderColor',
            'trailBorderWidthPixels',
          ].includes(key),
      ),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        settings: { ...legacySettings, routeStyle: legacyRouteStyle },
      }),
    );

    expect(loadSettingsPreset().routeStyle.trailLengthEnabled).toBe(true);
    expect(loadSettingsPreset().routeStyle.trailLengthMeters).toBe(5000);
  });

  it('adds time and watermark defaults to version 3 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyOverlay = Object.fromEntries(
      Object.entries(legacySettings.overlay).filter(
        ([key]) => !['time', 'watermark'].includes(key),
      ),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        settings: { ...legacySettings, overlay: legacyOverlay },
      }),
    );

    expect(loadSettingsPreset().overlay.time).toBe(true);
    expect(loadSettingsPreset().overlay.watermark).toBe(true);
  });
});
