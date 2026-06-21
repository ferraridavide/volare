import { calculateBearingDegrees, calculateDistanceMeters, offsetPoint } from './geo';
import { interpolateFlight } from './flight';
import type { CameraPose, CameraSettings, FlightTrack } from './types';

const DEGREES_TO_RADIANS = Math.PI / 180;
const DRAG_DEGREES_PER_PIXEL = 0.25;
const SMOOTHING_SAMPLES = [
  { offset: -0.5, weight: 1 },
  { offset: -0.375, weight: 2 },
  { offset: -0.25, weight: 3 },
  { offset: -0.125, weight: 4 },
  { offset: 0, weight: 5 },
  { offset: 0.125, weight: 4 },
  { offset: 0.25, weight: 3 },
  { offset: 0.375, weight: 2 },
  { offset: 0.5, weight: 1 },
] as const;

export function adjustCameraFromDrag(
  camera: CameraSettings,
  deltaX: number,
  deltaY: number,
): CameraSettings {
  return {
    ...camera,
    elevationAngleDegrees: clamp(
      camera.elevationAngleDegrees + deltaY * DRAG_DEGREES_PER_PIXEL,
      -75,
      75,
    ),
    fixedHeadingDegrees: camera.fixedHeadingEnabled
      ? normalizeDegrees(camera.fixedHeadingDegrees + deltaX * DRAG_DEGREES_PER_PIXEL)
      : camera.fixedHeadingDegrees,
  };
}

export function calculateCameraPose(
  track: FlightTrack,
  flightSeconds: number,
  settings: CameraSettings,
  altitudeOffsetMeters = 0,
  flightSecondsPerVideoSecond = 1,
): CameraPose {
  const followTime = clampTime(
    track,
    flightSeconds - settings.lagSeconds * flightSecondsPerVideoSecond,
  );
  const followWindow = settings.followSmoothingSeconds * flightSecondsPerVideoSecond;
  const halfWindow = (settings.headingSmoothingSeconds * flightSecondsPerVideoSecond) / 2;
  const headingStart = smoothFlightPoint(
    track,
    clampTime(track, followTime - halfWindow),
    followWindow,
    altitudeOffsetMeters,
  );
  const headingEnd = smoothFlightPoint(
    track,
    clampTime(track, followTime + halfWindow),
    followWindow,
    altitudeOffsetMeters,
  );
  const trackHeadingDegrees = calculateBearingDegrees(headingStart, headingEnd);
  const orbitHeadingDegrees = settings.fixedHeadingEnabled
    ? normalizeDegrees(settings.fixedHeadingDegrees)
    : normalizeDegrees(trackHeadingDegrees + settings.headingOffsetDegrees);
  const followFix = smoothFlightPoint(track, followTime, followWindow, altitudeOffsetMeters);
  const lookAheadFlightSeconds = settings.lookAheadSeconds * flightSecondsPerVideoSecond;
  const lookAheadFix = smoothFlightPoint(
    track,
    clampTime(track, followTime + lookAheadFlightSeconds),
    followWindow,
    altitudeOffsetMeters,
  );
  const headingRadians = orbitHeadingDegrees * DEGREES_TO_RADIANS;
  const elevationRadians = clamp(settings.elevationAngleDegrees, -89, 89) * DEGREES_TO_RADIANS;
  const horizontalDistanceMeters = Math.cos(elevationRadians) * settings.distanceMeters;
  const cameraHeightMeters = Math.sin(elevationRadians) * settings.distanceMeters;
  const eastMeters = -Math.sin(headingRadians) * horizontalDistanceMeters;
  const northMeters = -Math.cos(headingRadians) * horizontalDistanceMeters;
  const cameraPoint = offsetPoint(followFix, eastMeters, northMeters);
  const targetPoint = lookAheadFix;
  const viewHeadingDegrees = calculateBearingDegrees(cameraPoint, targetPoint);

  return {
    focusLatitudeDegrees: followFix.latitudeDegrees,
    focusLongitudeDegrees: followFix.longitudeDegrees,
    focusAltitudeMeters: followFix.altitudeMeters,
    orbitHeadingDegrees,
    orbitDistanceMeters: settings.distanceMeters,
    elevationAngleDegrees: settings.elevationAngleDegrees,
    cameraLatitudeDegrees: cameraPoint.latitudeDegrees,
    cameraLongitudeDegrees: cameraPoint.longitudeDegrees,
    cameraAltitudeMeters: followFix.altitudeMeters + cameraHeightMeters,
    targetLatitudeDegrees: targetPoint.latitudeDegrees,
    targetLongitudeDegrees: targetPoint.longitudeDegrees,
    targetAltitudeMeters: lookAheadFix.altitudeMeters,
    headingDegrees: viewHeadingDegrees,
  };
}

