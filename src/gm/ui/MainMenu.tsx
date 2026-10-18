import {
  AppWindow,
  Cast,
  CastIcon,
  Cloud,
  CloudAlert,
  CloudOff,
  Database,
  Keyboard,
  Menu,
  RefreshCw,
  Settings,
  Tv,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useCloud } from '../../cloud/sync';
import { formatBytes, t } from '../../i18n/ru';
import { useGm } from '../../state/store';
import { openDialog, useUi } from '../../state/ui';
import { openPlayerWindow, presentation } from '../playerHub';
import { Panel, useClickOutside } from './common';

export function MainMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const player = useUi((s) => s.player);
  useClickOutside(ref, () => setOpen(false), open);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="main-menu" ref={ref}>
      {open ? (
        <Panel className="menu">
          {player.presenting ? (
            <button type="button" onClick={run(() => presentation.stop())}>
              <CastIcon size={18} /> {t.menu.stopPresent}
            </button>
          ) : player.presentationAvailable ? (
            <button type="button" onClick={run(() => void presentation.start())}>
              <Cast size={18} /> {t.menu.present}
            </button>
          ) : null}
          <button type="button" onClick={run(openPlayerWindow)}>
            <AppWindow size={18} /> {t.menu.playerWindow}
          </button>
          <div className="sep" />
          <button type="button" onClick={run(() => openDialog({ kind: 'cloud' }))}>
            <Cloud size={18} /> {t.menu.cloud}
          </button>
          <button type="button" onClick={run(() => openDialog({ kind: 'storage' }))}>
            <Database size={18} /> {t.menu.storage}
          </button>
          <button type="button" onClick={run(() => openDialog({ kind: 'settings' }))}>
            <Settings size={18} /> {t.menu.settings}
          </button>
          <button type="button" onClick={run(() => openDialog({ kind: 'hotkeys' }))}>
            <Keyboard size={18} /> {t.menu.hotkeys}
          </button>
        </Panel>
      ) : null}
      <div className="menu-row">
        <Panel className="menu-button-wrap">
          <button
            type="button"
            className={'icon-btn' + (open ? ' active' : '')}
            aria-label={t.menu.open}
            data-tip={t.menu.open}
            data-tip-side="top"
            onClick={() => setOpen(!open)}
          >
            <Menu size={20} />
          </button>
        </Panel>
        <PlayerStatusChip />
        <CloudChip />
        <SaveIndicator />
      </div>
    </div>
  );
}

function PlayerStatusChip() {
  const player = useUi((s) => s.player);
  const follow = useUi((s) => s.follow);
  const connected = player.links > 0;
  const state = !connected ? 'none' : follow ? 'following' : 'connected';
  return (
    <Panel className={'status-chip' + (connected ? ' on' : '')} title={t.playerStatus[state]}>
      <Tv size={16} />
      <span>{t.playerStatus.short[state]}</span>
    </Panel>
  );
}

function SaveIndicator() {
  const state = useGm((s) => s.saveState);
  const text = state === 'saved' ? t.scene.saved : state === 'saving' ? t.scene.saving : t.scene.unsaved;
  return <span className={'save-indicator ' + state}>{text}</span>;
}

function CloudChip() {
  const status = useCloud((s) => s.status);
  const error = useCloud((s) => s.error);
  const usage = useCloud((s) => s.usage);
  const icon =
    status === 'syncing' ? (
      <RefreshCw size={16} className="spin" />
    ) : status === 'error' ? (
      <CloudAlert size={16} />
    ) : status === 'idle' ? (
      <Cloud size={16} />
    ) : (
      <CloudOff size={16} />
    );
  return (
    <button
      type="button"
      className={'panel status-chip cloud-chip ' + status}
      title={
        (status === 'error' && error ? error : t.cloud.status[status]) +
        (usage ? '\n' + t.cloud.usageShort(formatBytes(usage.files), formatBytes(usage.database)) : '')
      }
      onClick={() => openDialog({ kind: 'cloud' })}
    >
      {icon}
      <span>{t.cloud.chip[status]}</span>
    </button>
  );
}
