import { formatAltitude, formatDistance, formatFlightTime, formatSpeed } from '@/domain/format';
import type { FlightFix, OutputDimensions, ProjectSettings } from '@/domain/types';

export function paintStatsOverlay(
  context: CanvasRenderingContext2D,
  dimensions: OutputDimensions,
  fix: FlightFix,
  segmentDistanceMeters: number,
  variometerMps: number,
  settings: ProjectSettings,
): void {
  if (!settings.overlay.enabled) return;
  const entries = createOverlayEntries(fix, segmentDistanceMeters, variometerMps, settings);
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

  const centeredTextOffsetY = 2 * scale;
  entries.forEach((entry, index) => {
    const centerX = left + 17 * scale + rowWidth * (index + 0.5);
    context.textAlign = 'center';
    context.fillStyle = '#f7faf8';
    context.font = `650 ${15 * scale}px Inter, system-ui, sans-serif`;
    context.fillText(entry.value, centerX, top + 25 * scale + centeredTextOffsetY);
    context.fillStyle = '#c8d1cc';
    context.font = `400 ${9 * scale}px Inter, system-ui, sans-serif`;
    context.fillText(entry.label.toUpperCase(), centerX, top + 42 * scale + centeredTextOffsetY);
  });
  context.textAlign = 'start';
}

export function paintVariometerGauge(
  context: CanvasRenderingContext2D,
  dimensions: OutputDimensions,
  valueMps: number,
  scaleMps: number,
  settings: ProjectSettings,
): void {
  if (!settings.overlay.enabled || !settings.overlay.variometerGauge) return;
  const unit = Math.min(dimensions.width, dimensions.height) / 600;
  const rail = {
    x: dimensions.width - 20 * unit,
    y: dimensions.height * 0.2 + 13 * unit,
    width: 8 * unit,
    height: dimensions.height * 0.6 - 26 * unit,
  };
  const clampedValue = Math.max(-scaleMps, Math.min(scaleMps, valueMps));
  const valueY = rail.y + ((scaleMps - clampedValue) / (scaleMps * 2)) * rail.height;
  const zeroY = rail.y + rail.height / 2;

  context.save();
  drawGaugeRail(context, rail, valueY, zeroY, unit);
  drawGaugeValue(context, rail.x, zeroY, valueMps, unit);
  drawGaugeLimits(context, rail, scaleMps, unit);
  context.restore();
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
  variometerMps: number,
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
  if (settings.overlay.variometer) {
    entries.push({
      label: 'Vario',
      value: `${variometerMps >= 0 ? '+' : ''}${variometerMps.toFixed(2)} m/s`,
    });
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

interface GaugeRail {
  x: number;
  y: number;
  width: number;
  height: number;
}

function drawGaugeRail(
  context: CanvasRenderingContext2D,
  rail: GaugeRail,
  valueY: number,
  zeroY: number,
  unit: number,
): void {
  const baseGradient = createGaugeGradient(context, rail, '#70aa83', '#dededb', '#b9757b');
  const levelGradient = createGaugeGradient(context, rail, '#00ff62', '#fffef7', '#ff0026');
  context.save();
  context.beginPath();
  context.roundRect(rail.x, rail.y, rail.width, rail.height, 5 * unit);
  context.clip();
  context.fillStyle = baseGradient;
  context.fillRect(rail.x, rail.y, rail.width, rail.height);
  context.fillStyle = levelGradient;
  context.fillRect(rail.x, Math.min(valueY, zeroY), rail.width, Math.abs(valueY - zeroY));
  context.restore();
  context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  context.lineWidth = Math.max(1, unit);
  strokeRoundedRect(context, rail.x, rail.y, rail.width, rail.height, 5 * unit);
  context.beginPath();
  context.moveTo(rail.x - 7 * unit, zeroY);
  context.lineTo(rail.x, zeroY);
  context.strokeStyle = 'rgba(255, 255, 255, 0.82)';
  context.stroke();
}

function createGaugeGradient(
  context: CanvasRenderingContext2D,
  rail: GaugeRail,
  topColor: string,
  middleColor: string,
  bottomColor: string,
): CanvasGradient {
  const gradient = context.createLinearGradient(0, rail.y, 0, rail.y + rail.height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(0.5, middleColor);
  gradient.addColorStop(1, bottomColor);
  return gradient;
}

function drawGaugeValue(
  context: CanvasRenderingContext2D,
  railX: number,
  zeroY: number,
  valueMps: number,
  unit: number,
): void {
  const value = `${valueMps >= 0 ? '+' : ''}${valueMps.toFixed(1)}`;
  context.font = `650 ${13 * unit}px Inter, system-ui, sans-serif`;
  const valueWidth = context.measureText(value).width;
  context.font = `650 ${7 * unit}px Inter, system-ui, sans-serif`;
  const unitWidth = context.measureText('m/s').width;
  const width = valueWidth + unitWidth + 16 * unit;
  const height = 25 * unit;
  const x = railX - width - 13 * unit;
  drawRoundedRect(
    context,
    x,
    zeroY - height / 2,
    width,
    height,
    5 * unit,
    'rgba(15, 20, 17, 0.76)',
  );
  context.beginPath();
  context.moveTo(x + width, zeroY - 4 * unit);
  context.lineTo(x + width + 5 * unit, zeroY);
  context.lineTo(x + width, zeroY + 4 * unit);
  context.fillStyle = 'rgba(15, 20, 17, 0.76)';
  context.fill();
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = '#fff';
  context.font = `650 ${13 * unit}px Inter, system-ui, sans-serif`;
  context.fillText(value, x + 6 * unit, zeroY);
  context.font = `650 ${7 * unit}px Inter, system-ui, sans-serif`;
  context.fillText('m/s', x + 10 * unit + valueWidth, zeroY);
}

function drawGaugeLimits(
  context: CanvasRenderingContext2D,
  rail: GaugeRail,
  scaleMps: number,
  unit: number,
): void {
  const scale = scaleMps.toFixed(1);
  context.fillStyle = '#fff';
  context.font = `650 ${7 * unit}px Inter, system-ui, sans-serif`;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.fillText(`+${scale}`, rail.x + rail.width, rail.y - 7 * unit);
  context.fillText(`-${scale}`, rail.x + rail.width, rail.y + rail.height + 7 * unit);
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
