import {
  CallbackProperty,
  CallbackPositionProperty,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  NearFarScalar,
  PerspectiveFrustum,
  PolylineOutlineMaterialProperty,
  Terrain,
  Viewer,
} from 'cesium';

import { calculateCameraPose, smoothCameraPose } from '@/domain/camera';
import { interpolateCameraSettings } from '@/domain/keyframes';
import { interpolateFlight, locateTrackDistance } from '@/domain/flight';
import { calculateFlightSecondsPerVideoSecond } from '@/domain/settings';
import type {
  CameraPose,
  FlightTrack,
  InterpolatedFix,
  OutputDimensions,
  ProjectSettings,
  RouteStyleSettings,
} from '@/domain/types';

import { interpolateRoutePosition, smoothRoutePositions } from './routeSmoothing';

export interface TileWaitOptions {
  timeoutMs: number;
  stableFrames: number;
  signal: AbortSignal;
  onStatus?: (status: string) => void;
}

export class CesiumFlightScene {
  readonly viewer: Viewer;

  private track: FlightTrack | null = null;
  private routeEntity: Entity | null = null;
  private trailEntity: Entity | null = null;
  private markerEntity: Entity | null = null;
  private routePositions: Cartesian3[] = [];
  private trailPositions: Cartesian3[] = [];
  private markerPosition = Cartesian3.ZERO;
  private currentPose: CameraPose | null = null;
  private lastCameraFlightSeconds: number | null = null;
  private previewResolutionScale = 1;
  private currentAltitudeOffset = Number.NaN;
  private currentSmoothingPasses = -1;
  private appliedStyleSignature = '';
  private readonly resourcesReady: Promise<void>;

