import { useEffect, useState } from 'react';
import { DEFAULT_GRID, DISC_COLORS } from '../../../core/constants';
import { formatScale, parseScale } from '../../../core/scale';
import { t, formatBytes } from '../../../i18n/ru';
import { updateSettings } from '../../../state/assets';
import { addDisc } from '../../../state/items';
import { addScene, newScene, nextSceneName } from '../../../state/scenes';
import { activeScene, useGm } from '../../../state/store';
import { openDialog, useUi } from '../../../state/ui';
import { ColorSwatches, Field, Modal, NumberInput, Segmented, Toggle } from '../common';

const close = () => openDialog(null);

export function NewSceneDialog() {
  const [name, setName] = useState(nextSceneName());
  const [scaleText, setScaleText] = useState(formatScale(DEFAULT_GRID.scale));
  const scale = parseScale(scaleText);
  const create = () => {
    if (!scale) return;
    addScene(newScene(name.trim() || nextSceneName(), { scale }));
    close();
  };
  return (
    <Modal
      title={t.newScene.title}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn primary" disabled={!scale} onClick={create}>
            {t.newScene.create}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Field label={t.sceneImport.name}>
          <input className="text-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label={t.sceneImport.scale}
          hint={!scale ? <span className="bad">{t.grid.scaleInvalid}</span> : t.grid.scaleHint}
        >
          <input className="text-input" value={scaleText} onChange={(e) => setScaleText(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function nextNumber(): string {
  const scene = activeScene();
  let max = 0;
  for (const it of Object.values(scene?.items ?? {})) {
    if (it.kind === 'disc' && /^\d+$/.test(it.text)) max = Math.max(max, Number(it.text));
  }
  return String(max + 1);
}

/** "Кружок": a colored disc with a number or a letter. */
export function DiscDialog() {
  const [color, setColor] = useState(DISC_COLORS[0]);
  const [text, setText] = useState(nextNumber);
  const [size, setSize] = useState('1');
  const add = () => {
    const v = activeScene()?.gmViewport;
    addDisc(
      { color, text: text.slice(0, 4), sizeCells: Number(size) },
      v ? { x: v.x, y: v.y } : { x: 0, y: 0 },
    );
    setText(/^\d+$/.test(text) ? String(Number(text) + 1) : text);
  };
  return (
    <Modal
      title={t.disc.title}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            {t.common.close}
          </button>
          <button type="button" className="btn primary" onClick={add}>
            {t.disc.add}
          </button>
        </>
      }
    >
      <Field label={t.disc.color}>
        <ColorSwatches value={color} colors={DISC_COLORS} onChange={setColor} />
      </Field>
      <Field label={t.disc.text}>
        <input
          className="text-input"
          maxLength={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </Field>
      <Field label={t.disc.size}>
        <Segmented
          value={size}
          options={['0.5', '1', '2', '3', '4'].map((v) => ({ value: v, label: v.replace('.', ',') }))}
          onChange={setSize}
        />
      </Field>
    </Modal>
  );
}

export function SettingsDialog() {
  const settings = useGm((s) => s.settings);
  const pd = settings.playerDefaults;
  return (
    <Modal title={t.settings.title} onClose={close}>
      <h3>{t.settings.playerDefaults}</h3>
      <Field label={t.settings.grid}>
        <Toggle
          checked={pd.grid}
          onChange={(grid) => void updateSettings({ playerDefaults: { ...pd, grid } })}
        />
      </Field>
      <Field label={t.settings.ruler}>
        <Toggle
          checked={pd.ruler}
          onChange={(ruler) => void updateSettings({ playerDefaults: { ...pd, ruler } })}
        />
      </Field>
      <Field label={t.settings.pointer}>
        <Toggle
          checked={pd.pointer}
          onChange={(pointer) => void updateSettings({ playerDefaults: { ...pd, pointer } })}
        />
      </Field>
      <Field label={t.settings.fogOpacity}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.fogGmOpacity}
          onChange={(e) => void updateSettings({ fogGmOpacity: Number(e.target.value) })}
        />
        <span className="opt-value">{Math.round(settings.fogGmOpacity * 100)}%</span>
      </Field>
      <Field label={t.settings.syncDuration}>
        <NumberInput
          value={settings.syncViewDuration}
          decimals={0}
          min={0}
          max={5000}
          step={50}
          onChange={(syncViewDuration) => void updateSettings({ syncViewDuration })}
        />
      </Field>
    </Modal>
  );
}

export function StorageDialog() {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const assets = useGm((s) => Object.keys(s.assets).length);
  const scenes = useGm((s) => Object.keys(s.scenes).length);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then(setEstimate)
      .catch(() => setEstimate(null));
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);
  return (
    <Modal title={t.storage.title} onClose={close}>
      <p>
        {estimate?.usage !== undefined && estimate.quota !== undefined
          ? t.storage.used(formatBytes(estimate.usage), formatBytes(estimate.quota))
          : t.storage.unknown}
      </p>
      <p>{persisted ? t.storage.persisted : t.storage.notPersisted}</p>
      {!persisted && navigator.storage?.persist ? (
        <button
          type="button"
          className="btn"
          onClick={() => void navigator.storage.persist().then(setPersisted)}
        >
          {t.storage.requestPersist}
        </button>
      ) : null}
      <p className="muted">
        {t.storage.assets(assets)} · {t.storage.scenes(scenes)}
      </p>
      <p className="muted">{t.storage.backupLater}</p>
    </Modal>
  );
}

export function HotkeysDialog() {
  return (
    <Modal title={t.hotkeys.title} onClose={close}>
      <table className="hotkeys">
        <tbody>
          {t.hotkeys.list.map(([action, keys]) => (
            <tr key={action}>
              <td>{action}</td>
              <td>
                <kbd>{keys}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/** Confirmation and text prompts requested through the UI store. */
export function ConfirmPrompt() {
  const confirm = useUi((s) => s.confirm);
  const prompt = useUi((s) => s.prompt);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (prompt) setValue(prompt.value);
  }, [prompt]);
  if (confirm) {
    const done = (ok: boolean) => {
      useUi.setState({ confirm: null });
      confirm.resolve(ok);
    };
    return (
      <Modal
        title={t.common.confirm}
        onClose={() => done(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => done(false)}>
              {t.common.no}
            </button>
            <button type="button" className="btn primary" autoFocus onClick={() => done(true)}>
              {t.common.yes}
            </button>
          </>
        }
      >
        <p>{confirm.text}</p>
      </Modal>
    );
  }
  if (prompt) {
    const done = (v: string | null) => {
      useUi.setState({ prompt: null });
      prompt.resolve(v);
    };
    return (
      <Modal
        title={prompt.text}
        onClose={() => done(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => done(null)}>
              {t.common.cancel}
            </button>
            <button type="button" className="btn primary" onClick={() => done(value)}>
              {t.common.ok}
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            done(value);
          }}
        >
          <input
            className="text-input wide"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </form>
      </Modal>
    );
  }
  return null;
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((x) => (
        <div key={x.id} className={'toast panel ' + x.tone}>
          {x.text}
        </div>
      ))}
    </div>
  );
}
