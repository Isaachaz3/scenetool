import { AlertTriangle, Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ASSET_TYPES, MAX_TEXTURE_SIDE } from '../../../core/constants';
import type { SizeMode } from '../../../core/dpi/detect';
import type { AssetType } from '../../../core/types';
import { t } from '../../../i18n/ru';
import { getGm } from '../../../state/store';
import { openDialog, toast } from '../../../state/ui';
import { analyzeFile, createAsset, defaultsFor, detectFor, type AnalyzedFile } from '../../importer';
import { describeDetection } from '../detectionText';
import { Field, Modal, NumberInput, Segmented, Toggle } from '../common';

type Row = { file: File; analyzed?: AnalyzedFile; error?: string };
type LabelMode = 'none' | 'filename' | 'custom';

/** Batch import with shared settings: type, visibility, lock, size, rotation, label. */
export function ImportDialog({ files, type: presetType }: { files: File[]; type?: AssetType }) {
  const [rows, setRows] = useState<Row[]>(() => files.map((file) => ({ file })));
  const [type, setType] = useState<AssetType>(presetType ?? 'map');
  const [visible, setVisible] = useState(true);
  const [locked, setLocked] = useState((presetType ?? 'map') === 'map');
  const [sizeMode, setSizeMode] = useState<SizeMode>('auto');
  const [sizeValue, setSizeValue] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [labelMode, setLabelMode] = useState<LabelMode>('none');
  const [labelText, setLabelText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    files.forEach((file, i) => {
      analyzeFile(file)
        .then(
          (analyzed) => alive && setRows((r) => r.map((row, j) => (j === i ? { ...row, analyzed } : row))),
        )
        .catch(
          () =>
            alive &&
            setRows((r) => r.map((row, j) => (j === i ? { ...row, error: t.importer.unsupported } : row))),
        );
    });
    return () => {
      alive = false;
    };
  }, [files]);

  const size = useMemo(() => ({ mode: sizeMode, value: sizeValue }), [sizeMode, sizeValue]);
  const ready = rows.filter((r) => r.analyzed);
  const pending = rows.some((r) => !r.analyzed && !r.error);

  const close = () => openDialog(null);

  const run = async () => {
    setBusy(true);
    const created = new Set<string>();
    const known = new Set(Object.keys(getGm().assets));
    for (const row of ready) {
      const a = row.analyzed!;
      const label =
        labelMode === 'filename'
          ? a.name
          : labelMode === 'custom' && labelText.trim()
            ? labelText.trim()
            : undefined;
      try {
        const asset = await createAsset(a, {
          type,
          collectionId: getGm().collectionId,
          grid: detectFor(a, type, size).grid,
          defaults: { ...defaultsFor(type), visible, locked, rotation, ...(label ? { label } : {}) },
        });
        if (!known.has(asset.id)) created.add(asset.id);
      } catch (err) {
        console.error(err);
        toast(`${a.file.name}: ${t.importer.failed}`, 'error');
      }
    }
    toast(t.importer.imported(created.size));
    close();
  };

  return (
    <Modal
      title={t.importer.title(files.length)}
      onClose={close}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            {t.importer.cancel}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || pending || ready.length === 0}
            onClick={() => void run()}
          >
            {t.importer.import(ready.length)}
          </button>
        </>
      }
    >
      <div className="import-settings">
        <Field label={t.importer.type}>
          <select
            value={type}
            onChange={(e) => {
              const v = e.target.value as AssetType;
              setType(v);
              setLocked(v === 'map');
            }}
          >
            {ASSET_TYPES.map((x) => (
              <option key={x} value={x}>
                {t.assetTypeSingle[x]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.importer.visible}>
          <Toggle checked={visible} onChange={setVisible} label={t.importer.visible} />
        </Field>
        <Field label={t.importer.locked}>
          <Toggle checked={locked} onChange={setLocked} label={t.importer.locked} />
        </Field>
        <Field label={t.importer.size}>
          <select value={sizeMode} onChange={(e) => setSizeMode(e.target.value as SizeMode)}>
            {(['auto', 'dpi', 'cols', 'rows'] as const).map((m) => (
              <option key={m} value={m}>
                {t.importer.sizeModes[m]}
              </option>
            ))}
          </select>
          {sizeMode !== 'auto' ? (
            <NumberInput value={sizeValue} min={0.01} decimals={2} onChange={setSizeValue} />
          ) : null}
        </Field>
        <Field label={t.importer.rotation}>
          <Segmented
            value={String(rotation)}
            options={['0', '90', '180', '270'].map((v) => ({ value: v, label: `${v}°` }))}
            onChange={(v) => setRotation(Number(v))}
          />
        </Field>
        <Field label={t.importer.label}>
          <select value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)}>
            {(['none', 'filename', 'custom'] as const).map((m) => (
              <option key={m} value={m}>
                {t.importer.labelModes[m]}
              </option>
            ))}
          </select>
          {labelMode === 'custom' ? (
            <input className="text-input" value={labelText} onChange={(e) => setLabelText(e.target.value)} />
          ) : null}
        </Field>
      </div>
      <ul className="import-list">
        {rows.map((row, i) => {
          const a = row.analyzed;
          const d = a ? describeDetection(detectFor(a, type, size)) : null;
          // The same file twice in one batch, or a file already in the library.
          const duplicate = a && (a.existing || rows.slice(0, i).some((r) => r.analyzed?.hash === a.hash));
          const big = a && Math.max(a.width, a.height) > MAX_TEXTURE_SIDE;
          return (
            <li key={i}>
              <span className="import-name">{row.file.name}</span>
              {row.error ? <span className="bad">{row.error}</span> : null}
              {!a && !row.error ? <span className="muted">{t.importer.analyzing}</span> : null}
              {a ? (
                <>
                  <span className="muted">{t.manager.pixels(a.width, a.height)}</span>
                  {duplicate ? (
                    <span className="muted">
                      <Check size={14} /> {t.gridSource.duplicate}
                    </span>
                  ) : (
                    <span>{d!.text}</span>
                  )}
                  {d?.warning && !duplicate ? (
                    <span className="warn">
                      <AlertTriangle size={14} /> {d.warning}
                    </span>
                  ) : null}
                  {big ? (
                    <span className="warn">
                      <AlertTriangle size={14} /> {t.importer.tooLarge(Math.max(a.width, a.height))}
                    </span>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
