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

  it('adds variometer defaults to version 4 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyOverlay = Object.fromEntries(
      Object.entries(legacySettings.overlay).filter(
        ([key]) => !['variometer', 'variometerSamples'].includes(key),
      ),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 4, settings: { ...legacySettings, overlay: legacyOverlay } }),
    );

    expect(loadSettingsPreset().overlay.variometer).toBe(true);
    expect(loadSettingsPreset().overlay.variometerUpdateRateSeconds).toBe(0.2);
  });

  it('adds the variometer update rate to version 5 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyOverlay = Object.fromEntries(
      Object.entries(legacySettings.overlay).filter(
        ([key]) => key !== 'variometerUpdateRateSeconds',
      ),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 5, settings: { ...legacySettings, overlay: legacyOverlay } }),
    );

    expect(loadSettingsPreset().overlay.variometerUpdateRateSeconds).toBe(0.2);
  });

  it('removes the legacy variometer sample count from version 6 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyOverlay = { ...legacySettings.overlay, variometerSamples: 5 };
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 6, settings: { ...legacySettings, overlay: legacyOverlay } }),
    );

    expect(loadSettingsPreset().overlay).not.toHaveProperty('variometerSamples');
  });

  it('adds the playback-time meter moving average to version 8 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyOverlay = Object.fromEntries(
      Object.entries(legacySettings.overlay).filter(
        ([key]) => key !== 'variometerMeterAverageSeconds',
      ),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 8,
        settings: {
          ...legacySettings,
          overlay: { ...legacyOverlay, variometerMeterSamples: 5 },
        },
      }),
    );

    expect(loadSettingsPreset().overlay.variometerMeterAverageSeconds).toBe(0.3);
    expect(loadSettingsPreset().overlay).not.toHaveProperty('variometerMeterSamples');
  });

  it('adds the gauge toggle to version 9 presets', () => {
    const legacySettings = createDefaultSettings();
    const legacyOverlay = Object.fromEntries(
      Object.entries(legacySettings.overlay).filter(([key]) => key !== 'variometerGauge'),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 9, settings: { ...legacySettings, overlay: legacyOverlay } }),
    );

    expect(loadSettingsPreset().overlay.variometerGauge).toBe(true);
  });
});