export function smoothCameraPose(
  previous: CameraPose,
  desired: CameraPose,
  elapsedVideoSeconds: number,
  settings: CameraSettings,
): CameraPose {
  const positionAmount = smoothingAmount(elapsedVideoSeconds, settings.followSmoothingSeconds);
  const rotationAmount = smoothingAmount(elapsedVideoSeconds, settings.headingSmoothingSeconds);
  const focusLatitudeDegrees = interpolate(
    previous.focusLatitudeDegrees,
    desired.focusLatitudeDegrees,
    positionAmount,
  );
  const focusLongitudeDegrees = interpolateLongitude(
    previous.focusLongitudeDegrees,
    desired.focusLongitudeDegrees,
    positionAmount,
  );
  const focusAltitudeMeters = interpolate(
    previous.focusAltitudeMeters,
    desired.focusAltitudeMeters,
    positionAmount,
  );
  const orbitHeadingDegrees = interpolateDegrees(
    previous.orbitHeadingDegrees,
    desired.orbitHeadingDegrees,
    rotationAmount,
  );
  const orbitDistanceMeters = interpolate(
    previous.orbitDistanceMeters,
    desired.orbitDistanceMeters,
    positionAmount,
  );
  const elevationAngleDegrees = interpolate(
    previous.elevationAngleDegrees,
    desired.elevationAngleDegrees,
    rotationAmount,
  );
  const smoothedCamera = calculateOrbitCamera(
    {
      latitudeDegrees: focusLatitudeDegrees,
      longitudeDegrees: focusLongitudeDegrees,
      altitudeMeters: focusAltitudeMeters,
    },
    orbitHeadingDegrees,
    orbitDistanceMeters,
    elevationAngleDegrees,
  );
  const headingDegrees = interpolateDegrees(
    previous.headingDegrees,
    desired.headingDegrees,
    rotationAmount,
  );
  const viewDistanceMeters = interpolate(
    calculateDistanceMeters(
      {
        latitudeDegrees: previous.cameraLatitudeDegrees,
        longitudeDegrees: previous.cameraLongitudeDegrees,
      },
      {
        latitudeDegrees: previous.targetLatitudeDegrees,
        longitudeDegrees: previous.targetLongitudeDegrees,
      },
    ),
    calculateDistanceMeters(
      {
        latitudeDegrees: desired.cameraLatitudeDegrees,
        longitudeDegrees: desired.cameraLongitudeDegrees,
      },
      {
        latitudeDegrees: desired.targetLatitudeDegrees,
        longitudeDegrees: desired.targetLongitudeDegrees,
      },
    ),
    positionAmount,
  );
  const headingRadians = headingDegrees * DEGREES_TO_RADIANS;
  const targetPoint = offsetPoint(
    {
      latitudeDegrees: smoothedCamera.latitudeDegrees,
      longitudeDegrees: smoothedCamera.longitudeDegrees,
    },
    Math.sin(headingRadians) * viewDistanceMeters,
    Math.cos(headingRadians) * viewDistanceMeters,
  );
  const previousTargetHeight = previous.targetAltitudeMeters - previous.cameraAltitudeMeters;
  const desiredTargetHeight = desired.targetAltitudeMeters - desired.cameraAltitudeMeters;

  return {
    focusLatitudeDegrees,
    focusLongitudeDegrees,
    focusAltitudeMeters,
    orbitHeadingDegrees,
    orbitDistanceMeters,
    elevationAngleDegrees,
    cameraLatitudeDegrees: smoothedCamera.latitudeDegrees,
    cameraLongitudeDegrees: smoothedCamera.longitudeDegrees,
    cameraAltitudeMeters: smoothedCamera.altitudeMeters,
    targetLatitudeDegrees: targetPoint.latitudeDegrees,
    targetLongitudeDegrees: targetPoint.longitudeDegrees,
    targetAltitudeMeters:
      smoothedCamera.altitudeMeters +
      interpolate(previousTargetHeight, desiredTargetHeight, rotationAmount),
    headingDegrees,
  };
}

