import { AlertTriangle, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_GRID } from '../../../core/constants';
import { formatScale, parseScale } from '../../../core/scale';
import type { GridScale, ImageGrid } from '../../../core/types';
import { t } from '../../../i18n/ru';
import { createSceneFromMap } from '../../../state/scenes';
import { getGm } from '../../../state/store';
import { getUi, openDialog, toast } from '../../../state/ui';
import {
  ACCEPT_ATTR,
  analyzeFile,
  createAsset,
  defaultsFor,
  detectFor,
  type AnalyzedFile,
} from '../../importer';
import { describeDetection } from '../detectionText';
import { Field, Modal } from '../common';
import { FitPreview, GridFitFields, nudgeGrid } from '../GridFit';
import { VisualAlignButton } from '../VisualAlign';

/** Main path: pick a map, check the detected grid, create the scene in one step. */
export function SceneFromMapDialog({ file: initial }: { file?: File }) {
  const [file, setFile] = useState<File | undefined>(initial);
  const [analyzed, setAnalyzed] = useState<AnalyzedFile | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap>();
  const [grid, setGrid] = useState<ImageGrid | null>(null);
  const [name, setName] = useState('');
  const [scaleText, setScaleText] = useState(formatScale(DEFAULT_GRID.scale));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => openDialog(null);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    let bmp: ImageBitmap | undefined;
    analyzeFile(file)
      .then((a) => {
        if (!alive) return;
        setAnalyzed(a);
        setGrid(a.existing?.grid ?? detectFor(a, 'map').grid);
        setName(a.name);
        return createImageBitmap(file);
      })
      .then((b) => {
        bmp = b;
        if (alive) setBitmap(b);
        else b?.close();
      })
      .catch(() => {
        toast(`${file.name}: ${t.importer.unsupported}`, 'error');
        setFile(undefined);
      });
    return () => {
      alive = false;
      bmp?.close();
    };
  }, [file]);

  // Opened from the dock button: go straight to the file picker (still within the click).
  useEffect(() => {
    if (!initial) input.current?.click();
  }, [initial]);

  // Arrows move the grid overlay over the image; + and − change DPI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || !grid) return;
      const next = nudgeGrid(e, grid, 1);
      if (next) {
        e.preventDefault();
        setGrid(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid]);

  const scale: GridScale | null = parseScale(scaleText);
  const detection =
    analyzed && grid
      ? describeDetection({
          ...detectFor(analyzed, 'map'),
          grid,
          cols: analyzed.width / grid.dpi,
          rows: analyzed.height / grid.dpi,
        })
      : null;
  const auto = analyzed ? detectFor(analyzed, 'map') : null;

  const create = async () => {
    if (!analyzed || !grid || !scale) return;
    setBusy(true);
    try {
      const asset = await createAsset(analyzed, {
        type: 'map',
        collectionId: getGm().collectionId,
        grid,
        defaults: defaultsFor('map'),
      });
      createSceneFromMap(asset, name.trim() || analyzed.name, { scale }, getUi().screen, grid);
      close();
    } catch (err) {
      console.error(err);
      toast(t.importer.failed, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t.sceneImport.title}
      onClose={close}
      wide
      className="scene-import"
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!grid || !scale || busy}
            onClick={() => void create()}
          >
            {t.sceneImport.create}
          </button>
        </>
      }
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setAnalyzed(null);
            setGrid(null);
            setFile(f);
          }
          e.target.value = '';
        }}
      />
      {!file ? (
        <button type="button" className="btn primary big" onClick={() => input.current?.click()}>
          <Upload size={18} /> {t.sceneImport.pick}
        </button>
      ) : !analyzed || !grid ? (
        <p className="muted">{t.importer.analyzing}</p>
      ) : (
        <div className="scene-import-body">
          <div className="scene-import-preview">
            <FitPreview image={bitmap} width={analyzed.width} height={analyzed.height} grid={grid} />
            <p className="hint">
              {t.sceneImport.previewHint}. {t.align.keysHint}
            </p>
          </div>
          <div className="scene-import-side">
            <Field label={t.sceneImport.name}>
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field
              label={t.sceneImport.scale}
              hint={!scale ? <span className="bad">{t.grid.scaleInvalid}</span> : null}
            >
              <input
                className="text-input"
                value={scaleText}
                onChange={(e) => setScaleText(e.target.value)}
              />
            </Field>
            <p className="muted">{t.manager.pixels(analyzed.width, analyzed.height)}</p>
            {detection ? (
              <p>
                {detection.text}
                {detection.warning ? (
                  <span className="warn">
                    {' '}
                    <AlertTriangle size={14} /> {detection.warning}
                  </span>
                ) : null}
              </p>
            ) : null}
            <GridFitFields width={analyzed.width} height={analyzed.height} grid={grid} onChange={setGrid} />
            <div className="row">
              <VisualAlignButton
                image={bitmap}
                width={analyzed.width}
                height={analyzed.height}
                grid={grid}
                onChange={setGrid}
              />
              {auto ? (
                <button type="button" className="btn" onClick={() => setGrid(auto.grid)}>
                  {t.align.reset}
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => input.current?.click()}>
                <Upload size={16} /> {t.sceneImport.pick}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
