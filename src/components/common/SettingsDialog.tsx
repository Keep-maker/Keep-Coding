import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { store, useApp } from '../../state/store';
import { IconCheck, IconClose, IconWarning } from '../common/Icons';

export function SettingsDialog() {
  const state = useApp();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(state.provider?.baseUrl ?? 'https://api.deepseek.com/v1');
  const [model, setModel] = useState(state.provider?.model ?? 'deepseek-flash');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!state.settingsOpen) return;
    setBaseUrl(state.provider?.baseUrl ?? '');
    setModel(state.provider?.model ?? '');
    setTestResult(null);
  }, [state.settingsOpen]);

  if (!state.settingsOpen) return null;

  const save = async () => {
    setSaving(true);
    try {
      await store.saveProvider({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
      });
      setApiKey('');
      store.setToast('info', 'Settings saved');
      store.toggleSettings(false);
    } catch (err) {
      store.setToast('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (apiKey.trim() || baseUrl !== state.provider?.baseUrl || model !== state.provider?.model) {
      await store.saveProvider({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
      });
    }
    setTestResult(null);
    try {
      const result = await api.testSettings();
      setTestResult({ ok: true, text: `Connection OK in ${result.latencyMs}ms - replied "${result.sample}"` });
    } catch (err) {
      setTestResult({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && store.toggleSettings(false)}>
      <div className="dialog">
        <div className="dialog__header">
          <span>Model Settings</span>
          <button className="icon-btn" onClick={() => store.toggleSettings(false)}>
            <IconClose size={14} />
          </button>
        </div>
        <div className="dialog__body">
          <div className="field">
            <label>Base URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
            <span className="field__hint">Any OpenAI-compatible endpoint. The /chat/completions path is added automatically.</span>
          </div>
          <div className="field">
            <label>Model ID</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-flash" />
          </div>
          <div className="field">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={state.provider?.apiKeyConfigured ? `Stored: ${state.provider.apiKeyMasked}` : 'sk-...'}
            />
            <span className="field__hint">
              Stored locally in <span className="mono">.data/settings.json</span> on this machine and never sent anywhere
              except your configured endpoint.
            </span>
          </div>
          {testResult && (
            <div className={`settings__result ${testResult.ok ? 'is-ok' : 'is-err'}`}>
              {testResult.ok ? <IconCheck size={13} /> : <IconWarning size={13} />}
              <span>{testResult.text}</span>
            </div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="btn btn--ghost" onClick={() => void test()}>
            Test connection
          </button>
          <button className="btn btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastLayer() {
  const state = useApp();
  if (!state.toast) return null;
  return (
    <div className="toast-layer">
      <div className={`toast toast--${state.toast.level}`} onClick={() => store.dismissToast()}>
        {state.toast.level === 'error' ? <IconWarning size={14} /> : <IconCheck size={14} />}
        <span>{state.toast.text}</span>
      </div>
    </div>
  );
}
