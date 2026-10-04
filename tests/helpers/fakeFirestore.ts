/**
 * In-memory Firestore stand-in for server tests (Java isn't installed here, so
 * the emulator can't run): documents, subcollections, create/set/update with
 * Firestore's errors, and transactions that are retried when a document they
 * read changed before they commit, as Firestore's are. A commit is all or
 * nothing, and FieldValue.delete() removes a field.
 */
// Document data is untyped on purpose: tests read Timestamps and numbers back out of it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

class FakeSnap {
  id: string;
  ref: FakeDoc;
  exists: boolean;
  private value: Data | undefined;
  constructor(ref: FakeDoc, value: Data | undefined) {
    this.ref = ref;
    this.id = ref.id;
    this.value = value;
    this.exists = value !== undefined;
  }
  data() {
    return this.value ? { ...this.value } : undefined;
  }
}

class FakeDoc {
  db: FakeFirestore;
  path: string;
  constructor(db: FakeFirestore, path: string) {
    this.db = db;
    this.path = path;
  }
  get id() {
    return this.path.split('/').pop() as string;
  }
  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return new FakeSnap(this, this.db.read(this.path));
  }
  async create(data: Data) {
    this.db.applyCreate(this.path, data);
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    this.db.applySet(this.path, data, opts?.merge === true);
  }
  async update(data: Data) {
    this.db.applyUpdate(this.path, data);
  }
}

class FakeCollection {
  db: FakeFirestore;
  path: string;
  constructor(db: FakeFirestore, path: string) {
    this.db = db;
    this.path = path;
  }
  doc(id: string) {
    return new FakeDoc(this.db, `${this.path}/${id}`);
  }
  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.docs.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => new FakeSnap(new FakeDoc(this.db, p), this.db.read(p)));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

type Write = { kind: 'create' | 'set' | 'update'; path: string; data: Data; merge?: boolean };

/** FieldValue.delete() from the Admin SDK. */
const isDelete = (v: unknown) => (v as { methodName?: string } | null)?.methodName === 'FieldValue.delete';
const merged = (cur: Data, data: Data) => {
  const out = { ...cur, ...data };
  for (const [k, v] of Object.entries(data)) if (isDelete(v)) delete out[k];
  return out;
};

class FakeTx {
  db: FakeFirestore;
  reads = new Map<string, number>();
  writes: Write[] = [];
  constructor(db: FakeFirestore) {
    this.db = db;
  }
  async get(ref: FakeDoc) {
    if (this.writes.length) throw new Error('Firestore transactions require all reads before all writes');
    this.reads.set(ref.path, this.db.version(ref.path));
    await Promise.resolve(); // let a racing transaction interleave, like a network round trip
    return new FakeSnap(ref, this.db.read(ref.path));
  }
  create(ref: FakeDoc, data: Data) {
    this.writes.push({ kind: 'create', path: ref.path, data });
    return this;
  }
  set(ref: FakeDoc, data: Data, opts?: { merge?: boolean }) {
    this.writes.push({ kind: 'set', path: ref.path, data, merge: opts?.merge === true });
    return this;
  }
  update(ref: FakeDoc, data: Data) {
    this.writes.push({ kind: 'update', path: ref.path, data });
    return this;
  }
}

export class FakeFirestore {
  docs = new Map<string, Data>();
  versions = new Map<string, number>();
  /** Transactions retried because a document they read changed first. */
  retries = 0;

  collection(name: string) {
    return new FakeCollection(this, name);
  }
  doc(path: string) {
    return new FakeDoc(this, path);
  }
  async getAll(...refs: FakeDoc[]) {
    return Promise.all(refs.map((r) => r.get()));
  }
  read(path: string) {
    const d = this.docs.get(path);
    return d ? { ...d } : undefined;
  }
  version(path: string) {
    return this.versions.get(path) || 0;
  }
  private bump(path: string) {
    this.versions.set(path, this.version(path) + 1);
  }
  applyCreate(path: string, data: Data) {
    if (this.docs.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${path} already exists`), { code: 6 });
    this.docs.set(path, { ...data });
    this.bump(path);
  }
  applySet(path: string, data: Data, merge: boolean) {
    this.docs.set(path, merged(merge ? this.docs.get(path) || {} : {}, data));
    this.bump(path);
  }
  applyUpdate(path: string, data: Data) {
    const cur = this.docs.get(path);
    if (!cur) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    this.docs.set(path, merged(cur, data));
    this.bump(path);
  }
  /** Apply a transaction's writes all together, or none if one of them would fail. */
  private commit(writes: Write[]) {
    const exists = new Map<string, boolean>();
    const has = (p: string) => (exists.has(p) ? exists.get(p)! : this.docs.has(p));
    for (const w of writes) {
      if (w.kind === 'create' && has(w.path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${w.path} already exists`), { code: 6 });
      if (w.kind === 'update' && !has(w.path)) throw Object.assign(new Error(`NOT_FOUND: ${w.path}`), { code: 5 });
      exists.set(w.path, true);
    }
    for (const w of writes) {
      if (w.kind === 'create') this.applyCreate(w.path, w.data);
      else if (w.kind === 'set') this.applySet(w.path, w.data, w.merge === true);
      else this.applyUpdate(w.path, w.data);
    }
  }
  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const tx = new FakeTx(this);
      const out = await fn(tx);
      const stale = [...tx.reads].some(([path, v]) => this.version(path) !== v);
      if (stale) {
        this.retries++;
        continue;
      }
      this.commit(tx.writes);
      return out;
    }
    throw new Error('ABORTED: too much contention');
  }
}
