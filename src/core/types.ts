// Data model shared by the GM window, the player window and storage.

export type Id = string; // nanoid
export type Vec2 = { x: number; y: number };

// 'backdrop': a picture shown over the whole scene on both screens, never placed on the canvas.
export type AssetType = 'map' | 'prop' | 'mount' | 'character' | 'attachment' | 'note' | 'backdrop';
export type PlaceableType = Exclude<AssetType, 'backdrop'>;
export type GridSource = 'uvtt' | 'filename' | 'metadata' | 'heuristic' | 'manual' | 'fallback';

export interface ImageGrid {
  dpi: number; // image pixels per grid cell
  offset: Vec2; // anchor point in image pixels
  source: GridSource; // how dpi was obtained, shown in the importer
}

export interface AssetDefaults {
  visible: boolean;
  locked: boolean;
  rotation: number;
  label?: string;
}

export interface Asset {
  id: Id;
  type: AssetType;
  name: string;
  collectionId: Id; // a "Default" collection exists from the start
  folder?: string;
  blobId: Id; // original file in the 'blobs' store
  thumbId: Id; // ~256 px WebP preview
  hash: string; // SHA-256 of the file, used for dedupe
  mime: string;
  size: number; // bytes of the original file
  width: number; // px
  height: number; // px
  grid: ImageGrid;
  defaults: AssetDefaults;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: Id;
  name: string;
  order: number;
  createdAt: number;
}

export type GridType = 'square' | 'hex-vertical' | 'hex-horizontal' | 'isometric';
export type MeasurementMethod = 'chessboard' | 'alternating' | 'euclidean' | 'manhattan' | 'hex';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface GridScale {
  value: number;
  unit: string;
  decimals: number;
}

export interface GridSettings {
  type: GridType;
  scale: GridScale; // "5ft" -> { 5, 'ft', 0 }
  measurement: MeasurementMethod;
  color: string;
  opacity: number; // 0..1
  lineWidth: number; // screen px, does not scale with zoom
  lineStyle: LineStyle;
  snapping: boolean;
  showToPlayers: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
} // world point at the screen center

export interface Size {
  width: number;
  height: number;
}

export interface FogSettings {
  fill: boolean;
  color: string;
  gmOpacity: number;
  multilayer: boolean;
  cutByDefault: boolean;
}

export interface Scene {
  id: Id;
  name: string;
  collectionId: Id;
  order: number;
  grid: GridSettings;
  fog: FogSettings;
  items: Record<Id, Item>;
  gmViewport: Viewport;
  playerViewport: Viewport;
  // Player screen size (CSS px) that playerViewport.zoom was computed for; lets other
  // screen sizes show the same area. Absent until the first Sync View.
  playerViewRef?: Size;
  thumbId?: Id;
  updatedAt: number;
}

export type Layer =
  'map' | 'drawing' | 'prop' | 'mount' | 'character' | 'attachment' | 'note' | 'text' | 'ruler' | 'fog';

export interface BaseItem {
  id: Id;
  layer: Layer;
  z: number; // order within the layer
  position: Vec2; // world units
  rotation: number; // degrees
  scale: Vec2; // non-uniform scale fixes hex drift (P1)
  visible: boolean; // false: translucent for GM, never sent to players
  locked: boolean; // locked: no drag, selectable by double click
  name?: string;
  attachedTo?: Id; // child follows its parent (P1)
}

export type FontKey = 'sans' | 'serif' | 'fantasy';

export interface TextStyle {
  fontFamily: FontKey;
  fontSize: number;
  color: string;
  background?: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

export interface ImageItem extends BaseItem {
  kind: 'image';
  assetId: Id;
  grid: ImageGrid;
  label?: string;
}
export interface DiscToken extends BaseItem {
  kind: 'disc';
  color: string;
  text: string;
  sizeCells: number;
  label?: string;
} // plain numbered circle
export interface DrawingItem extends BaseItem {
  kind: 'drawing';
  shape: 'path' | 'line' | 'rect' | 'ellipse' | 'polygon';
  points: number[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  opacity: number;
}
export interface TextItem extends BaseItem {
  kind: 'text';
  text: string;
  style: TextStyle;
}
export interface FogShape extends BaseItem {
  kind: 'fog';
  shape: 'rect' | 'ellipse' | 'polygon' | 'path';
  points: number[];
  cut: boolean;
}
export interface RulerItem extends BaseItem {
  kind: 'ruler';
  points: Vec2[];
} // permanent ruler (P1)

export type Item = ImageItem | DiscToken | DrawingItem | TextItem | FogShape | RulerItem;

export interface AppSettings {
  playerDefaults: { grid: boolean; ruler: boolean; pointer: boolean };
  fogGmOpacity: number;
  syncViewDuration: number; // ms
}

/** A ruler or movement line as shown on both screens. */
export interface MeasureView {
  points: Vec2[];
  label: string;
}

export interface DrawStyle {
  stroke: string;
  strokeWidth: number; // world units
  fill: boolean;
  fillColor: string;
  opacity: number;
}
