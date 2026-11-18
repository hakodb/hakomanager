import { useCallback, useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from './api/client';
import { errorMessage } from './types';

const AUTO_KEY = 'hakomanager.autoUpdate';

export function isAutoUpdateEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoUpdateEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, enabled ? '1' : '0');
  } catch {
    // Private mode: keep the in-memory default.
  }
}

// One check per process for the startup probe; manual checks bypass it.
let cachedUpdate: Update | null | undefined;
let startupDone = false;

async function checkUpdate(force: boolean): Promise<Update | null> {
  if (!isTauri()) return null;
  if (!force && cachedUpdate !== undefined) return cachedUpdate;
  cachedUpdate = await check();
  return cachedUpdate;
}

export interface UpdaterState {
  checking: boolean;
  installing: boolean;
  progress: number | null;
  update: Update | null;
  current: string;
  error: string;
  promptOpen: boolean;
  setPromptOpen: (open: boolean) => void;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
}

export function useUpdater(startup = false): UpdaterState {
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (isTauri()) void getVersion().then(setCurrent).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!startup || startupDone || !isAutoUpdateEnabled()) return;
    startupDone = true;
    void (async () => {
      try {
        const found = await checkUpdate(false);
        if (found) {
          setUpdate(found);
          setPromptOpen(true);
        }
      } catch {
        // Offline or no updater manifest yet - silent at startup.
      }
    })();
  }, [startup]);

  const checkNow = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      const found = await checkUpdate(true);
      setUpdate(found);
      if (!found) setError('You are on the latest version.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setChecking(false);
    }
  }, []);

  const install = useCallback(async () => {
    const target = update ?? (await checkUpdate(false));
    if (!target) return;
    setUpdate(target);
    setInstalling(true);
    setProgress(0);
    setError('');
    let total = 0;
    let done = 0;
    try {
      await target.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(99, Math.round((done / total) * 100)));
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });
      await relaunch();
    } catch (caught) {
      setError(errorMessage(caught));
      setProgress(null);
    } finally {
      setInstalling(false);
    }
  }, [update]);

  return {
    checking,
    installing,
    progress,
    update,
    current,
    error,
    promptOpen,
    setPromptOpen,
    checkNow,
    install,
  };
}

interface UpdatePromptProps {
  open: boolean;
  onClose: () => void;
  version: string;
  current: string;
  progress: number | null;
  installing: boolean;
  onInstall: () => void;
}

export function UpdatePrompt({
  open,
  onClose,
  version,
  current,
  progress,
  installing,
  onInstall,
}: UpdatePromptProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={installing ? undefined : onClose}>
      <div
        className="modal-card update-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="section-title">Update available</h2>
        <p className="page-hint">
          HakoManager {version} is ready{current ? ` (installed: ${current})` : ''}. Installing
          runs the setup update in the background and restarts the app.
        </p>
        {progress !== null && (
          <div className="update-progress">
            <div className="update-progress-bar" style={{ width: `${progress}%` }} />
            <span>{progress}%</span>
          </div>
        )}
        <div className="field-row">
          <button type="button" className="button button-primary" disabled={installing} onClick={onInstall}>
            {installing ? 'Installing…' : 'Install & restart'}
          </button>
          <button type="button" className="button" disabled={installing} onClick={onClose}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mounted once by App: silent startup check + the consent dialog. */
export function UpdateBootstrap() {
  const updater = useUpdater(true);
  return (
    <UpdatePrompt
      open={updater.promptOpen}
      onClose={() => updater.setPromptOpen(false)}
      version={updater.update?.version ?? ''}
      current={updater.current}
      progress={updater.progress}
      installing={updater.installing}
      onInstall={() => void updater.install()}
    />
  );
}
