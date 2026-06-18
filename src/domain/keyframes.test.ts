import { describe, expect, it } from 'vitest';

import { interpolateCameraSettings } from './keyframes';
import { createDefaultSettings } from './settings';

describe('camera keyframes', () => {
  it('uses smooth cubic interpolation between camera snapshots', () => {
    const camera = createDefaultSettings().camera;
    const result = interpolateCameraSettings(
      camera,
      [
        { id: 'a', flightSeconds: 0, camera: { ...camera, distanceMeters: 100 } },
        { id: 'b', flightSeconds: 10, camera: { ...camera, distanceMeters: 500 } },
      ],
      2.5,
    );

    expect(result.distanceMeters).toBe(162.5);
    expect(result.distanceMeters).not.toBe(200);
  });

  it('interpolates headings across the shortest angle', () => {
    const camera = createDefaultSettings().camera;
    const result = interpolateCameraSettings(
      camera,
      [
        { id: 'a', flightSeconds: 0, camera: { ...camera, fixedHeadingDegrees: 350 } },
        { id: 'b', flightSeconds: 10, camera: { ...camera, fixedHeadingDegrees: 10 } },
      ],
      5,
    );

    expect(result.fixedHeadingDegrees).toBe(360);
  });

  it('holds the nearest snapshot outside the keyframed interval', () => {
    const camera = createDefaultSettings().camera;
    const first = { id: 'a', flightSeconds: 3, camera: { ...camera, distanceMeters: 100 } };
    const last = { id: 'b', flightSeconds: 8, camera: { ...camera, distanceMeters: 500 } };

    expect(interpolateCameraSettings(camera, [last, first], 0).distanceMeters).toBe(100);
    expect(interpolateCameraSettings(camera, [last, first], 20).distanceMeters).toBe(500);
  });
});
