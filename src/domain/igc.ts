import { calculateDistanceMeters } from './geo';
import type { FlightBounds, FlightFix, FlightMetadata, FlightTrack } from './types';

interface ParsedFix {
  secondsOfDay: number;
  latitudeDegrees: number;
  longitudeDegrees: number;
  pressureAltitudeMeters: number | null;
  gnssAltitudeMeters: number | null;
  valid: boolean;
}

interface ParseContext {
  metadata: FlightMetadata;
  warnings: string[];
  date: Date | null;
  parsedFixes: ParsedFix[];
  malformedFixCount: number;
  invalidFixCount: number;
}

export function parseIgc(text: string, fileName = 'flight.igc'): FlightTrack {
  if (!text.trim()) throw new Error(`IGC file "${fileName}" is empty; expected text records.`);

  const context = createParseContext(fileName);
  for (const line of text.replaceAll('\r', '').split('\n')) parseLine(line, context);
  appendParseWarnings(context);

  const fixes = buildFlightFixes(context);
  if (fixes.length < 2) {
    throw new Error(
      `IGC file "${fileName}" contains ${fixes.length} usable fixes; expected at least 2.`,
    );
  }

  return buildFlightTrack(context.metadata, fixes, context.warnings);
}

function createParseContext(fileName: string): ParseContext {
  return {
    metadata: { fileName, date: null, pilot: null, gliderType: null, logger: null },
    warnings: [],
    date: null,
    parsedFixes: [],
    malformedFixCount: 0,
    invalidFixCount: 0,
  };
}

function parseLine(line: string, context: ParseContext): void {
  if (line.startsWith('HFDTE')) parseDateHeader(line, context);
  else if (line.startsWith('HFPLT')) context.metadata.pilot = headerValue(line);
  else if (line.startsWith('HFGTY')) context.metadata.gliderType = headerValue(line);
  else if (line.startsWith('HFFTY')) context.metadata.logger = headerValue(line);
  else if (line.startsWith('B')) parseFixLine(line, context);
}

