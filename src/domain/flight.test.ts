import { describe, expect, it } from 'vitest';

import { adjustCameraFromDrag, calculateCameraPose, smoothCameraPose } from './camera';
import {
  calculateInstantaneousVariometerMps,
  calculateSmoothedVariometerMps,
  calculateUpdatedSmoothedVariometerMps,
  calculateVariometerScaleMps,
  calculateVariometerMps,
  interpolateFlight,
  locateTrackDistance,
} from './flight';
import { calculateDistanceMeters } from './geo';
import { parseIgc } from './igc';
import {
  calculateFlightSecondsPerVideoSecond,
  createDefaultSettings,
  getOutputDimensions,
  mapVideoTimeToFlightTime,
} from './settings';

const TRACK_TEXT = [
  'HFDTE170624',
  'B1000004500000N01100000EA0100001000',
  'B1000104501000N01100000EA0110001100',
  'B1000204502000N01100000EA0120001200',
].join('\n');

describe('flight interpolation', () => {
  it('maps viewport dragging to elevation and fixed heading', () => {
    const camera = createDefaultSettings().camera;
    const adjusted = adjustCameraFromDrag(camera, 40, 20);

    expect(adjusted.elevationAngleDegrees).toBe(25);
    expect(adjusted.fixedHeadingDegrees).toBe(10);
    expect(
      adjustCameraFromDrag({ ...camera, fixedHeadingEnabled: false }, 40, 20).fixedHeadingDegrees,
    ).toBe(0);
  });

  it('allows viewport dragging to move camera elevation below zero', () => {
    const camera = createDefaultSettings().camera;

    expect(adjustCameraFromDrag(camera, 0, -120).elevationAngleDegrees).toBe(-10);
    expect(adjustCameraFromDrag(camera, 0, -1000).elevationAngleDegrees).toBe(-75);
  });

  it('interpolates position, altitude, and offset', () => {
    const track = parseIgc(TRACK_TEXT);
    const fix = interpolateFlight(track, 5, 25);

    expect(fix.latitudeDegrees).toBeCloseTo(45.008333, 5);
    expect(fix.altitudeMeters).toBe(1075);
    expect(fix.sourceIndex).toBe(0);
  });

  it('calculates variometer average over the update interval', () => {
    const track = parseIgc(TRACK_TEXT);

    expect(calculateVariometerMps(track, 15, 5)).toBeCloseTo(10);
    expect(calculateVariometerMps(track, 0, 5)).toBe(0);
  });

  it('holds the variometer value until the next update interval', () => {
    const track = parseIgc(TRACK_TEXT);

    expect(calculateVariometerMps(track, 15.01, 0.2)).toBe(
      calculateVariometerMps(track, 15.19, 0.2),
    );
  });

  it('anchors variometer updates to the trimmed flight start', () => {
    const track = parseIgc(TRACK_TEXT);

    expect(calculateVariometerMps(track, 15.01, 2, 15)).toBe(
      calculateVariometerMps(track, 16.99, 2, 15),
    );
  });

  it('calculates instantaneous variometer from the current track segment', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[2]!.altitudeMeters = 1300;

    expect(calculateInstantaneousVariometerMps(track, 5)).toBeCloseTo(10);
    expect(calculateInstantaneousVariometerMps(track, 15)).toBeCloseTo(20);
  });

  it('calculates variometer over a continuous moving-average time window', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[1]!.altitudeMeters = 1010;
    track.fixes[2]!.altitudeMeters = 1060;

    expect(calculateSmoothedVariometerMps(track, 10, 5)).toBeCloseTo(1);
    expect(calculateSmoothedVariometerMps(track, 15, 10)).toBeCloseTo(3);
    expect(calculateSmoothedVariometerMps(track, 20, 10)).toBeCloseTo(5);
  });

  it('holds the smoothed variometer at the configured update cadence', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[1]!.altitudeMeters = 1010;
    track.fixes[2]!.altitudeMeters = 1060;

    expect(calculateUpdatedSmoothedVariometerMps(track, 15.1, 5, 10)).toBeCloseTo(3);
    expect(calculateUpdatedSmoothedVariometerMps(track, 19.9, 5, 10)).toBeCloseTo(3);
    expect(calculateUpdatedSmoothedVariometerMps(track, 15.1, 5, 5)).toBeCloseTo(5);
  });

  it('adds ten percent headroom to the largest full-flight variometer magnitude', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[1]!.altitudeMeters = 1010;
    track.fixes[2]!.altitudeMeters = 1060;

    expect(calculateVariometerScaleMps(track, 10)).toBeCloseTo(5.5);
  });

  it('maps output time into the selected flight range', () => {
    const settings = { trimStartSeconds: 10, trimEndSeconds: 130, targetDurationSeconds: 60 };
    expect(mapVideoTimeToFlightTime(30, settings)).toBe(70);
    expect(mapVideoTimeToFlightTime(90, settings)).toBe(130);
    expect(calculateFlightSecondsPerVideoSecond(settings)).toBe(2);
  });

  it('swaps output dimensions for a vertical video', () => {
    expect(getOutputDimensions('1080p', 'landscape')).toEqual({ width: 1920, height: 1080 });
    expect(getOutputDimensions('1080p', 'vertical')).toEqual({ width: 1080, height: 1920 });
  });

  it('defaults new projects to portrait output', () => {
    expect(createDefaultSettings().aspectRatio).toBe('vertical');
  });

  it('locates an exact trail start from cumulative distance', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[0]!.cumulativeDistanceMeters = 0;
    track.fixes[1]!.cumulativeDistanceMeters = 400;
    track.fixes[2]!.cumulativeDistanceMeters = 1000;
    track.totalDistanceMeters = 1000;

    expect(locateTrackDistance(track, 500)).toEqual({ lowerIndex: 1, fraction: 1 / 6 });
  });

  it('produces deterministic camera poses behind the flight direction', () => {
    const track = parseIgc(TRACK_TEXT);
    const settings = createDefaultSettings(track.durationSeconds);
    const first = calculateCameraPose(track, 10, settings.camera);
    const second = calculateCameraPose(track, 10, settings.camera);

    expect(first).toEqual(second);
    expect(first.headingDegrees).toBeCloseTo(0, 1);
    expect(first.cameraLatitudeDegrees).toBeLessThan(first.targetLatitudeDegrees);
    expect(first.cameraAltitudeMeters).toBeGreaterThan(first.targetAltitudeMeters);
  });

  it('applies temporal camera controls in playback seconds', () => {
    const track = parseIgc(TRACK_TEXT);
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      lookAheadSeconds: 2,
      lagSeconds: 1,
      headingSmoothingSeconds: 1,
    };
    const normalSpeed = calculateCameraPose(track, 10, camera, 0, 1);
    const compressedSpeed = calculateCameraPose(track, 10, camera, 0, 5);

    expect(compressedSpeed.targetLatitudeDegrees).toBeGreaterThan(
      normalSpeed.targetLatitudeDegrees,
    );
    expect(compressedSpeed.cameraLatitudeDegrees).toBeLessThan(normalSpeed.cameraLatitudeDegrees);
  });

  it('smooths the point followed by the camera', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[1]!.longitudeDegrees += 0.1;
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      distanceMeters: 0,
      lagSeconds: 0,
      lookAheadSeconds: 0,
      followSmoothingSeconds: 0,
    };
    const unsmoothed = calculateCameraPose(track, 10, camera);
    const smoothed = calculateCameraPose(track, 10, {
      ...camera,
      followSmoothingSeconds: 4,
    });

    expect(smoothed.cameraLongitudeDegrees).toBeLessThan(unsmoothed.cameraLongitudeDegrees);
  });

  it('uses rotation smoothing for the actual viewing direction', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[2]!.longitudeDegrees += 0.1;
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      followSmoothingSeconds: 0,
      headingSmoothingSeconds: 0.05,
      fixedHeadingEnabled: false,
    };
    const abruptBefore = calculateCameraPose(track, 9.5, camera).headingDegrees;
    const abruptAfter = calculateCameraPose(track, 10.5, camera).headingDegrees;
    const smoothCamera = { ...camera, headingSmoothingSeconds: 8 };
    const smoothBefore = calculateCameraPose(track, 9.5, smoothCamera).headingDegrees;
    const smoothAfter = calculateCameraPose(track, 10.5, smoothCamera).headingDegrees;

    expect(angleDifference(smoothBefore, smoothAfter)).toBeLessThan(
      angleDifference(abruptBefore, abruptAfter),
    );
  });

  it('supports a fixed compass heading', () => {
    const track = parseIgc(TRACK_TEXT);
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      lookAheadSeconds: 0,
      fixedHeadingEnabled: true,
      fixedHeadingDegrees: 275,
    };

    expect(calculateCameraPose(track, 10, camera).headingDegrees).toBeCloseTo(275, 1);
  });

  it('applies an offset to automatic track heading', () => {
    const track = parseIgc(TRACK_TEXT);
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      lookAheadSeconds: 0,
      headingOffsetDegrees: 90,
      fixedHeadingEnabled: false,
    };

    expect(calculateCameraPose(track, 10, camera).headingDegrees).toBeCloseTo(90, 1);
  });

  it('positions the camera using an elevation angle', () => {
    const track = parseIgc(TRACK_TEXT);
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      distanceMeters: 400,
      elevationAngleDegrees: 45,
      lookAheadSeconds: 0,
    };
    const pose = calculateCameraPose(track, 10, camera);
    const horizontalDistance = calculateDistanceMeters(
      {
        latitudeDegrees: pose.cameraLatitudeDegrees,
        longitudeDegrees: pose.cameraLongitudeDegrees,
      },
      {
        latitudeDegrees: pose.targetLatitudeDegrees,
        longitudeDegrees: pose.targetLongitudeDegrees,
      },
    );

    expect(pose.cameraAltitudeMeters - pose.targetAltitudeMeters).toBeCloseTo(
      horizontalDistance,
      0,
    );
  });

  it('advances camera motion from its previous pose', () => {
    const track = parseIgc(TRACK_TEXT);
    const camera = createDefaultSettings(track.durationSeconds).camera;
    const previous = calculateCameraPose(track, 5, camera);
    const desired = calculateCameraPose(track, 15, camera);
    const smoothed = smoothCameraPose(previous, desired, 1 / 30, camera);

    expect(smoothed.cameraLatitudeDegrees).toBeGreaterThan(previous.cameraLatitudeDegrees);
    expect(smoothed.cameraLatitudeDegrees).toBeLessThan(desired.cameraLatitudeDegrees);
    expect(smoothed.targetLatitudeDegrees).toBeGreaterThan(previous.cameraLatitudeDegrees);
  });

  it('applies heading smoothing to the camera orbit', () => {
    const track = parseIgc(TRACK_TEXT);
    track.fixes[2]!.longitudeDegrees += 0.1;
    const camera = {
      ...createDefaultSettings(track.durationSeconds).camera,
      followSmoothingSeconds: 0,
      headingSmoothingSeconds: 0.05,
      fixedHeadingEnabled: false,
    };
    const previous = calculateCameraPose(track, 9, camera);
    const desired = calculateCameraPose(track, 11, camera);
    const responsive = smoothCameraPose(previous, desired, 1 / 30, camera);
    const smooth = smoothCameraPose(previous, desired, 1 / 30, {
      ...camera,
      headingSmoothingSeconds: 5,
    });

    expect(angleDifference(previous.orbitHeadingDegrees, smooth.orbitHeadingDegrees)).toBeLessThan(
      angleDifference(previous.orbitHeadingDegrees, responsive.orbitHeadingDegrees),
    );
  });
});

function angleDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}