  constructor(
    container: HTMLElement,
    creditContainer: HTMLElement,
    ionToken: string,
    onError?: (message: string) => void,
  ) {
    Ion.defaultAccessToken = ionToken;
    const terrain = Terrain.fromWorldTerrain({
      requestVertexNormals: true,
      requestWaterMask: true,
    });
    const baseLayer = ImageryLayer.fromWorldImagery({});
    terrain.errorEvent.addEventListener((error) =>
      onError?.(`Cesium World Terrain: ${describeError(error)}`),
    );
    terrain.readyEvent.addEventListener((provider) =>
      provider.errorEvent.addEventListener((error) =>
        onError?.(`Cesium World Terrain tile: ${describeError(error)}`),
      ),
    );
    baseLayer.errorEvent.addEventListener((error) =>
      onError?.(`Bing Aerial imagery: ${describeError(error)}`),
    );
    baseLayer.readyEvent.addEventListener((provider) =>
      provider.errorEvent.addEventListener((error) =>
        onError?.(`Bing Aerial imagery tile: ${describeError(error)}`),
      ),
    );
    this.resourcesReady = Promise.all([waitForTerrain(terrain), waitForImagery(baseLayer)]).then(
      () => undefined,
    );
    this.viewer = new Viewer(container, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      baseLayer,
      terrain,
      scene3DOnly: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      msaaSamples: 4,
      creditContainer,
      contextOptions: {
        webgl: {
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
        },
      },
    });
    this.viewer.scene.globe.depthTestAgainstTerrain = true;
    this.viewer.scene.globe.maximumScreenSpaceError = 1.5;
    this.viewer.scene.screenSpaceCameraController.enableInputs = false;
  }

  setTrack(track: FlightTrack, settings: ProjectSettings): void {
    if (
      this.track === track &&
      this.currentAltitudeOffset === settings.altitudeOffsetMeters &&
      this.currentSmoothingPasses === settings.routeStyle.smoothingPasses
    ) {
      this.applyStyle(settings);
      return;
    }
    if (this.track !== track) this.resetCameraMotion();
    this.track = track;
    this.currentAltitudeOffset = settings.altitudeOffsetMeters;
    this.currentSmoothingPasses = settings.routeStyle.smoothingPasses;
    this.viewer.entities.removeAll();
    this.routePositions = createTrackPositions(
      track,
      settings.altitudeOffsetMeters,
      settings.routeStyle.smoothingPasses,
    );
    this.trailPositions = [this.routePositions[0]!, this.routePositions[0]!];
    this.markerPosition = this.routePositions[0]!;
    this.createEntities(settings);
  }

  updateAtTime(flightSeconds: number, settings: ProjectSettings): void {
    if (!this.track) return;
    this.setTrack(this.track, settings);
    const fix = interpolateFlight(this.track, flightSeconds, settings.altitudeOffsetMeters);
    this.markerPosition = interpolateRoutePosition(
      this.track,
      this.routePositions,
      fix.elapsedSeconds,
      fix.sourceIndex,
    );
    this.trailPositions = createTrailPositions(
      this.track,
      this.routePositions,
      this.markerPosition,
      fix,
      settings.routeStyle,
    );
    const camera = interpolateCameraSettings(
      settings.camera,
      settings.cameraKeyframes,
      flightSeconds,
    );
    const flightSecondsPerVideoSecond = calculateFlightSecondsPerVideoSecond(settings);
    const desiredPose = calculateCameraPose(
      this.track,
      flightSeconds,
      camera,
      settings.altitudeOffsetMeters,
      flightSecondsPerVideoSecond,
    );
    const elapsedVideoSeconds =
      this.lastCameraFlightSeconds === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(flightSeconds - this.lastCameraFlightSeconds) / flightSecondsPerVideoSecond;
    const isSequentialFrame = elapsedVideoSeconds > 0 && elapsedVideoSeconds <= 0.25;
    this.currentPose =
      this.currentPose && isSequentialFrame
        ? smoothCameraPose(this.currentPose, desiredPose, elapsedVideoSeconds, camera)
        : desiredPose;
    this.lastCameraFlightSeconds = flightSeconds;
    this.applyTerrainClearance(camera.minimumTerrainClearanceMeters);
    this.applyCameraPose(this.currentPose, camera.fieldOfViewDegrees);
    this.applyStyle(settings);
    this.viewer.scene.requestRender();
  }

  async waitForTiles(options: TileWaitOptions): Promise<void> {
    const startedAt = performance.now();
    let stableFrameCount = 0;

    options.onStatus?.('Connecting to Cesium ion');
    await waitForPromise(this.resourcesReady, options, startedAt);

    while (stableFrameCount < options.stableFrames) {
      throwIfAborted(options.signal);
      if (performance.now() - startedAt > options.timeoutMs) {
        throw new Error(`Tile loading exceeded ${Math.round(options.timeoutMs / 1000)} seconds.`);
      }
      this.viewer.scene.requestRender();
      await nextAnimationFrame();
      const loaded = this.viewer.scene.globe.tilesLoaded;
      stableFrameCount = loaded ? stableFrameCount + 1 : 0;
      options.onStatus?.(
        loaded ? `Tiles stable ${stableFrameCount}/${options.stableFrames}` : 'Loading tiles',
      );
    }
  }

  ensureTerrainClearance(minimumClearanceMeters: number, fieldOfViewDegrees: number): boolean {
    if (!this.currentPose) return false;
    const changed = this.applyTerrainClearance(minimumClearanceMeters);
    if (changed) this.applyCameraPose(this.currentPose, fieldOfViewDegrees);
    return changed;
  }

  enterExportMode(dimensions: OutputDimensions): void {
    this.resetCameraMotion();
    const canvasWidth = Math.max(1, this.viewer.canvas.clientWidth);
    this.previewResolutionScale = this.viewer.resolutionScale;
    this.viewer.resolutionScale = dimensions.width / canvasWidth;
    this.viewer.scene.globe.maximumScreenSpaceError = 0.5;
    this.viewer.resize();
    this.viewer.scene.requestRender();
  }

  exitExportMode(): void {
    this.viewer.resolutionScale = this.previewResolutionScale;
    this.viewer.scene.globe.maximumScreenSpaceError = 1.5;
    this.viewer.resize();
    this.viewer.scene.requestRender();
  }

  resetCameraMotion(): void {
    this.currentPose = null;
    this.lastCameraFlightSeconds = null;
  }

  getMaximumRenderbufferSize(): number {
    const context = this.viewer.canvas.getContext('webgl2');
    if (!context) return 0;
    return context.getParameter(context.MAX_RENDERBUFFER_SIZE) as number;
  }

  destroy(): void {
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }

  private createEntities(settings: ProjectSettings): void {
    this.routeEntity = this.viewer.entities.add({
      show: settings.routeStyle.showGhostRoute,
      polyline: {
        positions: new ConstantProperty(this.routePositions),
        width: Math.max(1, settings.routeStyle.lineWidthPixels - 1),
        material: colorFromCss(settings.routeStyle.routeColor).withAlpha(0.36),
      },
    });
    this.trailEntity = this.viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => this.trailPositions, false),
        width: settings.routeStyle.lineWidthPixels,
        material: createTrailMaterial(settings.routeStyle),
      },
    });
    this.markerEntity = this.viewer.entities.add({
      position: new CallbackPositionProperty(() => this.markerPosition, false),
      point: {
        color: colorFromCss(settings.routeStyle.markerColor),
        pixelSize: settings.routeStyle.markerSizePixels,
        outlineColor: Color.BLACK.withAlpha(0.8),
        outlineWidth: 3,
        scaleByDistance: new NearFarScalar(100, 1.4, 20_000, 0.7),
        disableDepthTestDistance: 0,
      },
    });
  }

  private applyStyle(settings: ProjectSettings): void {
    const signature = JSON.stringify(settings.routeStyle);
    if (signature === this.appliedStyleSignature) return;
    this.appliedStyleSignature = signature;
    if (this.routeEntity) this.routeEntity.show = settings.routeStyle.showGhostRoute;
    if (this.routeEntity?.polyline) {
      this.routeEntity.polyline.width = new ConstantProperty(
        Math.max(1, settings.routeStyle.lineWidthPixels - 1),
      );
      this.routeEntity.polyline.material = new ColorMaterialProperty(
        colorFromCss(settings.routeStyle.routeColor).withAlpha(0.36),
      );
    }
    if (this.trailEntity?.polyline) {
      this.trailEntity.polyline.width = new ConstantProperty(settings.routeStyle.lineWidthPixels);
      this.trailEntity.polyline.material = createTrailMaterial(settings.routeStyle);
    }
    if (this.markerEntity?.point) {
      this.markerEntity.point.color = new ConstantProperty(
        colorFromCss(settings.routeStyle.markerColor),
      );
      this.markerEntity.point.pixelSize = new ConstantProperty(
        settings.routeStyle.markerSizePixels,
      );
    }
  }

  private applyTerrainClearance(minimumClearanceMeters: number): boolean {
    if (!this.currentPose) return false;
    const cartographic = Cartographic.fromDegrees(
      this.currentPose.cameraLongitudeDegrees,
      this.currentPose.cameraLatitudeDegrees,
    );
    const terrainHeight = this.viewer.scene.globe.getHeight(cartographic);
    if (terrainHeight === undefined) return false;
    const minimumAltitude = terrainHeight + minimumClearanceMeters;
    if (this.currentPose.cameraAltitudeMeters >= minimumAltitude) return false;
    this.currentPose = { ...this.currentPose, cameraAltitudeMeters: minimumAltitude };
    return true;
  }

  private applyCameraPose(pose: CameraPose, fieldOfViewDegrees: number): void {
    const destination = Cartesian3.fromDegrees(
      pose.cameraLongitudeDegrees,
      pose.cameraLatitudeDegrees,
      pose.cameraAltitudeMeters,
    );
    const target = Cartesian3.fromDegrees(
      pose.targetLongitudeDegrees,
      pose.targetLatitudeDegrees,
      pose.targetAltitudeMeters,
    );
    const direction = Cartesian3.normalize(
      Cartesian3.subtract(target, destination, new Cartesian3()),
      new Cartesian3(),
    );
    const geodeticUp = Cartesian3.normalize(destination, new Cartesian3());
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, geodeticUp, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, direction, new Cartesian3()),
      new Cartesian3(),
    );
    this.viewer.camera.setView({ destination, orientation: { direction, up } });
    if (this.viewer.camera.frustum instanceof PerspectiveFrustum) {
      this.viewer.camera.frustum.fov = CesiumMath.toRadians(fieldOfViewDegrees);
    }
  }
}

