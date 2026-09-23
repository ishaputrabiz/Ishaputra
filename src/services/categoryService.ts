import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

// ── Types ──────────────────────────────────────────────

export interface SubSubCategory {
  id?: string;
  name: string;
  slug: string;
}

export interface SubCategory {
  id?: string;
  name: string;
  slug: string;
  children?: SubSubCategory[];
}

export interface Category {
  id?: string;
  name: string;
  slug: string;
  subcategories: SubCategory[];
  createdAt?: any;
  updatedAt?: any;
}

// ── Default categories (seeded on first load if collection empty) ──

export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Energy & Vitality',
    slug: 'energy-vitality',
    subcategories: [
      { name: 'Capsules', slug: 'capsules', children: [] },
      { name: 'Powders', slug: 'powders', children: [] },
      { name: 'Shilajit', slug: 'shilajit', children: [] },
    ],
  },
  {
    name: 'Hair Care',
    slug: 'hair-care',
    subcategories: [
      { name: 'Hair Oils', slug: 'hair-oils', children: [] },
      { name: 'Shampoos', slug: 'shampoos', children: [] },
      { name: 'Hair Serums', slug: 'hair-serums', children: [] },
    ],
  },
  {
    name: 'Skin Care',
    slug: 'skin-care',
    subcategories: [
      { name: 'Face Wash', slug: 'face-wash', children: [] },
      { name: 'Face Serums', slug: 'face-serums', children: [] },
      { name: 'Moisturisers', slug: 'moisturisers', children: [] },
    ],
  },
  {
    name: 'Personal Care',
    slug: 'personal-care',
    subcategories: [
      { name: 'Body Wash', slug: 'body-wash', children: [] },
      { name: 'Deodorants', slug: 'deodorants', children: [] },
      { name: 'Beard Care', slug: 'beard-care', children: [] },
    ],
  },
  {
    name: 'Ayurvedic Essentials',
    slug: 'ayurvedic-essentials',
    subcategories: [
      { name: 'Churnas', slug: 'churnas', children: [] },
      { name: 'Herbal Teas', slug: 'herbal-teas', children: [] },
      { name: 'Immunity', slug: 'immunity', children: [] },
    ],
  },
];

const CATEGORIES_COLLECTION = 'categories';

/** Firestore hands timestamps back in several shapes depending on the read. */
type TimestampLike = { seconds?: number; toMillis?: () => number } | string | number | null | undefined;

const timeOf = (v: TimestampLike): number => {
  if (!v) return Number.MAX_SAFE_INTEGER; // no timestamp -> sorts last
  if (typeof v === 'object') {
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (typeof v.toMillis === 'function') return v.toMillis();
    return Number.MAX_SAFE_INTEGER;
  }
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

/**
 * Fold duplicate category documents that share a slug into a single entry.
 *
 * The collection is seeded from DEFAULT_CATEGORIES whenever it reads back as
 * empty, so one transient empty read seeded a second full set. That is why the
 * admin product form listed "Jewellery" twice and why Radix's <Select> printed
 * "JewelleryJewellery" in the trigger - two items shared one value, so both
 * item labels rendered. Prevention lives in `seedDefaultCategories`
 * (deterministic document ids); this heals the data that already exists.
 *
 * The surviving entry keeps the oldest document's id - subcategories added from
 * the admin form write to that id - and takes the union of every duplicate's
 * subcategories and their children, so no taxonomy is lost.
 */
export const dedupeCategories = (cats: Category[]): Category[] => {
  const bySlug = new Map<string, Category>();
  const ordered = [...cats].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));

  for (const cat of ordered) {
    const slug = cat.slug || toSlug(cat.name || '');
    if (!slug) continue;

    const existing = bySlug.get(slug);
    if (!existing) {
      bySlug.set(slug, {
        ...cat,
        slug,
        subcategories: (cat.subcategories || []).map((s) => ({
          ...s,
          slug: s.slug || toSlug(s.name || ''),
          children: [...(s.children || [])],
        })),
      });
      continue;
    }

    for (const sub of cat.subcategories || []) {
      const subSlug = sub.slug || toSlug(sub.name || '');
      const match = existing.subcategories.find((s) => s.slug === subSlug);
      if (!match) {
        existing.subcategories.push({ ...sub, slug: subSlug, children: [...(sub.children || [])] });
        continue;
      }
      const children = [...(match.children || [])];
      for (const child of sub.children || []) {
        const childSlug = child.slug || toSlug(child.name || '');
        if (!children.some((c) => (c.slug || toSlug(c.name || '')) === childSlug)) {
          children.push({ ...child, slug: childSlug });
        }
      }
      match.children = children;
    }
  }

  return [...bySlug.values()];
};

// ── Helpers ────────────────────────────────────────────

export const toSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ── CRUD ───────────────────────────────────────────────

/** Dedupes concurrent callers - two components mounting at once seeded twice. */
let seedInFlight: Promise<void> | null = null;

/**
 * Create any missing default category, keyed by slug.
 *
 * Writing to `categories/<slug>` instead of `addDoc` makes seeding idempotent:
 * running it twice creates nothing and overwrites nothing, where the old
 * "collection is empty -> add everything" version produced a whole duplicate
 * set every time the collection read back empty. Existing documents are never
 * touched, so subcategories the admin added by hand survive.
 *
 * Only admins may write to `categories`, so this is a silent no-op for shoppers.
 */
