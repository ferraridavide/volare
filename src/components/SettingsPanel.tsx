import { getOutputDimensions, OUTPUT_DIMENSIONS } from '@/domain/settings';
import type {
  CameraSettings,
  FrameRate,
  OutputPreset,
  ProjectSettings,
  UnitSystem,
  VideoAspectRatio,
} from '@/domain/types';

interface SettingsPanelProps {
  settings: ProjectSettings;
  camera?: CameraSettings;
  cameraKeyframeSelected?: boolean;
  disabled: boolean;
  onChange: (settings: ProjectSettings) => void;
  onCameraChange?: (camera: CameraSettings) => void;
  onWatermarkChange?: (enabled: boolean) => void;
}

export function SettingsPanel({
  settings,
  camera = settings.camera,
  cameraKeyframeSelected = false,
  disabled,
  onChange,
  onCameraChange,
  onWatermarkChange,
}: SettingsPanelProps) {
  const updateCamera = (key: keyof ProjectSettings['camera'], value: number | boolean) => {
    const nextCamera = { ...camera, [key]: value };
    if (onCameraChange) onCameraChange(nextCamera);
    else onChange({ ...settings, camera: nextCamera });
  };
  const updateOverlay = (
    key: keyof ProjectSettings['overlay'],
    value: string | number | boolean,
  ) => {
    onChange({ ...settings, overlay: { ...settings.overlay, [key]: value } });
  };
  const updateStyle = (
    key: keyof ProjectSettings['routeStyle'],
    value: string | number | boolean,
  ) => {
    onChange({ ...settings, routeStyle: { ...settings.routeStyle, [key]: value } });
  };

  return (
    <aside className="settings-panel" aria-label="Render settings">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Flight direction</span>
          <h2>Render setup</h2>
        </div>
        <span className="status-dot" />
      </div>

      <SettingsSection title="Output" open>
        <div className="field-grid field-grid--two">
          <SelectField
            label="Resolution"
            value={settings.outputPreset}
            disabled={disabled}
            onChange={(value) => onChange({ ...settings, outputPreset: value as OutputPreset })}
            options={Object.keys(OUTPUT_DIMENSIONS).map((value) => {
              const size = getOutputDimensions(value as OutputPreset, settings.aspectRatio);
              return { value, label: `${value.toUpperCase()} · ${size.width}×${size.height}` };
            })}
          />
          <SelectField
            label="Aspect ratio"
            value={settings.aspectRatio}
            disabled={disabled}
            onChange={(value) => onChange({ ...settings, aspectRatio: value as VideoAspectRatio })}
            options={[
              { value: 'landscape', label: 'Landscape · 16:9' },
              { value: 'vertical', label: 'Vertical · 9:16' },
            ]}
          />
          <SelectField
            label="Frame rate"
            value={String(settings.frameRate)}
            disabled={disabled}
            onChange={(value) => onChange({ ...settings, frameRate: Number(value) as FrameRate })}
            options={[24, 30, 60].map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
          />
        </div>
        <NumberField
          label="Target duration"
          value={settings.targetDurationSeconds}
          suffix="seconds"
          min={1}
          max={3600}
          step={1}
          disabled={disabled}
          onChange={(value) => onChange({ ...settings, targetDurationSeconds: value })}
        />
        <NumberField
          label="Video bitrate"
          value={settings.bitrateMbps}
          suffix="Mbps"
          min={1}
          max={200}
          step={1}
          disabled={disabled}
          onChange={(value) => onChange({ ...settings, bitrateMbps: value })}
        />
        <SelectField
          label="Display units"
          value={settings.unitSystem}
          disabled={disabled}
          onChange={(value) => onChange({ ...settings, unitSystem: value as UnitSystem })}
          options={[
            { value: 'metric', label: 'Metric · m, km/h' },
            { value: 'imperial', label: 'Imperial · ft, mph' },
          ]}
        />
        <NumberField
          label="Altitude correction"
          value={settings.altitudeOffsetMeters}
          suffix="m"
          min={-1000}
          max={3000}
          step={5}
          disabled={disabled}
          onChange={(value) => onChange({ ...settings, altitudeOffsetMeters: value })}
        />
      </SettingsSection>

      <SettingsSection title="Chase camera" open>
        {cameraKeyframeSelected && (
          <p className="keyframe-editing-note">Editing selected camera keyframe</p>
        )}
        <RangeField
          label="Follow distance"
          value={camera.distanceMeters}
          min={200}
          max={10000}
          step={50}
          suffix="m"
          disabled={disabled}
          onChange={(value) => updateCamera('distanceMeters', value)}
        />
        <RangeField
          label="Camera elevation"
          value={camera.elevationAngleDegrees}
          min={-75}
          max={75}
          step={1}
          suffix="°"
          disabled={disabled}
          onChange={(value) => updateCamera('elevationAngleDegrees', value)}
        />
          <RangeField
            label="Follow smoothing"
            value={camera.followSmoothingSeconds}
            min={0}
            max={5}
            step={0.05}
            suffix=" video s"
            disabled={disabled}
            onChange={(value) => updateCamera('followSmoothingSeconds', value)}
          />
          <RangeField
            label="Heading smoothing"
            value={camera.headingSmoothingSeconds}
            min={0.05}
            max={20}
            step={0.05}
            suffix=" video s"
            disabled={disabled || camera.fixedHeadingEnabled}
            onChange={(value) => updateCamera('headingSmoothingSeconds', value)}
          />
          <RangeField
            label="Heading offset"
            value={camera.headingOffsetDegrees}
            min={-180}
            max={180}
            step={1}
            suffix="°"
            disabled={disabled || camera.fixedHeadingEnabled}
            onChange={(value) => updateCamera('headingOffsetDegrees', value)}
          />
          <ToggleField
            label="Use fixed heading"
            checked={camera.fixedHeadingEnabled}
            disabled={disabled}
            onChange={(value) => updateCamera('fixedHeadingEnabled', value)}
          />
          <RangeField
            label="Fixed heading"
            value={camera.fixedHeadingDegrees}
            min={0}
            max={360}
            step={1}
            suffix="°"
            disabled={disabled || !camera.fixedHeadingEnabled}
            onChange={(value) => updateCamera('fixedHeadingDegrees', value)}
          />
          <RangeField
            label="Field of view"
            value={camera.fieldOfViewDegrees}
            min={15}
            max={100}
            step={1}
            suffix="°"
            disabled={disabled}
            onChange={(value) => updateCamera('fieldOfViewDegrees', value)}
          />
        <RangeField
          label="Look ahead"
          value={camera.lookAheadSeconds}
          min={0}
          max={3}
          step={0.05}
          suffix=" video s"
          disabled={disabled}
          onChange={(value) => updateCamera('lookAheadSeconds', value)}
        />
        <RangeField
          label="Follow lag"
          value={camera.lagSeconds}
          min={0}
          max={3}
          step={0.05}
          suffix=" video s"
          disabled={disabled}
          onChange={(value) => updateCamera('lagSeconds', value)}
        />
        <RangeField
          label="Terrain clearance"
          value={camera.minimumTerrainClearanceMeters}
          min={0}
          max={500}
          step={5}
          suffix="m"
          disabled={disabled}
          onChange={(value) => updateCamera('minimumTerrainClearanceMeters', value)}
        />
      </SettingsSection>

      <SettingsSection title="Overlay">
        <ToggleField
          label="Show stats overlay"
          checked={settings.overlay.enabled}
          disabled={disabled}
          onChange={(value) => updateOverlay('enabled', value)}
        />
        <div className="toggle-row-group">
          <ToggleField
            label="Altitude"
            checked={settings.overlay.altitude}
            disabled={disabled || !settings.overlay.enabled}
            onChange={(value) => updateOverlay('altitude', value)}
          />
          <ToggleField
            label="Speed"
            checked={settings.overlay.speed}
            disabled={disabled || !settings.overlay.enabled}
            onChange={(value) => updateOverlay('speed', value)}
          />
          <ToggleField
            label="Variometer"
            checked={settings.overlay.variometer}
            disabled={disabled || !settings.overlay.enabled}
            onChange={(value) => updateOverlay('variometer', value)}
          />
          <ToggleField
            label="Distance"
            checked={settings.overlay.distance}
            disabled={disabled || !settings.overlay.enabled}
            onChange={(value) => updateOverlay('distance', value)}
          />
          <ToggleField
            label="Time"
            checked={settings.overlay.time}
            disabled={disabled || !settings.overlay.enabled}
            onChange={(value) => updateOverlay('time', value)}
          />
        </div>
        <RangeField
          label="Variometer update rate"
          value={settings.overlay.variometerUpdateRateSeconds}
          min={0.1}
          max={5}
          step={0.1}
          suffix=" playback s"
          disabled={disabled || !settings.overlay.enabled || !settings.overlay.variometer}
          onChange={(value) => updateOverlay('variometerUpdateRateSeconds', value)}
        />
        <ToggleField
          label="Show Volare watermark"
          checked={settings.overlay.watermark}
          disabled={disabled}
          onChange={(value) =>
            onWatermarkChange ? onWatermarkChange(value) : updateOverlay('watermark', value)
          }
        />
        <div className="color-grid">
          <ColorField
            label="Background"
            value={settings.overlay.backgroundColor}
            disabled={disabled || !settings.overlay.enabled}
            onChange={(value) => updateOverlay('backgroundColor', value)}
          />
        </div>
        <RangeField
          label="Background opacity"
          value={settings.overlay.backgroundOpacity}
          min={0}
          max={1}
          step={0.05}
          suffix=""
          disabled={disabled || !settings.overlay.enabled}
          onChange={(value) => updateOverlay('backgroundOpacity', value)}
        />
      </SettingsSection>

      <SettingsSection title="Track style">
        <ToggleField
          label="Show ghost route"
          checked={settings.routeStyle.showGhostRoute}
          disabled={disabled}
          onChange={(value) => updateStyle('showGhostRoute', value)}
        />
        <ToggleField
          label="Limit trail length"
          checked={settings.routeStyle.trailLengthEnabled}
          disabled={disabled}
          onChange={(value) => updateStyle('trailLengthEnabled', value)}
        />
        <RangeField
          label="Trail length"
          value={settings.routeStyle.trailLengthMeters}
          min={100}
          max={20000}
          step={100}
          suffix="m"
          disabled={disabled || !settings.routeStyle.trailLengthEnabled}
          onChange={(value) => updateStyle('trailLengthMeters', value)}
        />
        <RangeField
          label="Route smoothing"
          value={settings.routeStyle.smoothingPasses}
          min={0}
          max={8}
          step={1}
          suffix=""
          disabled={disabled}
          onChange={(value) => updateStyle('smoothingPasses', value)}
        />
        <div className="color-grid">
          <ColorField
            label="Route"
            value={settings.routeStyle.routeColor}
            disabled={disabled}
            onChange={(value) => updateStyle('routeColor', value)}
          />
          <ColorField
            label="Trail"
            value={settings.routeStyle.trailColor}
            disabled={disabled}
            onChange={(value) => updateStyle('trailColor', value)}
          />
          <ColorField
            label="Trail border"
            value={settings.routeStyle.trailBorderColor}
            disabled={disabled || settings.routeStyle.trailBorderWidthPixels === 0}
            onChange={(value) => updateStyle('trailBorderColor', value)}
          />
          <ColorField
            label="Pilot"
            value={settings.routeStyle.markerColor}
            disabled={disabled}
            onChange={(value) => updateStyle('markerColor', value)}
          />
        </div>
        <RangeField
          label="Line width"
          value={settings.routeStyle.lineWidthPixels}
          min={1}
          max={12}
          step={1}
          suffix="px"
          disabled={disabled}
          onChange={(value) => updateStyle('lineWidthPixels', value)}
        />
        <RangeField
          label="Trail border"
          value={settings.routeStyle.trailBorderWidthPixels}
          min={0}
          max={8}
          step={1}
          suffix="px"
          disabled={disabled}
          onChange={(value) => updateStyle('trailBorderWidthPixels', value)}
        />
        <RangeField
          label="Pilot marker"
          value={settings.routeStyle.markerSizePixels}
          min={6}
          max={36}
          step={1}
          suffix="px"
          disabled={disabled}
          onChange={(value) => updateStyle('markerSizePixels', value)}
        />
      </SettingsSection>
    </aside>
  );
}

function SettingsSection({
  title,
  open = false,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="settings-section" open={open}>
      <summary>{title}</summary>
      <div className="settings-section__content">{children}</div>
    </details>
  );
}

interface FieldProps {
  label: string;
  disabled: boolean;
}

function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  step,
  disabled,
  onChange,
}: FieldProps & {
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-input">
        <input
          type="number"
          aria-label={`${label} value`}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <small>{suffix}</small>
      </div>
    </label>
  );
}

function RangeField({
  label,
  value,
  suffix,
  min,
  max,
  step,
  disabled,
  onChange,
}: FieldProps & {
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <span className="range-field__value">
        <input
          type="number"
          value={value}
          step={step}
          disabled={disabled}
          aria-label={`${label} value`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <small>{suffix}</small>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: FieldProps & {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  disabled,
  onChange,
}: FieldProps & { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: FieldProps & { value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-field">
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <span>{label}</span>
    </label>
  );
}
