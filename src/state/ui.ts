import { create } from 'zustand';
import type { AssetType, Id, Size } from '../core/types';

export type DockTab = 'search' | 'scenes' | AssetType;

export type Dialog =
  | { kind: 'import'; files: File[]; type?: AssetType }
  | { kind: 'sceneFromMap'; file?: File }
  | { kind: 'newScene' }
  | { kind: 'assetManager'; tab?: DockTab; assetId?: Id }
  | { kind: 'settings' }
  | { kind: 'storage' }
  | { kind: 'cloud' }
  | { kind: 'hotkeys' }
  | { kind: 'disc' };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface PlayerStatus {
  links: number;
  presentationAvailable: boolean;
  presenting: boolean;
}

export interface UiState {
  screen: Size; // GM canvas size in CSS px
  dockTab: DockTab | null;
  toolbarCollapsed: boolean;
  dialog: Dialog | null;
  confirm: { text: string; resolve: (ok: boolean) => void } | null;
  prompt: { text: string; value: string; resolve: (value: string | null) => void } | null;
  choice: {
    text: string;
    options: { value: string; label: string }[];
    resolve: (value: string | null) => void;
  } | null;
  toasts: Toast[];
  follow: boolean;
  player: PlayerStatus;
  spaceDown: boolean;
  /** "Глазами игроков": opaque fog, hidden items left out. */
  preview: boolean;
}

const PREFS_KEY = 'vtt-lite:ui';

interface Prefs {
  dockTab?: DockTab | null;
  toolbarCollapsed?: boolean;
  tool?: string;
  collectionId?: string;
}

/** UI conveniences only; storage may be unavailable, so every access is guarded. */
export function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}

export function writePrefs(patch: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // ignore
  }
}

const prefs = readPrefs();

export const useUi = create<UiState>(() => ({
  screen: { width: window.innerWidth, height: window.innerHeight },
  dockTab: prefs.dockTab ?? null,
  toolbarCollapsed: prefs.toolbarCollapsed ?? false,
  dialog: null,
  confirm: null,
  prompt: null,
  choice: null,
  toasts: [],
  follow: false,
  player: { links: 0, presentationAvailable: false, presenting: false },
  spaceDown: false,
  preview: false,
}));

export const getUi = useUi.getState;

export function openDialog(dialog: Dialog | null): void {
  useUi.setState({ dialog });
}

export function confirmDialog(text: string): Promise<boolean> {
  return new Promise((resolve) => useUi.setState({ confirm: { text, resolve } }));
}

export function promptDialog(text: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => useUi.setState({ prompt: { text, value, resolve } }));
}

/** Asks to pick one of several answers; null when dismissed. */
export function choiceDialog(
  text: string,
  options: { value: string; label: string }[],
): Promise<string | null> {
  return new Promise((resolve) => useUi.setState({ choice: { text, options, resolve } }));
}

let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  const id = ++toastId;
  useUi.setState((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
  setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4000);
}

export function setDockTab(tab: DockTab | null): void {
  useUi.setState({ dockTab: tab });
  writePrefs({ dockTab: tab });
}
