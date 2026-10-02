import type { DiscoverySort } from '../types'

type DiscoverySortSelectProps = {
  value: DiscoverySort
  onChange: (sort: DiscoverySort) => void
  options?: ReadonlyArray<{ label: string; value: DiscoverySort }>
  disabled?: boolean
}

const SORT_OPTIONS: Array<{ label: string; value: DiscoverySort }> = [
  { label: 'Descending', value: 'descending' },
  { label: 'Ascending', value: 'ascending' },
  { label: 'Most viewed', value: 'most-viewed' },
  { label: 'Most liked', value: 'most-liked' },
  { label: 'Featured', value: 'featured' },
  { label: 'Recommended', value: 'recommended' },
]

export function DiscoverySortSelect({ value, onChange, options = SORT_OPTIONS, disabled = false }: DiscoverySortSelectProps) {
  return (
    <label className="discovery-sort">
      <span className="discovery-sort__label">Sort by</span>
      <select
        aria-label="Sort scenes"
        className="mage-select discovery-sort__select"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as DiscoverySort)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}
