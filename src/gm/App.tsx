import { useEffect } from 'react';
import { t } from '../i18n/ru';
import { useGm } from '../state/store';
import { useUi } from '../state/ui';
import { GmCanvas } from './canvas/GmCanvas';
import { ContextMenu } from './canvas/ContextMenu';
import { SelectionPlaque } from './canvas/SelectionPlaque';
import { TextEditor } from './canvas/TextEditor';
import { AlignPanel } from './ui/AlignPanel';
import { AmbientChip } from './ui/AmbientPanel';
import { BackdropOverlay } from './ui/BackdropOverlay';
import { AssetManager } from './ui/dialogs/AssetManager';
import { CloudDialog } from './ui/dialogs/CloudDialog';
import { ImportDialog } from './ui/dialogs/ImportDialog';
import { SceneFromMapDialog } from './ui/dialogs/SceneFromMapDialog';
import {
  ConfirmPrompt,
  DiscDialog,
  HotkeysDialog,
  NewSceneDialog,
  SettingsDialog,
  Toasts,
} from './ui/dialogs/SmallDialogs';
import { StorageDialog } from './ui/dialogs/StorageDialog';
import { Dock } from './ui/Dock';
import { GridViewPanel } from './ui/GridViewPanel';
import { MainMenu } from './ui/MainMenu';
import { Toolbar } from './ui/Toolbar';
import { WelcomeScreen } from './ui/WelcomeScreen';
import { ToolOptions } from './ui/ToolOptions';

function DialogHost() {
  const dialog = useUi((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'import':
      return <ImportDialog files={dialog.files} type={dialog.type} />;
    case 'sceneFromMap':
      return <SceneFromMapDialog file={dialog.file} />;
    case 'newScene':
      return <NewSceneDialog />;
    case 'assetManager':
      return <AssetManager tab={dialog.tab} assetId={dialog.assetId} />;
    case 'settings':
      return <SettingsDialog />;
    case 'storage':
      return <StorageDialog />;
    case 'cloud':
      return <CloudDialog />;
    case 'hotkeys':
      return <HotkeysDialog />;
    case 'disc':
      return <DiscDialog />;
  }
}

function EmptyHint() {
  const empty = useGm((s) => {
    const scene = s.activeSceneId ? s.scenes[s.activeSceneId] : undefined;
    return !!scene && Object.keys(scene.items).length === 0;
  });
  return empty ? <div className="empty-hint">{t.scene.emptyHint}</div> : null;
}

export function App() {
  const ready = useGm((s) => s.ready);
  const fatal = useGm((s) => s.fatal);

  useEffect(() => {
    const onResize = () =>
      useUi.setState({ screen: { width: window.innerWidth, height: window.innerHeight } });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (fatal) return <div className="fatal">{fatal}</div>;
  if (!ready) return <div className="fatal muted">{t.common.loading}</div>;
  return (
    <div className="app">
      <GmCanvas />
      <EmptyHint />
      <TextEditor />
      <SelectionPlaque />
      <BackdropOverlay />
      <ContextMenu />
      <ToolOptions />
      <AlignPanel />
      <Toolbar />
      <Dock />
      <MainMenu />
      <GridViewPanel />
      <AmbientChip />
      <WelcomeScreen />
      <DialogHost />
      <ConfirmPrompt />
      <Toasts />
    </div>
  );
}
