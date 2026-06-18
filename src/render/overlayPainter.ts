import { formatAltitude, formatDistance, formatFlightTime, formatSpeed } from '@/domain/format';
import type { FlightFix, OutputDimensions, ProjectSettings } from '@/domain/types';

export function paintStatsOverlay(
  context: CanvasRenderingContext2D,
  dimensions: OutputDimensions,
  fix: FlightFix,
  segmentDistanceMeters: number,
  settings: ProjectSettings,
): void {
  if (!settings.overlay.enabled) return;
  const entries = createOverlayEntries(fix, segmentDistanceMeters, settings);
  if (!entries.length) return;

  const portrait = dimensions.height > dimensions.width;
  const naturalScale = Math.min(dimensions.width, dimensions.height) / (portrait ? 480 : 600);
  const scale = Math.min(naturalScale, dimensions.width / (entries.length * 116 + 54));
  const rowWidth = 116 * scale;
  const panelWidth = entries.length * rowWidth + 34 * scale;
  const panelHeight = 59 * scale;
  const left = (dimensions.width - panelWidth) / 2;
  const top = dimensions.height * 0.1;

  drawPanelBackdrop(context, dimensions, left, top, panelWidth, panelHeight, 10 * scale);
  context.save();
  // Canvas global alpha also attenuates shadows, so compensate to match the CSS shadow.
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 24 * scale;
  context.shadowOffsetY = 8 * scale;
  context.globalAlpha = settings.overlay.backgroundOpacity;
  drawRoundedRect(
    context,
    left,
    top,
    panelWidth,
    panelHeight,
    10 * scale,
    settings.overlay.backgroundColor,
  );
  context.restore();

  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  context.lineWidth = Math.max(1, scale);
  strokeRoundedRect(context, left, top, panelWidth, panelHeight, 10 * scale);
  context.restore();

  entries.forEach((entry, index) => {
    const centerX = left + 17 * scale + rowWidth * (index + 0.5);
    context.textAlign = 'center';
    context.fillStyle = '#f7faf8';
    context.font = `650 ${15 * scale}px Inter, system-ui, sans-serif`;
    context.fillText(entry.value, centerX, top + 25 * scale);
    context.fillStyle = '#c8d1cc';
    context.font = `400 ${9 * scale}px Inter, system-ui, sans-serif`;
    context.fillText(entry.label.toUpperCase(), centerX, top + 42 * scale);
  });
  context.textAlign = 'start';
}

export function paintWatermark(
  context: CanvasRenderingContext2D,
  dimensions: OutputDimensions,
  settings: ProjectSettings,
): void {
  if (!settings.overlay.watermark) return;
  const scale = Math.min(dimensions.width, dimensions.height) / 600;
  context.save();
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.fillStyle = 'rgba(255, 255, 255, 0.66)';
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 3 * scale;
  context.font = `500 ${10 * scale}px Inter, system-ui, sans-serif`;
  context.fillText(
    'volare.davide.im',
    dimensions.width - 12 * scale,
    dimensions.height - 12 * scale,
  );
  context.restore();
}

function createOverlayEntries(
  fix: FlightFix,
  segmentDistanceMeters: number,
  settings: ProjectSettings,
): Array<{ label: string; value: string }> {
  const entries: Array<{ label: string; value: string }> = [];
  if (settings.overlay.altitude) {
    entries.push({
      label: 'Altitude',
      value: formatAltitude(fix.altitudeMeters, settings.unitSystem),
    });
  }
  if (settings.overlay.speed) {
    entries.push({ label: 'Speed', value: formatSpeed(fix.groundSpeedMps, settings.unitSystem) });
  }
  if (settings.overlay.distance) {
    entries.push({
      label: 'Distance',
      value: formatDistance(segmentDistanceMeters, settings.unitSystem),
    });
  }
  if (settings.overlay.time) {
    entries.push({ label: 'Time', value: formatFlightTime(fix.elapsedSeconds) });
  }
  return entries;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.stroke();
}

function drawPanelBackdrop(
  context: CanvasRenderingContext2D,
  dimensions: OutputDimensions,
  x: number,
  y: number,
  width: number,
  height: number,
  blurRadius: number,
): void {
  const padding = Math.ceil(blurRadius * 2);
  const sourceX = Math.max(0, Math.floor(x - padding));
  const sourceY = Math.max(0, Math.floor(y - padding));
  const sourceWidth = Math.min(dimensions.width - sourceX, Math.ceil(width + padding * 2));
  const sourceHeight = Math.min(dimensions.height - sourceY, Math.ceil(height + padding * 2));
  const backdrop = document.createElement('canvas');
  backdrop.width = sourceWidth;
  backdrop.height = sourceHeight;
  const backdropContext = backdrop.getContext('2d');
  if (!backdropContext) return;
  backdropContext.drawImage(
    context.canvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );

  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, blurRadius);
  context.clip();
  context.filter = `blur(${blurRadius}px)`;
  context.drawImage(backdrop, sourceX, sourceY);
  context.restore();
}