function createTrackPositions(
  track: FlightTrack,
  altitudeOffsetMeters: number,
  smoothingPasses: number,
): Cartesian3[] {
  const positions = track.fixes.map((fix) =>
    Cartesian3.fromDegrees(
      fix.longitudeDegrees,
      fix.latitudeDegrees,
      fix.altitudeMeters + altitudeOffsetMeters,
    ),
  );
  return smoothRoutePositions(positions, smoothingPasses);
}

function createTrailPositions(
  track: FlightTrack,
  routePositions: Cartesian3[],
  markerPosition: Cartesian3,
  fix: InterpolatedFix,
  style: RouteStyleSettings,
): Cartesian3[] {
  if (!style.trailLengthEnabled || fix.cumulativeDistanceMeters <= style.trailLengthMeters) {
    return [...routePositions.slice(0, fix.sourceIndex + 1), markerPosition];
  }
  const startDistance = fix.cumulativeDistanceMeters - style.trailLengthMeters;
  const start = locateTrackDistance(track, startDistance);
  const startPosition = Cartesian3.lerp(
    routePositions[start.lowerIndex]!,
    routePositions[start.lowerIndex + 1]!,
    start.fraction,
    new Cartesian3(),
  );
  return [
    startPosition,
    ...routePositions.slice(start.lowerIndex + 1, fix.sourceIndex + 1),
    markerPosition,
  ];
}

function createTrailMaterial(style: RouteStyleSettings): PolylineOutlineMaterialProperty {
  return new PolylineOutlineMaterialProperty({
    color: colorFromCss(style.trailColor),
    outlineColor: colorFromCss(style.trailBorderColor),
    outlineWidth: style.trailBorderWidthPixels,
  });
}

function colorFromCss(value: string): Color {
  return Color.fromCssColorString(value) ?? Color.WHITE;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Render canceled.', 'AbortError');
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The provider did not return an error description.';
}

function waitForTerrain(terrain: Terrain): Promise<void> {
  if (terrain.ready) return Promise.resolve();
  return new Promise((resolve) => {
    terrain.readyEvent.addEventListener(() => resolve());
  });
}

function waitForImagery(layer: ImageryLayer): Promise<void> {
  return new Promise((resolve) => {
    layer.readyEvent.addEventListener(() => resolve());
  });
}

async function waitForPromise(
  promise: Promise<void>,
  options: TileWaitOptions,
  startedAt: number,
): Promise<void> {
  while (true) {
    throwIfAborted(options.signal);
    if (performance.now() - startedAt > options.timeoutMs) {
      throw new Error(
        `Cesium ion initialization exceeded ${Math.round(options.timeoutMs / 1000)} seconds.`,
      );
    }
    const ready = await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
    ]);
    if (ready) return;
  }
}
