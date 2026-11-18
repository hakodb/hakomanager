import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from './api/client';
import { Inspector } from './components/Inspector';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
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
  type AppTab,
  type CollectionInfo,
  type DatabaseProfile,
} from './types';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'collections', label: 'Collections' },
  { id: 'documents', label: 'Documents' },
  { id: 'query', label: 'Query' },
  { id: 'console', label: 'Console' },
  { id: 'indexes', label: 'Indexes' },
  { id: 'vector', label: 'Vector' },
  { id: 'graph', label: 'Graph' },
  { id: 'ops', label: 'Ops' },
  { id: 'sync', label: 'Sync' },
  { id: 'watch', label: 'Watch' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('workspace');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [databases, setDatabases] = useState<DatabaseProfile[]>([]);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [status, setStatus] = useState('Ready');

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

  const activeProfile = useMemo(
    () => databases.find((db) => db.id === activeProfileId) ?? null,
    [databases, activeProfileId]
  );
  const activeCollectionInfo = useMemo(
    () => collections.find((item) => item.name === activeCollection) ?? null,
    [collections, activeCollection]
  );
  const context = activeProfile
    ? `${activeProfile.name}${activeCollection ? ` / ${activeCollection}` : ''}`
    : 'No database open';

  return (
    <div className="app-shell">
      <TitleBar />
      <Toolbar
        onOpen={() => navigate('workspace')}
        onRefresh={refreshAll}
        onNewDocument={() => navigate('documents')}
        onDelete={() => navigate('documents')}
        context={context}
      />
      <div className="workbench">
        <Sidebar
          databases={databases}
          collections={collections}
          activeProfileId={activeProfileId}
          activeCollection={activeCollection}
          onSelectProfile={activateProfile}
          onSelectCollection={(name) => {
            selectCollection(name);
            navigate('documents');
          }}
        />
        <main className="main-area">
          <div className="page-host">
            <div className="tab-strip" role="tablist" aria-label="Application pages">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`tab-button${activeTab === tab.id ? ' tab-active' : ''}`}
                  onClick={() => navigate(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
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
                  onCollectionChange={selectCollection}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'query' && (
                <QueryPage
                  profileId={activeProfileId}
                  collection={activeCollection}
                  collections={collections}
                  onStatus={setStatus}
                />
              )}
              {activeTab === 'console' && (
                <ConsolePage
                  profileId={activeProfileId}
                  collections={collections}
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
        <Inspector profile={activeProfile} collection={activeCollectionInfo} />
      </div>
      <StatusBar message={status} context={context} />
    </div>
  );
}
