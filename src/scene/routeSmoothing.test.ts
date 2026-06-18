import { Cartesian3 } from 'cesium';
import { describe, expect, it } from 'vitest';

import { smoothRoutePositions } from './routeSmoothing';

describe('smoothRoutePositions', () => {
  it('rounds corners without changing endpoints or point count', () => {
    const positions = [new Cartesian3(0, 0, 0), new Cartesian3(1, 1, 0), new Cartesian3(2, 0, 0)];
    const smoothed = smoothRoutePositions(positions, 1);

    expect(smoothed).toHaveLength(3);
    expect(smoothed[0]).toEqual(positions[0]);
    expect(smoothed[1]).toEqual(new Cartesian3(1, 0.5, 0));
    expect(smoothed[2]).toEqual(positions[2]);
  });

  it('leaves the route untouched when smoothing is disabled', () => {
    const positions = [new Cartesian3(0, 0, 0), new Cartesian3(1, 1, 0)];
    expect(smoothRoutePositions(positions, 0)).toBe(positions);
  });
});
