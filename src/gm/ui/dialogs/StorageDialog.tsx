import { Download, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSetting } from '../../../db/db';
import { formatBytes, t } from '../../../i18n/ru';
import { assetUsage, deleteAsset } from '../../../state/assets';
import { useGm } from '../../../state/store';
import { choiceDialog, confirmDialog, openDialog, toast } from '../../../state/ui';
import {
  backupConflicts,
  backupFileName,
  BackupError,
  downloadBlob,
  exportBackup,
  importBackup,
  readBackup,
} from '../../backup';
import { Modal } from '../common';

const close = () => openDialog(null);

/** Usage, persistence, assets by size, unused cleanup and the backup buttons. */
export function StorageDialog() {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState<number | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const assets = useGm((s) => s.assets);
  const scenes = useGm((s) => s.scenes);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void navigator.storage
      ?.estimate?.()
      .then(setEstimate)
      .catch(() => setEstimate(null));
    void getSetting<number>('lastBackupAt').then(setLastBackup);
  };
  useEffect(() => {
    refresh();
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  const rows = useMemo(
    () =>
      Object.values(assets)
        .map((a) => ({ asset: a, usage: assetUsage(a.id) }))
        .sort((x, y) => y.asset.size - x.asset.size),
    // scenes: usage changes when items are added or removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, scenes],
  );
  const unused = rows.filter((r) => r.usage === 0);
  const unusedSize = unused.reduce((sum, r) => sum + r.asset.size, 0);

  const doExport = async () => {
    setBusy(t.storage.exporting);
    try {
      downloadBlob(await exportBackup(), backupFileName());
      refresh();
    } catch (err) {
      console.error(err);
      toast(t.common.error, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy(t.storage.importing);
    try {
      const parsed = await readBackup(file);
      const conflicts = backupConflicts(parsed);
      let policy: 'replace' | 'keep-both' = 'replace';
      if (conflicts > 0) {
        const answer = await choiceDialog(t.storage.conflicts(conflicts), [
          { value: 'replace', label: t.storage.replace },
          { value: 'keep-both', label: t.storage.keepBoth },
        ]);
        if (!answer) return;
        policy = answer as typeof policy;
      }
      const plan = await importBackup(parsed, policy);
      toast(t.storage.imported(plan.scenes.length, plan.assets.length));
      refresh();
    } catch (err) {
      console.error(err);
      toast(err instanceof BackupError ? err.message : t.common.error, 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeUnused = async () => {
    if (!(await confirmDialog(t.storage.deleteUnusedConfirm(unused.length)))) return;
    for (const r of unused) await deleteAsset(r.asset.id);
    refresh();
  };

  return (
    <Modal title={t.storage.title} onClose={close} wide>
      <div className="storage">
        <section>
          <p>
            {estimate?.usage !== undefined && estimate.quota !== undefined
              ? t.storage.used(formatBytes(estimate.usage), formatBytes(estimate.quota))
              : t.storage.unknown}
          </p>
          <p className="muted">{persisted ? t.storage.persisted : t.storage.notPersisted}</p>
          {!persisted && navigator.storage?.persist ? (
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.storage.persist().then(setPersisted)}
            >
              {t.storage.requestPersist}
            </button>
          ) : null}
          <h3>{t.storage.backup}</h3>
          <p className="muted">{t.storage.backupHint}</p>
          <p className="muted">
            {lastBackup
              ? t.storage.lastBackup(new Date(lastBackup).toLocaleString('ru-RU'))
              : t.storage.noBackup}
          </p>
          <div className="row">
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => void doExport()}>
              <Download size={16} /> {t.storage.export}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} /> {t.storage.import}
            </button>
            {busy ? <span className="muted">{busy}</span> : null}
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void doImport(f);
              }}
            />
          </div>
        </section>
        <section>
          <h3>{t.storage.assetsTable}</h3>
          <p className="muted">
            {t.storage.assets(rows.length)} · {t.storage.scenes(Object.keys(scenes).length)}
          </p>
          <div className="storage-table-wrap">
            <table className="storage-table">
              <thead>
                <tr>
                  <th>{t.storage.colName}</th>
                  <th>{t.storage.colType}</th>
                  <th className="num-col">{t.storage.colSize}</th>
                  <th className="num-col">{t.storage.colUsage}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ asset, usage }) => (
                  <tr key={asset.id} className={usage === 0 ? 'unused' : ''}>
                    <td>{asset.name}</td>
                    <td>{t.assetTypeSingle[asset.type]}</td>
                    <td className="num-col">{formatBytes(asset.size)}</td>
                    <td className="num-col">{usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {unused.length > 0 ? (
              <button type="button" className="btn danger" onClick={() => void removeUnused()}>
                <Trash2 size={16} /> {t.storage.deleteUnused(unused.length, formatBytes(unusedSize))}
              </button>
            ) : (
              <span className="muted">{t.storage.noUnused}</span>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
