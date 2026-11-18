import { useState } from 'react';
import {
  isAutoUpdateEnabled,
  setAutoUpdateEnabled,
  UpdatePrompt,
  useUpdater,
} from '../updater';

interface SettingsPageProps {
  onStatus: (message: string) => void;
}

export function SettingsPage({ onStatus }: SettingsPageProps) {
  const updater = useUpdater();
  const [auto, setAuto] = useState(isAutoUpdateEnabled);

  function toggleAuto(enabled: boolean) {
    setAuto(enabled);
    setAutoUpdateEnabled(enabled);
    onStatus(enabled ? 'Startup update check enabled.' : 'Startup update check disabled.');
  }

  return (
    <div>
      <section className="page-section">
        <h2 className="section-title">Updates</h2>
        <label className="field-checkbox">
          <input
            type="checkbox"
            checked={auto}
            onChange={(event) => toggleAuto(event.target.checked)}
          />
          Check for updates when the app starts
        </label>
        <div className="field-row">
          <span className="field-label">Installed</span>
          <span>{updater.current || '…'}</span>
          {updater.update && <span className="inline-note">Available: {updater.update.version}</span>}
        </div>
        <div className="field-row">
          <button
            type="button"
            className="button button-primary"
            disabled={updater.checking || updater.installing}
            onClick={() => void updater.checkNow()}
          >
            {updater.checking ? 'Checking…' : 'Check now'}
          </button>
          {updater.update && (
            <button
              type="button"
              className="button"
              disabled={updater.installing}
              onClick={() => updater.setPromptOpen(true)}
            >
              Install {updater.update.version}
            </button>
          )}
        </div>
        {updater.error && <div className="inline-note">{updater.error}</div>}
        <div className="inline-note">
          Updates are signed with the release key and verified by the app before install. With your
          approval the setup runs in passive mode and the app restarts - no manual copying of
          binaries and no repeated SmartScreen prompt for each downloaded exe.
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Safety</h2>
        <div className="inline-note">
          Destructive operations (drop collection, compact, vacuum) automatically snapshot the
          database next to the data directory (pre-&lt;op&gt;-&lt;timestamp&gt;.backup) before they
          run. Encryption keys are typed per session in Workspace and are never persisted.
        </div>
      </section>

      <UpdatePrompt
        open={updater.promptOpen}
        onClose={() => updater.setPromptOpen(false)}
        version={updater.update?.version ?? ''}
        current={updater.current}
        progress={updater.progress}
        installing={updater.installing}
        onInstall={() => void updater.install()}
      />
    </div>
  );
}
