import {
  ArrowBigDown, ArrowBigUp, ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Asterisk, Check,
  ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  CircleAlert, GripVertical, Heart, Images, Layers, ListMusic,
  LogOut, Maximize, Pause, Pencil, Play, Plus, Repeat, RotateCcw,
  Search, Settings, Shuffle, User, Volume2, VolumeX, X,
  type LucideProps,
} from 'lucide-react'
import './appIcon.css'

// Import only the icons the app uses; never load Lucide's full dynamic catalog.
const icons = {
  'arrow-big-down': ArrowBigDown,
  'arrow-big-up': ArrowBigUp,
  'arrow-down': ArrowDown,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-up-down': ArrowUpDown,
  asterisk: Asterisk,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevrons-left': ChevronsLeft,
  'chevrons-right': ChevronsRight,
  'circle-alert': CircleAlert,
  'grip-vertical': GripVertical,
  heart: Heart,
  images: Images,
  layers: Layers,
  'list-music': ListMusic,
  'log-out': LogOut,
  maximize: Maximize,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  repeat: Repeat,
  'rotate-ccw': RotateCcw,
  search: Search,
  settings: Settings,
  shuffle: Shuffle,
  user: User,
  'volume-2': Volume2,
  'volume-x': VolumeX,
  x: X,
} as const

export type AppIconName = keyof typeof icons
type AppIconProps = Omit<LucideProps, 'name'> & { name: AppIconName }

/** Decorative icons inherit the control's color and accessible label. */
export function AppIcon({
  name,
  className,
  size = 20,
  strokeWidth = 2,
  fill = name === 'play' || name === 'pause' ? 'currentColor' : 'none',
  ...props
}: AppIconProps) {
  const Icon = icons[name]
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      fill={fill}
      className={['app-icon', className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
