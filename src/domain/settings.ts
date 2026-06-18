import type { OutputDimensions, OutputPreset, ProjectSettings, VideoAspectRatio } from './types';

export const OUTPUT_DIMENSIONS: Record<OutputPreset, OutputDimensions> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

const DEFAULT_FLIGHT_DURATION_SECONDS = 10_378;

export function createDefaultSettings(
  flightDurationSeconds = DEFAULT_FLIGHT_DURATION_SECONDS,
): ProjectSettings {
  return {
    trimStartSeconds: 0,
    trimEndSeconds: flightDurationSeconds,
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
    cameraKeyframes: [],
    overlay: {
      enabled: true,
      altitude: true,
      speed: true,
      distance: true,
      time: true,
      watermark: true,
      backgroundColor: '#030d0c',
      backgroundOpacity: 0.35,
    },
    routeStyle: {
      showGhostRoute: false,
      trailLengthEnabled: true,
      trailLengthMeters: 5000,
      smoothingPasses: 3,
      routeColor: '#e7f4ef',
      trailColor: '#efad38',
      trailBorderColor: '#000000',
      trailBorderWidthPixels: 2,
      markerColor: '#fff4d6',
      markerSizePixels: 10,
      lineWidthPixels: 4,
    },
  };
}

export function getOutputDimensions(
  outputPreset: OutputPreset,
  aspectRatio: VideoAspectRatio,
): OutputDimensions {
  const landscapeDimensions = OUTPUT_DIMENSIONS[outputPreset];
  if (aspectRatio === 'landscape') return landscapeDimensions;
  return { width: landscapeDimensions.height, height: landscapeDimensions.width };
}

export function calculateFlightSecondsPerVideoSecond(
  settings: Pick<ProjectSettings, 'trimStartSeconds' | 'trimEndSeconds' | 'targetDurationSeconds'>,
): number {
  if (settings.targetDurationSeconds <= 0) return 1;
  return (settings.trimEndSeconds - settings.trimStartSeconds) / settings.targetDurationSeconds;
}

export function mapVideoTimeToFlightTime(
  videoSeconds: number,
  settings: Pick<ProjectSettings, 'trimStartSeconds' | 'trimEndSeconds' | 'targetDurationSeconds'>,
): number {
  if (settings.targetDurationSeconds <= 0) return settings.trimStartSeconds;
  const progress = Math.min(1, Math.max(0, videoSeconds / settings.targetDurationSeconds));
  return (
    settings.trimStartSeconds + progress * (settings.trimEndSeconds - settings.trimStartSeconds)
  );
}

export function sanitizeSettings(
  settings: ProjectSettings,
  flightDurationSeconds: number,
): ProjectSettings {
  const trimStartSeconds = clamp(settings.trimStartSeconds, 0, flightDurationSeconds);
  const trimEndSeconds = clamp(
    Math.max(settings.trimEndSeconds, trimStartSeconds + 0.1),
    0,
    flightDurationSeconds,
  );

  return {
    ...settings,
    trimStartSeconds,
    trimEndSeconds,
    targetDurationSeconds: clamp(settings.targetDurationSeconds, 1, 3600),
    bitrateMbps: clamp(settings.bitrateMbps, 1, 200),
    cameraKeyframes: settings.cameraKeyframes
      .map((keyframe) => ({
        ...keyframe,
        flightSeconds: clamp(keyframe.flightSeconds, 0, flightDurationSeconds),
      }))
      .sort((a, b) => a.flightSeconds - b.flightSeconds),
    overlay: {
      ...settings.overlay,
      backgroundOpacity: clamp(settings.overlay.backgroundOpacity, 0, 1),
    },
    routeStyle: {
      ...settings.routeStyle,
      trailLengthMeters: clamp(settings.routeStyle.trailLengthMeters, 1, 100_000),
      trailBorderWidthPixels: clamp(settings.routeStyle.trailBorderWidthPixels, 0, 20),
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
