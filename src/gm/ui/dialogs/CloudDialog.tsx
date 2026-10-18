import { LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FREE_PLAN } from '../../../cloud/config';
import { refreshUsage, signIn, signOut, signUp, syncNow, useCloud } from '../../../cloud/sync';
import { formatBytes, t } from '../../../i18n/ru';
import { openDialog } from '../../../state/ui';
import { Field, Modal } from '../common';

const close = () => openDialog(null);

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const k = Math.min(1, used / limit);
  return (
    <div className="usage">
      <span>{label}</span>
      <span className={'meter' + (k > 0.8 ? ' high' : '')}>
        <span style={{ width: `${Math.max(k * 100, used > 0 ? 1 : 0)}%` }} />
      </span>
    </div>
  );
}

function Usage() {
  const usage = useCloud((s) => s.usage);
  const missing = useCloud((s) => s.usageMissing);
  useEffect(() => void refreshUsage(), []);
  if (missing) return <p className="muted">{t.cloud.usageMissing}</p>;
  if (!usage) return null;
  return (
    <div className="usage-block">
      <h4>{t.cloud.usageTitle}</h4>
      <Meter
        label={t.cloud.usageFiles(formatBytes(usage.files), formatBytes(FREE_PLAN.files), usage.count)}
        used={usage.files}
        limit={FREE_PLAN.files}
      />
      <Meter
        label={t.cloud.usageDatabase(formatBytes(usage.database), formatBytes(FREE_PLAN.database))}
        used={usage.database}
        limit={FREE_PLAN.database}
      />
      <p className="muted usage-note">{t.cloud.usageNote}</p>
    </div>
  );
}

/** Sign in to the Supabase project; once signed in the library syncs on its own. */
export function CloudDialog() {
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const doSignIn = () =>
    run(async () => {
      const error = await signIn(email.trim(), password);
      if (error) setMessage({ text: error, bad: true });
    });

  const doSignUp = () =>
    run(async () => {
      const res = await signUp(email.trim(), password);
      if (res.error) setMessage({ text: res.error, bad: true });
      else if (res.confirm) setMessage({ text: t.cloud.checkEmail(email.trim()) });
    });

  const signedIn = cloud.status !== 'signed-out' && cloud.status !== 'loading' && !!cloud.email;

  return (
    <Modal title={t.cloud.title} onClose={close}>
      <p className="muted">{t.cloud.intro}</p>
      {signedIn ? (
        <>
          <p>{t.cloud.signedInAs(cloud.email!)}</p>
          <p className={cloud.status === 'error' ? 'bad' : 'muted'}>
            {cloud.status === 'error' && cloud.error ? cloud.error : t.cloud.status[cloud.status]}
          </p>
          {cloud.progress ? <p className="muted">{cloud.progress}</p> : null}
          {cloud.lastSyncAt ? (
            <p className="muted">{t.cloud.lastSync(new Date(cloud.lastSyncAt).toLocaleString('ru-RU'))}</p>
          ) : null}
          <Usage />
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={cloud.status === 'syncing'}
              onClick={() => void syncNow()}
            >
              <RefreshCw size={16} /> {t.cloud.syncNow}
            </button>
            <button type="button" className="btn" onClick={() => void signOut()}>
              <LogOut size={16} /> {t.cloud.signOut}
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doSignIn();
          }}
        >
          <p className="muted">{t.cloud.localOnly}</p>
          <Field label={t.cloud.email}>
            <input
              className="text-input wide"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t.cloud.password}>
            <input
              className="text-input wide"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {message ? <p className={message.bad ? 'bad' : ''}>{message.text}</p> : null}
          <div className="row">
            <button type="submit" className="btn primary" disabled={busy || !email || !password}>
              <LogIn size={16} /> {t.cloud.signIn}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !email || !password}
              onClick={() => void doSignUp()}
            >
              <UserPlus size={16} /> {t.cloud.signUp}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
