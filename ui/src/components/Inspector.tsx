import type { CollectionInfo, DatabaseProfile } from '../types';

interface InspectorProps {
  profile?: DatabaseProfile | null;
  collection?: CollectionInfo | null;
}

export function Inspector({ profile = null, collection = null }: InspectorProps) {
  return (
    <div className="inspector" aria-label="Inspector">
      <div className="inspector-header">Inspector</div>
      <div className="inspector-body">
        {!profile ? (
          <div className="inspector-empty">Select a document to inspect its details.</div>
        ) : (
          <table className="kv-table">
            <tbody>
              <tr>
                <td>Profile id</td>
                <td>{profile.id}</td>
              </tr>
              <tr>
                <td>Name</td>
                <td>{profile.name}</td>
              </tr>
              <tr>
                <td>Path</td>
                <td>{profile.path}</td>
              </tr>
              <tr>
                <td>Mode</td>
                <td>{profile.read_only ? 'Read-only' : 'Writable'}</td>
              </tr>
              <tr>
                <td>Durability</td>
                <td>{profile.durability}</td>
              </tr>
              {collection && (
                <>
                  <tr>
                    <td>Collection</td>
                    <td>{collection.name}</td>
                  </tr>
                  <tr>
                    <td>Documents</td>
                    <td>{collection.doc_count}</td>
                  </tr>
                  <tr>
                    <td>Live bytes</td>
                    <td>{collection.live_bytes}</td>
                  </tr>
                  <tr>
                    <td>Total bytes</td>
                    <td>{collection.total_bytes}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
