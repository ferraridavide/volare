export interface FlightFix {
  timestampMs: number;
  elapsedSeconds: number;
  latitudeDegrees: number;
  longitudeDegrees: number;
  gnssAltitudeMeters: number | null;
  pressureAltitudeMeters: number | null;
  altitudeMeters: number;
  groundSpeedMps: number;
  cumulativeDistanceMeters: number;
  valid: boolean;
}

export interface FlightBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  minimumAltitudeMeters: number;
  maximumAltitudeMeters: number;
}

export interface FlightMetadata {
  fileName: string;
  date: string | null;
  pilot: string | null;
  gliderType: string | null;
  logger: string | null;
}

export interface FlightTrack {
  metadata: FlightMetadata;
  fixes: FlightFix[];
  durationSeconds: number;
  totalDistanceMeters: number;
  bounds: FlightBounds;
  warnings: string[];
}

export interface InterpolatedFix extends FlightFix {
  sourceIndex: number;
}

export type UnitSystem = 'metric' | 'imperial';
export type OutputPreset = '1080p' | '1440p' | '4k';
export type VideoAspectRatio = 'landscape' | 'vertical';
export type FrameRate = 24 | 30 | 60;

export interface CameraSettings {
  distanceMeters: number;
  elevationAngleDegrees: number;
  lookAheadSeconds: number;
  lagSeconds: number;
  followSmoothingSeconds: number;
  headingSmoothingSeconds: number;
  headingOffsetDegrees: number;
  fixedHeadingEnabled: boolean;
  fixedHeadingDegrees: number;
  fieldOfViewDegrees: number;
  minimumTerrainClearanceMeters: number;
}

export interface CameraKeyframe {
  id: string;
  flightSeconds: number;
  camera: CameraSettings;
}

export interface OverlaySettings {
  enabled: boolean;
  altitude: boolean;
  speed: boolean;
  distance: boolean;
  time: boolean;
  watermark: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
}

export interface RouteStyleSettings {
  showGhostRoute: boolean;
  trailLengthEnabled: boolean;
  trailLengthMeters: number;
  smoothingPasses: number;
  routeColor: string;
  trailColor: string;
  trailBorderColor: string;
  trailBorderWidthPixels: number;
  markerColor: string;
  markerSizePixels: number;
  lineWidthPixels: number;
}

export interface ProjectSettings {
  trimStartSeconds: number;
  trimEndSeconds: number;
  targetDurationSeconds: number;
  outputPreset: OutputPreset;
  aspectRatio: VideoAspectRatio;
  frameRate: FrameRate;
  bitrateMbps: number;
  altitudeOffsetMeters: number;
  unitSystem: UnitSystem;
  camera: CameraSettings;
  cameraKeyframes: CameraKeyframe[];
  overlay: OverlaySettings;
  routeStyle: RouteStyleSettings;
}

export type RenderJobStatus =
  | 'idle'
  | 'preflight'
  | 'rendering'
  | 'finalizing'
  | 'completed'
  | 'canceled'
  | 'failed';

export interface RenderJob {
  status: RenderJobStatus;
  completedFrames: number;
  totalFrames: number;
  currentFlightSeconds: number;
  tileStatus: string;
  elapsedSeconds: number;
  error: string | null;
}

export interface CameraPose {
  focusLatitudeDegrees: number;
  focusLongitudeDegrees: number;
  focusAltitudeMeters: number;
  orbitHeadingDegrees: number;
  orbitDistanceMeters: number;
  elevationAngleDegrees: number;
  cameraLatitudeDegrees: number;
  cameraLongitudeDegrees: number;
  cameraAltitudeMeters: number;
  targetLatitudeDegrees: number;
  targetLongitudeDegrees: number;
  targetAltitudeMeters: number;
  headingDegrees: number;
}

export interface OutputDimensions {
  width: number;
  height: number;
}
