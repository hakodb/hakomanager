import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../types';

const SETTINGS_KEY = 'hakomanager.settings';

interface AppSettings {
  /** Check GitHub releases for a newer version at startup. */
  updateCheck: boolean;
  /** Interval in hours between update checks. */
  updateCheckIntervalHours: number;
  /** Include pre-release (0.x) versions. 0.x-only repos: always true. */
  includePrerelease: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  updateCheck: true,
  updateCheckIntervalHours: 24,
  includePrerelease: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface ReleaseInfo {
  tagName: string;
  htmlUrl: string;
  publishedAt: string | null;
}

interface SettingsPageProps {
  onStatus: (message: string) => void;
}

/** Compare two semver-ish tag names ("v0.2.0" / "0.3.1"). */
function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) =>
    value
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const [cMajor, cMinor, cPatch] = parse(candidate);
  const [mMajor, mMinor, mPatch] = parse(current);
  if (cMajor !== mMajor) return cMajor > mMajor;
  if (cMinor !== mMinor) return cMinor > mMinor;
  return cPatch > mPatch;
}

export function SettingsPage({ onStatus }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [checking, setChecking] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const checkForUpdate = useCallback(
    async (notifyWhenCurrent: boolean) => {
      setChecking(true);
      setCheckError('');
      try {
        const response = await fetch(
          'https://api.github.com/repos/hakodb/hakomanager/releases/latest',
          { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          tag_name?: string;
          html_url?: string;
          published_at?: string;
        };
        if (!payload.tag_name) {
          throw new Error('no tag_name in release payload');
        }
        const info: ReleaseInfo = {
          tagName: payload.tag_name,
          htmlUrl: payload.html_url ?? 'https://github.com/hakodb/hakomanager/releases',
          publishedAt: payload.published_at ?? null,
        };
        setRelease(info);
        // shortcut: current version is hardcoded; bump it in the same PR as
        // the Cargo.toml/tauri.conf.json version bump on every release
        const current = '0.1.3';
        if (isNewerVersion(info.tagName, current)) {
          onStatus(`Update available: ${info.tagName}.`);
        } else if (notifyWhenCurrent) {
          onStatus(`You are on the latest release (current ${current}).`);
        }
      } catch (caught) {
        setCheckError(errorMessage(caught));
        if (notifyWhenCurrent) {
          onStatus(`Update check failed: ${errorMessage(caught)}`);
        }
      } finally {
        setChecking(false);
      }
    },
    [onStatus]
  );

  useEffect(() => {
    if (settings.updateCheck) {
      void checkForUpdate(false);
    }
    // Run the startup check once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <section className="page-section">
        <h2 className="section-title">Updates</h2>
        <label className="field-checkbox">
          <input
            type="checkbox"
            checked={settings.updateCheck}
            onChange={(event) => setSettings({ ...settings, updateCheck: event.target.checked })}
          />
          Check for updates against the latest GitHub release
        </label>
        <div className="field-row">
          <span className="field-label">Check interval (hours)</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            max={168}
            value={settings.updateCheckIntervalHours}
            onChange={(event) =>
              setSettings({
                ...settings,
                updateCheckIntervalHours: Math.max(1, Number(event.target.value) || 24),
              })
            }
          />
        </div>
        <div className="field-row">
          <button
            type="button"
            className="button button-primary"
            disabled={checking}
            onClick={() => void checkForUpdate(true)}
          >
            {checking ? 'Checking...' : 'Check now'}
          </button>
          {release && (
            <span>
              Latest release:{' '}
              <a href={release.htmlUrl} target="_blank" rel="noreferrer">
                {release.tagName}
              </a>
              {release.publishedAt ? ` (${release.publishedAt.slice(0, 10)})` : ''}
            </span>
          )}
        </div>
        {checkError && <div className="inline-error">{checkError}</div>}
        <div className="inline-note">
          Checks query the public GitHub releases API - no telemetry, no downloads without your
          action. When a newer release is available, grab the installer from the link above; the
          app itself is never modified in place.
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Safety</h2>
        <div className="inline-note">
          Destructive operations (drop collection, compact, vacuum) automatically snapshot the
          database next to the data directory (pre-&lt;op&gt;-&lt;timestamp&gt;.backup) before they
          run. Encryption keys are typed per session in Workspace and are never persisted.
        </div>
        <div className="field-row">
          <button type="button" className="button" onClick={() => setSettings(loadSettings())}>
            Restore defaults
          </button>
        </div>
      </section>
    </div>
  );
}
