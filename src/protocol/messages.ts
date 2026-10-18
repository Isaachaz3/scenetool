import type { MeasureView } from '../core/types';
import type { PlayerScene, SceneDiff } from './projection';

export const PROTOCOL_VERSION = 1;

type V = { v: number };

export type PlayerMessage =
  | ({ type: 'hello'; cached: string[] } & V)
  | ({ type: 'screen'; width: number; height: number; dpr: number } & V)
  | ({ type: 'need-assets'; hashes: string[] } & V);

export interface ViewMessage {
  x: number;
  y: number;
  zoom: number;
  duration: number; // ms, 0 = jump
}

export type GmMessage =
  | ({ type: 'scene:snapshot'; scene: PlayerScene | null; view: ViewMessage } & V)
  | ({ type: 'scene:diff'; sceneId: string; diff: SceneDiff } & V)
  | ({ type: 'asset:begin'; hash: string; size: number; mime: string; total: number } & V)
  | ({ type: 'asset:end'; hash: string } & V)
  | ({ type: 'view:set' } & ViewMessage & V)
  | ({ type: 'measure'; measure: MeasureView | null } & V)
  | ({ type: 'pointer'; x: number; y: number; active: boolean } & V) // active: false = released
  | ({ type: 'settings'; ruler: boolean; pointer: boolean } & V);

export type GmMessageType = GmMessage['type'];
export type PlayerMessageType = PlayerMessage['type'];

/** Header of a binary image chunk. */
export interface ChunkHeader {
  hash: string;
  index: number;
  total: number;
}

const GM_TYPES: ReadonlySet<string> = new Set<GmMessageType>([
  'scene:snapshot',
  'scene:diff',
  'asset:begin',
  'asset:end',
  'view:set',
  'measure',
  'pointer',
  'settings',
]);
const PLAYER_TYPES: ReadonlySet<string> = new Set<PlayerMessageType>(['hello', 'screen', 'need-assets']);

/** Distributes Omit over the union so each message keeps its own fields. */
type WithoutVersion<T> = T extends unknown ? Omit<T, 'v'> : never;

export function gmMessage(msg: WithoutVersion<GmMessage>): GmMessage {
  return { ...msg, v: PROTOCOL_VERSION } as GmMessage;
}

export function playerMessage(msg: WithoutVersion<PlayerMessage>): PlayerMessage {
  return { ...msg, v: PROTOCOL_VERSION } as PlayerMessage;
}

function parse(text: unknown, types: ReadonlySet<string>): unknown {
  if (typeof text !== 'string') return null;
  try {
    const msg: unknown = JSON.parse(text);
    if (
      typeof msg === 'object' &&
      msg !== null &&
      typeof (msg as { type?: unknown }).type === 'string' &&
      types.has((msg as { type: string }).type) &&
      (msg as { v?: unknown }).v === PROTOCOL_VERSION
    ) {
      return msg;
    }
  } catch {
    // not ours
  }
  return null;
}

export function parseGmMessage(text: unknown): GmMessage | null {
  return parse(text, GM_TYPES) as GmMessage | null;
}

export function parsePlayerMessage(text: unknown): PlayerMessage | null {
  return parse(text, PLAYER_TYPES) as PlayerMessage | null;
}