export const seedDefaultCategories = async (): Promise<void> => {
  if (seedInFlight) return seedInFlight;

  seedInFlight = (async () => {
    const snapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
    const present = new Set(
      snapshot.docs.map((d) => {
        const data = d.data() as Category;
        return data.slug || toSlug(data.name || '');
      }),
    );

    const missing = DEFAULT_CATEGORIES.filter((c) => !present.has(c.slug));
    for (const cat of missing) {
      await setDoc(doc(db, CATEGORIES_COLLECTION, cat.slug), {
        ...cat,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  })()
    .catch((error) => {
      // Signed-out visitors cannot write here; expected, not a failure.
      console.debug('[categoryService] seed skipped:', (error as Error)?.message);
    })
    .finally(() => {
      seedInFlight = null;
    });

  return seedInFlight;
};

/**
 * Read every category document.
 *
 * Deliberately not `orderBy('createdAt')`: an ordered Firestore query silently
 * drops documents that lack the field, so a single category saved without a
 * timestamp would disappear from the whole storefront. Sorting client-side
 * after deduping keeps every document visible.
 */
export const getCategories = async (): Promise<Category[]> => {
  const snapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
  return dedupeCategories(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category)));
};

export const subscribeToCategories = (callback: (cats: Category[]) => void) => {
  return onSnapshot(
    collection(db, CATEGORIES_COLLECTION),
    (snapshot) => {
      callback(dedupeCategories(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category))));
    },
    (error) => {
      console.error('[categoryService] Subscription error:', error);
      callback([]); // resolve with empty so loading stops
    },
  );
};

/** Runs at most once per session - healing is idempotent but costs writes. */
let healInFlight: Promise<number> | null = null;

/**
 * Permanently merge duplicate category documents in Firestore.
 *
 * `dedupeCategories` hides duplicates at read time; this removes them at the
 * source so the admin form, storefront filters and every future consumer see
 * one document per slug. The oldest document per slug survives and receives the
 * merged subcategory tree; the rest are deleted.
 *
 * Admin-only (Firestore rules). Returns the number of documents removed.
 */
export const healDuplicateCategories = async (): Promise<number> => {
  if (healInFlight) return healInFlight;

  healInFlight = (async () => {
    const snapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
    const raw = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category));

    const merged = dedupeCategories(raw);
    const survivors = new Set(merged.map((c) => c.id));
    const extras = raw.filter((c) => !survivors.has(c.id));
    if (extras.length === 0) return 0;

    for (const canonical of merged) {
      if (!canonical.id) continue;
      const before = raw.find((c) => c.id === canonical.id);
      const changed =
        JSON.stringify(before?.subcategories || []) !== JSON.stringify(canonical.subcategories);
      if (changed) {
        await updateDoc(doc(db, CATEGORIES_COLLECTION, canonical.id), {
          subcategories: canonical.subcategories,
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const extra of extras) {
      if (extra.id) await deleteDoc(doc(db, CATEGORIES_COLLECTION, extra.id));
    }

    console.info(`[categoryService] merged ${extras.length} duplicate category document(s)`);
    return extras.length;
  })()
    .catch((error) => {
      console.debug('[categoryService] duplicate merge skipped:', (error as Error)?.message);
      return 0;
    })
    .finally(() => {
      healInFlight = null;
    });

  return healInFlight;
};

export const addCategory = async (name: string): Promise<string> => {
  const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
    name,
    slug: toSlug(name),
    subcategories: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateCategory = async (categoryId: string, data: Partial<Category>): Promise<void> => {
  await updateDoc(doc(db, CATEGORIES_COLLECTION, categoryId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteCategory = async (categoryId: string): Promise<void> => {
  await deleteDoc(doc(db, CATEGORIES_COLLECTION, categoryId));
};

// ── Subcategory helpers ────────────────────────────────

export const addSubcategory = async (
  categoryId: string,
  currentSubs: SubCategory[],
  name: string
): Promise<void> => {
  const newSub: SubCategory = { name, slug: toSlug(name), children: [] };
  await updateDoc(doc(db, CATEGORIES_COLLECTION, categoryId), {
    subcategories: [...currentSubs, newSub],
    updatedAt: serverTimestamp(),
  });
};

export const removeSubcategory = async (
  categoryId: string,
  currentSubs: SubCategory[],
  subSlug: string
): Promise<void> => {
  await updateDoc(doc(db, CATEGORIES_COLLECTION, categoryId), {
    subcategories: currentSubs.filter((s) => s.slug !== subSlug),
    updatedAt: serverTimestamp(),
  });
};

// ── Sub-sub-category helpers ───────────────────────────

export const addSubSubcategory = async (
  categoryId: string,
  currentSubs: SubCategory[],
  subSlug: string,
  name: string
): Promise<void> => {
  const updated = currentSubs.map((s) => {
    if (s.slug === subSlug) {
      return { ...s, children: [...(s.children || []), { name, slug: toSlug(name) }] };
    }
    return s;
  });
  await updateDoc(doc(db, CATEGORIES_COLLECTION, categoryId), {
    subcategories: updated,
    updatedAt: serverTimestamp(),
  });
};

export const removeSubSubcategory = async (
  categoryId: string,
  currentSubs: SubCategory[],
  subSlug: string,
  childSlug: string
): Promise<void> => {
  const updated = currentSubs.map((s) => {
    if (s.slug === subSlug) {
      return { ...s, children: (s.children || []).filter((c) => c.slug !== childSlug) };
    }
    return s;
  });
  await updateDoc(doc(db, CATEGORIES_COLLECTION, categoryId), {
    subcategories: updated,
    updatedAt: serverTimestamp(),
  });
};