function calculateOrbitCamera(
  focus: { latitudeDegrees: number; longitudeDegrees: number; altitudeMeters: number },
  headingDegrees: number,
  distanceMeters: number,
  elevationAngleDegrees: number,
): { latitudeDegrees: number; longitudeDegrees: number; altitudeMeters: number } {
  const headingRadians = headingDegrees * DEGREES_TO_RADIANS;
  const elevationRadians = clamp(elevationAngleDegrees, -89, 89) * DEGREES_TO_RADIANS;
  const horizontalDistanceMeters = Math.cos(elevationRadians) * distanceMeters;
  const point = offsetPoint(
    focus,
    -Math.sin(headingRadians) * horizontalDistanceMeters,
    -Math.cos(headingRadians) * horizontalDistanceMeters,
  );
  return {
    ...point,
    altitudeMeters: focus.altitudeMeters + Math.sin(elevationRadians) * distanceMeters,
  };
}

interface SmoothedFlightPoint {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeMeters: number;
}

function smoothFlightPoint(
  track: FlightTrack,
  elapsedSeconds: number,
  windowSeconds: number,
  altitudeOffsetMeters: number,
): SmoothedFlightPoint {
  if (windowSeconds <= 0) {
    return interpolateFlight(track, elapsedSeconds, altitudeOffsetMeters);
  }

  const center = interpolateFlight(track, elapsedSeconds, altitudeOffsetMeters);
  let latitude = 0;
  let longitudeOffset = 0;
  let altitude = 0;
  let totalWeight = 0;

  SMOOTHING_SAMPLES.forEach(({ offset, weight }) => {
    const sample = interpolateFlight(
      track,
      clampTime(track, elapsedSeconds + offset * windowSeconds),
      altitudeOffsetMeters,
    );
    latitude += sample.latitudeDegrees * weight;
    longitudeOffset +=
      shortestLongitudeDelta(center.longitudeDegrees, sample.longitudeDegrees) * weight;
    altitude += sample.altitudeMeters * weight;
    totalWeight += weight;
  });

  return {
    latitudeDegrees: latitude / totalWeight,
    longitudeDegrees: normalizeLongitude(center.longitudeDegrees + longitudeOffset / totalWeight),
    altitudeMeters: altitude / totalWeight,
  };
}

function shortestLongitudeDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothingAmount(elapsedSeconds: number, smoothingSeconds: number): number {
  if (smoothingSeconds <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, elapsedSeconds) / smoothingSeconds);
}

function interpolate(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function interpolateLongitude(a: number, b: number, amount: number): number {
  return normalizeLongitude(a + shortestLongitudeDelta(a, b) * amount);
}

function interpolateDegrees(a: number, b: number, amount: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return normalizeDegrees(a + delta * amount);
}

function clampTime(track: FlightTrack, elapsedSeconds: number): number {
  return Math.max(0, Math.min(track.durationSeconds, elapsedSeconds));
}
