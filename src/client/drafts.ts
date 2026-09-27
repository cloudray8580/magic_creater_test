import type { CreativeDocument as GameDocument } from '../shared/creative.js';
export interface Draft {
  document: GameDocument;
  revision: number;
  dirty: boolean;
  local?: boolean;
  saving?: boolean;
  allowRemix?: boolean;
  creationKey?: string;
  updatedAt?: number;
}
let queue = Promise.resolve();
const pending = new Map<string, { snapshot: Draft; promise: Promise<void> }>();
function enqueue<T>(work: () => Promise<T>, barrier = true): Promise<T> {
  // Reads, deletes, migrations and clean snapshots must preserve their position in the queue.
  if (barrier) pending.clear();
  const task = queue.then(work);
  queue = task.then(
    () => {},
    () => {},
  );
  return task;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('magic-creater-drafts', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export function readDraft(user: string, project: string): Promise<Draft | undefined> {
  return enqueue(async () => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const r = db
          .transaction('drafts')
          .objectStore('drafts')
          .get(user + ':' + project);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
export function writeDraft(
  user: string,
  project: string,
  draft: Draft,
  force = false,
): Promise<void> {
  const key = user + ':' + project;
  const existing = pending.get(key);
  if (!force && draft.dirty && existing) {
    existing.snapshot = structuredClone(draft);
    return existing.promise;
  }
  const entry = { snapshot: structuredClone(draft), promise: Promise.resolve() };
  if (force || !draft.dirty) pending.clear();
  const task = enqueue(async () => {
    if (pending.get(key) === entry) pending.delete(key);
    const snapshot = entry.snapshot;
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        const store = tx.objectStore('drafts'),
          key = user + ':' + project;
        const request = store.get(key);
        request.onsuccess = () => {
          const previous = request.result as Draft | undefined;
          // A save may clear only the same snapshot. Another tab's unsaved work stays intact.
          if (
            !force &&
            !snapshot.dirty &&
            previous?.dirty &&
            JSON.stringify(previous.document) !== JSON.stringify(snapshot.document)
          )
            return;
          store.put(snapshot, key);
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, false);
  entry.promise = task;
  if (!force && draft.dirty) pending.set(key, entry);
  return task;
}

/** Hold one editor per account/project in this browser; the browser releases it on tab close. */
export function holdDraft(user: string, project: string): Promise<() => void> {
  if (!navigator.locks)
    return Promise.reject(
      new Error('此浏览器无法安全保存草稿，请使用支持安全连接的浏览器打开工坊'),
    );
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request('magic-editor:' + user + ':' + project, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(new Error('这个作品已在另一个标签中编辑，请先关闭该编辑页或返回作品列表'));
          return;
        }
        await new Promise<void>((unlock) =>
          resolve(() => {
            pending.clear();
            void queue.then(unlock);
          }),
        );
      })
      .catch(reject);
  });
}

/** Enumerate only this account's unsynchronized creations; malformed payloads remain recoverable. */
export function listLocalDrafts(
  user: string,
  includeOrphans = false,
): Promise<{ id: string; draft: Draft }[]> {
  return enqueue(async () => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const items: { id: string; draft: Draft }[] = [];
        const r = db.transaction('drafts').objectStore('drafts').openCursor();
        r.onsuccess = () => {
          const cursor = r.result;
          if (!cursor) {
            resolve(items);
            return;
          }
          const key = String(cursor.key);
          if (
            key.startsWith(user + ':') &&
            (key.startsWith(user + ':local:') || (includeOrphans && cursor.value?.dirty))
          )
            items.push({ id: key.slice(user.length + 1), draft: cursor.value });
          cursor.continue();
        };
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
export function removeDraft(user: string, project: string): Promise<void> {
  const task = enqueue(async () => {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').delete(user + ':' + project);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  return task;
}

/** Local and persisted aliases of a creation share one editor lock. */
export function projectLockId(project: {
  id: string;
  local?: boolean;
  creationKey?: string;
}): string {
  const key = project.local ? project.id.slice(6) : project.creationKey;
  return key ? 'creation:' + key : project.id;
}
/** Move a draft atomically without replacing another unsynchronized edit. */
export function migrateDraft(
  user: string,
  local: string,
  project: string,
  draft: Draft,
): Promise<void> {
  const snapshot = structuredClone(draft);
  const task = enqueue(async () => {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite'),
          store = tx.objectStore('drafts');
        let conflict: Error | undefined;
        const request = store.get(user + ':' + project);
        request.onsuccess = () => {
          const previous = request.result as Draft | undefined;
          if (
            previous?.dirty &&
            JSON.stringify(previous.document) !== JSON.stringify(snapshot.document)
          ) {
            conflict = new Error(
              '服务器作品还有另一份未同步草稿，两份内容均已保留。请返回列表分别导出后处理。',
            );
            tx.abort();
            return;
          }
          store.put(snapshot, user + ':' + project);
          store.delete(user + ':' + local);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(conflict ?? tx.error);
      });
    } finally {
      db.close();
    }
  });
  return task;
}
