import { AppWindow, Cast, CastIcon, Database, Keyboard, Menu, Settings, Tv } from 'lucide-react';
import { useRef, useState } from 'react';
import { t } from '../../i18n/ru';
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
        <SaveIndicator />
      </div>
    </div>
  );
}

function PlayerStatusChip() {
  const player = useUi((s) => s.player);
  const follow = useUi((s) => s.follow);
  const connected = player.links > 0;
  const text = !connected
    ? t.playerStatus.none
    : follow
      ? t.playerStatus.following
      : t.playerStatus.connected;
  return (
    <Panel className={'status-chip' + (connected ? ' on' : '')} title={text}>
      <Tv size={16} />
      <span>{text}</span>
    </Panel>
  );
}

function SaveIndicator() {
  const state = useGm((s) => s.saveState);
  const text = state === 'saved' ? t.scene.saved : state === 'saving' ? t.scene.saving : t.scene.unsaved;
  return <span className={'save-indicator ' + state}>{text}</span>;
}
