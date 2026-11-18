import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from './api/client';
import { IconRail } from './components/IconRail';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { UpdateBootstrap } from './updater';
import { WatchFeed } from './components/WatchFeed';
import { CollectionsPage } from './pages/CollectionsPage';
import { ConsolePage } from './pages/ConsolePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { GraphPage } from './pages/GraphPage';
import { IndexesPage } from './pages/IndexesPage';
import { OpsPage } from './pages/OpsPage';
import { QueryPage } from './pages/QueryPage';
import { SettingsPage } from './pages/SettingsPage';
import { SyncPage } from './pages/SyncPage';
import { VectorPage } from './pages/VectorPage';
import { WorkspacePage } from './pages/WorkspacePage';
import {
  errorMessage,
  isCollectionInfo,
  isDatabaseProfile,
  loadSession,
  saveSession,
  type AppTab,
  type CollectionInfo,
  type DatabaseProfile,
} from './types';

const initialSession = loadSession();

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(initialSession?.activeTab ?? 'workspace');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    initialSession?.activeProfileId ?? null,
  );
  const [activeCollection, setActiveCollection] = useState<string | null>(
    initialSession?.activeCollection ?? null,
  );
  const [databases, setDatabases] = useState<DatabaseProfile[]>([]);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [status, setStatus] = useState('Ready');
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [newDocToken, setNewDocToken] = useState(0);
  const [deleteToken, setDeleteToken] = useState(0);
  const [restored, setRestored] = useState(false);
  const restoreStarted = useRef(false);

  const refreshDatabases = useCallback(async (): Promise<DatabaseProfile[]> => {
    try {
      const raw = await invoke<unknown>('workspace.list', {});
      const list = Array.isArray(raw) ? raw.filter(isDatabaseProfile) : [];
      setDatabases(list);
      return list;
    } catch (caught) {
      setStatus(errorMessage(caught));
      return [];
    }
  }, []);

  const refreshCollections = useCallback(async (): Promise<CollectionInfo[]> => {
    if (!activeProfileId) {
      setCollections([]);
      return [];
    }
    try {
      const raw = await invoke<unknown>('collection.list', { profileId: activeProfileId });
      const list = Array.isArray(raw) ? raw.filter(isCollectionInfo) : [];
      setCollections(list);
      return list;
    } catch (caught) {
      setStatus(errorMessage(caught));
      return [];
    }
  }, [activeProfileId]);

  useEffect(() => {
    void refreshDatabases();
  }, [refreshDatabases]);

  useEffect(() => {
    void refreshCollections();
  }, [refreshCollections]);

  // Reopen last session's databases. Encrypted databases are skipped: their
  // keys live only in memory and must never be persisted.
  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    const saved = initialSession?.databases ?? [];
    void (async () => {
      let opened = 0;
      let skipped = 0;
      for (const entry of saved) {
        if (!entry.path || entry.encrypted) {
          skipped += 1;
          continue;
        }
        try {
          await invoke('workspace.open', {
            path: entry.path,
            readOnly: entry.readOnly,
          });
          opened += 1;
        } catch {
          skipped += 1;
        }
      }
      const list = await refreshDatabases();
      if (activeProfileId && !list.some((db) => db.id === activeProfileId)) {
        setActiveProfileId(list[0]?.id ?? null);
      }
      setRestored(true);
      if (opened || skipped) {
        setStatus(
          `Session restored: ${opened} database(s) reopened` +
            (skipped ? `, ${skipped} skipped (encrypted or unavailable)` : '') +
            '.',
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveSession({
      activeTab,
      activeProfileId,
      activeCollection,
      databases: databases.map((db) => ({
        path: db.path,
        name: db.name,
        readOnly: db.read_only,
        encrypted: Boolean(db.encryption_configured),
      })),
    });
  }, [restored, activeTab, activeProfileId, activeCollection, databases]);

  const activateProfile = useCallback((id: string | null) => {
    setActiveProfileId(id);
    setActiveCollection(null);
    setStatus(id ? `Active profile: ${id}` : 'No active profile');
  }, []);

  const selectCollection = useCallback((name: string | null) => {
    setActiveCollection(name);
  }, []);

  const navigate = useCallback((tab: AppTab) => {
    setActiveTab(tab);
  }, []);

  const refreshAll = useCallback(() => {
    void refreshDatabases().then(() => refreshCollections());
  }, [refreshDatabases, refreshCollections]);

  const openDocument = useCallback(
    (id: string, collection?: string) => {
      if (collection && collection !== activeCollection) setActiveCollection(collection);
      setFocusDocId(id);
      setActiveTab('documents');
    },
    [activeCollection],
  );

  const activeProfile = useMemo(
    () => databases.find((db) => db.id === activeProfileId) ?? null,
    [databases, activeProfileId],
  );
  const activeCollectionInfo = useMemo(
    () => collections.find((item) => item.name === activeCollection) ?? null,
    [collections, activeCollection],
  );
  const context = activeProfile
    ? `${activeProfile.name}${activeCollection ? ` / ${activeCollection}` : ''}`
    : 'No database open';

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="workbench">
        <IconRail
          activeTab={activeTab}
          onNavigate={navigate}
          onOpen={() => navigate('workspace')}
          onRefresh={refreshAll}
          onNewDocument={() => {
            setNewDocToken((value) => value + 1);
            navigate('documents');
          }}
          onDelete={() => {
            setDeleteToken((value) => value + 1);
            navigate('documents');
          }}
        />
        <Sidebar
          databases={databases}
          collections={collections}
          activeProfileId={activeProfileId}
          activeCollection={activeCollection}
          profile={activeProfile}
          collection={activeCollectionInfo}
          onSelectProfile={activateProfile}
          onSelectCollection={(name) => {
            selectCollection(name);
            navigate('documents');
          }}
        />
        <main className="main-area">
          <div className="page-host">
            <div className="page">
              {activeTab === 'workspace' && (
                <WorkspacePage
                  databases={databases}
                  activeProfileId={activeProfileId}
                  onActivate={activateProfile}
                  refreshDatabases={refreshDatabases}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'collections' && (
                <CollectionsPage
                  profileId={activeProfileId}
                  collections={collections}
                  activeCollection={activeCollection}
                  onSelectCollection={selectCollection}
                  onNavigate={navigate}
                  refreshCollections={refreshCollections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'documents' && (
                <DocumentsPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  focusDocId={focusDocId}
                  newDocToken={newDocToken}
                  deleteToken={deleteToken}
                  onCollectionChange={selectCollection}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'query' && (
                <QueryPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  onOpenDocument={openDocument}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'console' && (
                <ConsolePage
                  profileId={activeProfileId}
                  collections={collections}
                  onOpenDocument={openDocument}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'indexes' && (
                <IndexesPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'vector' && (
                <VectorPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'graph' && (
                <GraphPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'ops' && (
                <OpsPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'sync' && (
                <SyncPage profileId={activeProfileId} onStatus={setStatus} />
              )}
              {activeTab === 'watch' && (
                <WatchFeed
                  profileId={activeProfileId}
                  collections={collections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'settings' && <SettingsPage onStatus={setStatus} />}
            </div>
          </div>
        </main>
      </div>
      <StatusBar message={status} context={context} />
      <UpdateBootstrap />
    </div>
  );
}
