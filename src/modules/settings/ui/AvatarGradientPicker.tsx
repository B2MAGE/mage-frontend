import { AVATAR_GRADIENT_PRESETS, DEFAULT_AVATAR_GRADIENT, normalizeAvatarColor } from '@shared/lib/avatarGradient'
import { PublicProfileMarker, UserAvatar } from '@shared/ui'
import './avatarGradientPicker.css'

type AvatarGradientPickerProps = {
  start: string
  end: string
  disabled: boolean
  error?: string
  onChange: (start: string, end: string) => void
}

export function AvatarGradientPicker({ start, end, disabled, error, onChange }: AvatarGradientPickerProps) {
  return (
    <fieldset className="avatar-gradient-picker settings-field--full" disabled={disabled} aria-describedby="avatar-gradient-hint settings-public-profile-hint">
      <legend>Avatar gradient<PublicProfileMarker /></legend>
      <p className="field-hint" id="avatar-gradient-hint">Choose a preset or make it your own with two colors.</p>
      <div className="avatar-gradient-presets" role="group" aria-label="Gradient presets">
        {AVATAR_GRADIENT_PRESETS.map((preset) => (
          <button
            className="avatar-gradient-preset"
            type="button"
            key={preset.name}
            aria-pressed={start.toLowerCase() === preset.start && end.toLowerCase() === preset.end}
            onClick={() => onChange(preset.start, preset.end)}
          >
            <UserAvatar className="avatar-gradient-swatch" initials="" gradientStart={preset.start} gradientEnd={preset.end} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
      <div className="avatar-gradient-colors">
        {([
          { name: 'Start', value: start, fallback: DEFAULT_AVATAR_GRADIENT.start, update: (color: string) => onChange(color, end) },
          { name: 'End', value: end, fallback: DEFAULT_AVATAR_GRADIENT.end, update: (color: string) => onChange(start, color) },
        ] as const).map(({ name, value, fallback, update }) => (
          <div className="field-group" key={name}>
            <label htmlFor={`avatar-${name.toLowerCase()}-hex`}>{name} color</label>
            <div className="avatar-gradient-color-control">
              <input
                aria-label={`Choose ${name.toLowerCase()} color`}
                type="color"
                value={normalizeAvatarColor(value, fallback)}
                onChange={(event) => update(event.target.value)}
              />
              <input
                id={`avatar-${name.toLowerCase()}-hex`}
                type="text"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'avatar-gradient-error' : undefined}
                autoComplete="off"
                spellCheck={false}
                maxLength={7}
                value={value}
                onChange={(event) => update(event.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
      {error ? <p className="field-error" id="avatar-gradient-error" role="alert">{error}</p> : null}
    </fieldset>
  )
}