function parseDateHeader(line: string, context: ParseContext): void {
  const match = line.slice(5).match(/(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    context.warnings.push(`Could not parse flight date from header "${line}".`);
    return;
  }
  const [, dayText, monthText, yearText] = match;
  const yearNumber = Number(yearText);
  const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
  const date = new Date(Date.UTC(fullYear, Number(monthText) - 1, Number(dayText)));
  if (!isValidDate(date, Number(dayText), Number(monthText))) {
    context.warnings.push(`Flight date "${dayText}${monthText}${yearText}" is invalid.`);
    return;
  }
  context.date = date;
  context.metadata.date = date.toISOString().slice(0, 10);
}

function parseFixLine(line: string, context: ParseContext): void {
  if (line.length < 35) {
    context.malformedFixCount += 1;
    return;
  }

  const fix = parseBasicFix(line);
  if (!fix) {
    context.malformedFixCount += 1;
    return;
  }
  if (!fix.valid) {
    context.invalidFixCount += 1;
    return;
  }
  context.parsedFixes.push(fix);
}

function parseBasicFix(line: string): ParsedFix | null {
  const hours = parseInteger(line.slice(1, 3));
  const minutes = parseInteger(line.slice(3, 5));
  const seconds = parseInteger(line.slice(5, 7));
  const latitude = parseCoordinate(line.slice(7, 14), line[14], 2);
  const longitude = parseCoordinate(line.slice(15, 23), line[23], 3);
  if (hours === null || minutes === null || seconds === null || !latitude || !longitude)
    return null;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return {
    secondsOfDay: hours * 3600 + minutes * 60 + seconds,
    latitudeDegrees: latitude,
    longitudeDegrees: longitude,
    valid: line[24] === 'A',
    pressureAltitudeMeters: parseAltitude(line.slice(25, 30)),
    gnssAltitudeMeters: parseAltitude(line.slice(30, 35)),
  };
}

function parseCoordinate(value: string, hemisphere: string | undefined, degreeDigits: number) {
  if (!/^[0-9]+$/.test(value)) return null;
  const degrees = Number(value.slice(0, degreeDigits));
  const minutes = Number(value.slice(degreeDigits, degreeDigits + 2));
  const thousandths = Number(value.slice(degreeDigits + 2));
  if (minutes >= 60 || !hemisphere || !'NSEW'.includes(hemisphere)) return null;
  const coordinate = degrees + (minutes + thousandths / 1000) / 60;
  return hemisphere === 'S' || hemisphere === 'W' ? -coordinate : coordinate;
}

function buildFlightFixes(context: ParseContext): FlightFix[] {
  if (!context.date)
    context.warnings.push('No valid flight date found; relative timing is still available.');
  const baseTimestamp = context.date?.getTime() ?? 0;
  const timestamped = addTimestamps(context.parsedFixes, baseTimestamp, context.warnings);
  if (!timestamped.length) return [];

  const firstTimestamp = timestamped[0]!.timestampMs;
  let cumulativeDistanceMeters = 0;
  const fixes = timestamped.map((fix, index): FlightFix => {
    const previous = timestamped[index - 1];
    if (previous) cumulativeDistanceMeters += calculateDistanceMeters(previous, fix);
    return {
      ...fix,
      elapsedSeconds: (fix.timestampMs - firstTimestamp) / 1000,
      altitudeMeters: fix.gnssAltitudeMeters ?? fix.pressureAltitudeMeters ?? 0,
      groundSpeedMps: 0,
      cumulativeDistanceMeters,
    };
  });
  return calculateSmoothedSpeeds(fixes, 5);
}

function addTimestamps(parsedFixes: ParsedFix[], baseTimestamp: number, warnings: string[]) {
  let dayOffset = 0;
  let previousSeconds = -1;
  let duplicateCount = 0;
  const timestamped: Array<ParsedFix & { timestampMs: number }> = [];

  for (const fix of parsedFixes) {
    if (previousSeconds >= 0 && fix.secondsOfDay < previousSeconds - 43_200) dayOffset += 86_400;
    const timestampMs = baseTimestamp + (dayOffset + fix.secondsOfDay) * 1000;
    if (timestamped.at(-1)?.timestampMs === timestampMs) {
      duplicateCount += 1;
      continue;
    }
    if (timestamped.at(-1) && timestampMs < timestamped.at(-1)!.timestampMs) {
      warnings.push(`Ignored out-of-order fix at ${formatSecondsOfDay(fix.secondsOfDay)}.`);
      continue;
    }
    timestamped.push({ ...fix, timestampMs });
    previousSeconds = fix.secondsOfDay;
  }
  if (duplicateCount) warnings.push(`Ignored ${duplicateCount} duplicate timestamp fixes.`);
  return timestamped;
}

function calculateSmoothedSpeeds(fixes: FlightFix[], windowSeconds: number): FlightFix[] {
  return fixes.map((fix, fixIndex) => {
    const startTime = fix.elapsedSeconds - windowSeconds / 2;
    const endTime = fix.elapsedSeconds + windowSeconds / 2;
    let startIndex = findNearestIndex(fixes, startTime);
    let endIndex = findNearestIndex(fixes, endTime);
    if (startIndex === endIndex) {
      startIndex = Math.max(0, fixIndex - 1);
      endIndex = Math.min(fixes.length - 1, fixIndex + 1);
    }
    const elapsed = fixes[endIndex]!.elapsedSeconds - fixes[startIndex]!.elapsedSeconds;
    const distance =
      fixes[endIndex]!.cumulativeDistanceMeters - fixes[startIndex]!.cumulativeDistanceMeters;
    return { ...fix, groundSpeedMps: elapsed > 0 ? distance / elapsed : 0 };
  });
}

function findNearestIndex(fixes: FlightFix[], elapsedSeconds: number): number {
  let nearestIndex = 0;
  let nearestDifference = Number.POSITIVE_INFINITY;
  for (let index = 0; index < fixes.length; index += 1) {
    const difference = Math.abs(fixes[index]!.elapsedSeconds - elapsedSeconds);
    if (difference >= nearestDifference) break;
    nearestIndex = index;
    nearestDifference = difference;
  }
  return nearestIndex;
}

function buildFlightTrack(
  metadata: FlightMetadata,
  fixes: FlightFix[],
  warnings: string[],
): FlightTrack {
  return {
    metadata,
    fixes,
    durationSeconds: fixes.at(-1)!.elapsedSeconds,
    totalDistanceMeters: fixes.at(-1)!.cumulativeDistanceMeters,
    bounds: calculateBounds(fixes),
    warnings,
  };
}

function calculateBounds(fixes: FlightFix[]): FlightBounds {
  return fixes.reduce<FlightBounds>(
    (bounds, fix) => ({
      north: Math.max(bounds.north, fix.latitudeDegrees),
      south: Math.min(bounds.south, fix.latitudeDegrees),
      east: Math.max(bounds.east, fix.longitudeDegrees),
      west: Math.min(bounds.west, fix.longitudeDegrees),
      minimumAltitudeMeters: Math.min(bounds.minimumAltitudeMeters, fix.altitudeMeters),
      maximumAltitudeMeters: Math.max(bounds.maximumAltitudeMeters, fix.altitudeMeters),
    }),
    {
      north: -Infinity,
      south: Infinity,
      east: -Infinity,
      west: Infinity,
      minimumAltitudeMeters: Infinity,
      maximumAltitudeMeters: -Infinity,
    },
  );
}

function appendParseWarnings(context: ParseContext): void {
  if (context.malformedFixCount) {
    context.warnings.push(`Ignored ${context.malformedFixCount} malformed fix records.`);
  }
  if (context.invalidFixCount) {
    context.warnings.push(`Ignored ${context.invalidFixCount} fixes marked invalid.`);
  }
}

function parseAltitude(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function headerValue(line: string): string | null {
  const separator = line.indexOf(':');
  const value = (separator >= 0 ? line.slice(separator + 1) : line.slice(5)).trim();
  return value || null;
}

function isValidDate(date: Date, day: number, month: number): boolean {
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1;
}

function formatSecondsOfDay(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(11, 19);
}
