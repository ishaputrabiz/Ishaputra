// Minimal in-memory stand-in for firebase-admin used by api/broadcast.ts.
export const store = new Map(); // path -> data
const listeners = { updates: [] };

const serverTimestamp = () => ({ __ts: true });
const increment = (n) => ({ __inc: n });

function docRef(path) {
  return {
    id: path.split('/').pop(),
    path,
    collection: (name) => colRef(`${path}/${name}`),
    async get() {
      return snap(path);
    },
    async set(data, opts) {
      const prev = store.get(path);
      store.set(path, opts?.merge && prev ? { ...prev, ...data } : { ...data });
    },
    async update(data) {
      if (!store.has(path)) {
        const e = new Error('NOT_FOUND');
        e.code = 5;
        throw e;
      }
      listeners.updates.push(path);
      store.set(path, { ...store.get(path), ...data });
    },
  };
}
function snap(path) {
  const data = store.get(path);
  return { id: path.split('/').pop(), exists: data !== undefined, data: () => data };
}
function directChildren(colPath) {
  const depth = colPath.split('/').length + 1;
  return [...store.keys()].filter((k) => k.startsWith(colPath + '/') && k.split('/').length === depth);
}
function colRef(path, filters = [], lim = Infinity) {
  return {
    doc: (id) => docRef(`${path}/${id ?? Math.random().toString(36).slice(2, 10)}`),
    where: (f, op, v) => colRef(path, [...filters, [f, op, v]], lim),
    limit: (n) => colRef(path, filters, n),
    async get() {
      const docs = directChildren(path)
        .map(snap)
        .filter((s) => filters.every(([f, , v]) => s.data()?.[f] === v))
        .slice(0, lim);
      return { docs, forEach: (fn) => docs.forEach(fn), size: docs.length };
    },
  };
}
const db = {
  collection: (name) => colRef(name),
  async getAll(...refs) {
    return refs.map((r) => snap(r.path));
  },
  batch() {
    const ops = [];
    return { set: (ref, d, o) => ops.push(() => ref.set(d, o)), async commit() { for (const op of ops) await op(); } };
  },
};

const firestore = Object.assign(() => db, { FieldValue: { serverTimestamp, increment } });
const adminStub = {
  apps: [1],
  firestore,
  auth: () => ({ verifyIdToken: async (t) => ({ uid: t === 'admin-token' ? 'admin1' : 'user1' }) }),
  messaging: () => ({ sendEachForMulticast: async ({ tokens }) => ({ successCount: tokens.length, failureCount: 0, responses: tokens.map(() => ({ success: true })) }) }),
  credential: { cert: () => ({}) },
  initializeApp() {},
};
export default adminStub;
export { listeners };
