import { useState } from 'react';
import { store, useApp } from '../../state/store';
import { IconCheck, IconWarning } from './Icons';

/**
 * Shown when VITE_API_BASE points at a server that requires an access token.
 * The token is typed by the user and kept in localStorage; it is never baked
 * into the bundle, so publishing the site does not publish the credential.
 */
export function LoginScreen() {
  const state = useApp();
  const [token, setTokenValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      await store.signIn(token);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__brand">
          <span className="titlebar__brand-mark">C</span>
          <span>Keep Coding</span>
        </div>
        <p className="login__lede">
          This workspace runs an agent with shell access, so the API requires an access token.
        </p>

        <div className="field">
          <label htmlFor="access-token">Access token</label>
          <input
            id="access-token"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={token}
            onChange={(event) => setTokenValue(event.target.value)}
            placeholder="Paste the token configured on the server"
          />
        </div>

        {state.authError && (
          <div className="settings__result is-err">
            <IconWarning size={13} />
            <span>{state.authError}</span>
          </div>
        )}

        <button className="btn btn--primary login__submit" type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Verifying...' : 'Continue'}
        </button>

        <p className="login__hint">
          <IconCheck size={12} /> Stored only in this browser.
        </p>
      </form>
    </div>
  );
}
