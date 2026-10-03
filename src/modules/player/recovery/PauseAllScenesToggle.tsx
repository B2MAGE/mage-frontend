export function PauseAllScenesToggle({ checked, onChange }: {
  checked: boolean
  onChange: (enabled: boolean) => void
}) {
  return <label className="mage-player__pause-all">
    <span>Pause all scenes</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
  </label>
}
