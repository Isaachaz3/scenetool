import type {
  AppSettings,
  AssetType,
  DrawStyle,
  FogSettings,
  GridSettings,
  Layer,
  PlaceableType,
  TextStyle,
} from './types';

/** One grid cell is always 150 world units. */
export const CELL = 150;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

export const HISTORY_LIMIT = 100;
export const AUTOSAVE_DELAY = 500;

/** Bottom-to-top render order. 'grid' and 'pointer' are not item layers but sit in this order. */
export const LAYER_ORDER = [
  'map',
  'grid',
  'drawing',
  'prop',
  'mount',
  'character',
  'attachment',
  'note',
  'text',
  'ruler',
  'fog',
  'pointer',
] as const;

export const ITEM_LAYERS: Layer[] = LAYER_ORDER.filter((l): l is Layer => l !== 'grid' && l !== 'pointer');

export function layerRank(layer: Layer): number {
  return LAYER_ORDER.indexOf(layer);
}

export const ASSET_TYPES: AssetType[] = [
  'map',
  'prop',
  'mount',
  'character',
  'attachment',
  'note',
  'backdrop',
];

export function layerForAssetType(type: PlaceableType): Layer {
  return type;
}

export const DEFAULT_GRID: GridSettings = {
  type: 'square',
  scale: { value: 5, unit: 'ft', decimals: 0 },
  measurement: 'chessboard',
  color: '#000000',
  opacity: 0.5,
  lineWidth: 2,
  lineStyle: 'dashed',
  snapping: true,
  showToPlayers: true,
};

export const DEFAULT_FOG: FogSettings = {
  fill: false,
  color: '#222222',
  gmOpacity: 0.4,
  multilayer: true,
  cutByDefault: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  playerDefaults: { grid: true, ruler: true, pointer: true },
  fogGmOpacity: 0.4,
  syncViewDuration: 400,
  ambient: { channels: [], volume: 0.85, muted: false },
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'sans',
  fontSize: 48,
  color: '#ffffff',
  bold: false,
  align: 'left',
};

export const DEFAULT_DRAW_STYLE: DrawStyle = {
  stroke: '#ef4444',
  strokeWidth: 8,
  fill: false,
  fillColor: '#ef4444',
  opacity: 1,
};

export const DRAW_COLORS = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#a78bfa',
  '#ffffff',
  '#111111',
];

export const ACCENT = '#a78bfa';

export const FONT_FAMILIES: Record<TextStyle['fontFamily'], string> = {
  sans: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  fantasy: '"Ruslan Display", Georgia, serif',
};

export const TEXT_BACKGROUND = 'rgba(20, 20, 28, 0.8)';

export const GRID_COLORS = ['#000000', '#ffffff', '#f97316'];

export const DISC_COLORS = [
  '#facc15',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#f97316',
  '#ffffff',
  '#111827',
];

/** Contrasting solid line used for the grid while a map is being aligned. */
export const ALIGN_GRID_COLOR = '#ff2bd6';

/** Images wider than this are guessed to be maps when dropped on the canvas. */
export const MAP_GUESS_WIDTH = 1500;

export const THUMB_SIZE = 256;
export const MAX_TEXTURE_SIDE = 16384;

/** Hidden items are drawn this translucent for the GM. */
export const HIDDEN_OPACITY = 0.45;
