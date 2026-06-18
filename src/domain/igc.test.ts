import { describe, expect, it } from 'vitest';

import { parseIgc } from './igc';

const HEADER = [
  'AXGD Flymaster',
  'HFDTE170624',
  'HFPLTPILOTINCHARGE:Test Pilot',
  'HFGTYGLIDERTYPE:Advance Omega',
  'HFFTYFRTYPE:Flymaster,LiveSD',
  'I013638FXA',
];

function fix(
  time: string,
  latitude = '4512345N',
  longitude = '01112345E',
  validity = 'A',
  pressureAltitude = '01234',
  gnssAltitude = '01250',
  extension = '015',
): string {
  return `B${time}${latitude}${longitude}${validity}${pressureAltitude}${gnssAltitude}${extension}`;
}

describe('parseIgc', () => {
  it('parses metadata, fixes, altitude, and derived values', () => {
    const text = [...HEADER, fix('101500'), fix('101510', '4512445N')].join('\n');
    const track = parseIgc(text, 'bassano.igc');

    expect(track.metadata).toMatchObject({
      fileName: 'bassano.igc',
      date: '2024-06-17',
      pilot: 'Test Pilot',
      gliderType: 'Advance Omega',
    });
    expect(track.fixes).toHaveLength(2);
    expect(track.fixes[0]).toMatchObject({
      altitudeMeters: 1250,
      pressureAltitudeMeters: 1234,
      gnssAltitudeMeters: 1250,
    });
    expect(track.durationSeconds).toBe(10);
    expect(track.totalDistanceMeters).toBeGreaterThan(150);
    expect(track.fixes[0]!.groundSpeedMps).toBeGreaterThan(0);
  });

  it('rolls timestamps across midnight', () => {
    const text = [...HEADER, fix('235958'), fix('000003', '4512445N')].join('\n');
    const track = parseIgc(text);

    expect(track.durationSeconds).toBe(5);
    expect(track.fixes[1]!.timestampMs - track.fixes[0]!.timestampMs).toBe(5000);
  });

  it('ignores invalid, malformed, duplicate, and extension data safely', () => {
    const text = [
      ...HEADER,
      fix('101500'),
      fix('101501', '4512346N', '01112346E', 'V'),
      'Bbroken',
      fix('101500', '4512445N'),
      fix('101510', '4512545N'),
    ].join('\n');
    const track = parseIgc(text);

    expect(track.fixes).toHaveLength(2);
    expect(track.warnings.join(' ')).toContain('invalid');
    expect(track.warnings.join(' ')).toContain('malformed');
    expect(track.warnings.join(' ')).toContain('duplicate');
  });

  it('uses pressure altitude when GNSS altitude is unavailable', () => {
    const text = [
      ...HEADER,
      fix('101500', undefined, undefined, 'A', '01234', 'abcde'),
      fix('101510'),
    ].join('\n');
    const track = parseIgc(text);

    expect(track.fixes[0]!.altitudeMeters).toBe(1234);
    expect(track.fixes[0]!.gnssAltitudeMeters).toBeNull();
  });

  it('rejects a file without enough usable fixes', () => {
    expect(() => parseIgc('HFDTE170624\nBbroken', 'bad.igc')).toThrow(
      'contains 0 usable fixes; expected at least 2',
    );
  });
});
