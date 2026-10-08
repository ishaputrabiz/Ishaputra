/**
 * Data + actions for the WhatsApp team inbox.
 *
 * Real mode: Firestore listeners (admin-only by rules) and /api/whatsapp-reply.
 * Demo mode (DEV only, ?demo=1): in-memory sample data, writes stay local.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { whatsappAdminApi } from '@/services/whatsappAdminApi';
import type { Snippet, TeamMember, TemplateMeta, Thread, ThreadMessage, ThreadStatus, TimeLike } from './inboxModel';
import { renderTemplate } from './inboxModel';
import { fileToBase64 } from './waMedia';

export interface Actor {
  uid: string | null;
  name: string;
  email: string | null;
}

type DemoData = Awaited<ReturnType<typeof loadDemo>>;
const loadDemo = async (actor: Actor) => {
  const mod = await import('./demoFixtures');
  return mod.buildDemoData(actor.uid || 'me', actor.name);
};

export const isDemoMode = () =>
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

/** Conversations per page; "Load more" adds another page to the live query. */
const THREAD_PAGE = 300;

export function useInboxData(actor: Actor, activeId: string | null) {
  const demo = isDemoMode();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threadLimit, setThreadLimit] = useState(THREAD_PAGE);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, ThreadMessage[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const demoRef = useRef<DemoData | null>(null);

  // ---------------------------------------------------------------- demo
  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    loadDemo(actor).then((d) => {
      if (cancelled) return;
      demoRef.current = d;
      setThreads(d.threads);
      setMessagesByThread(d.messages);
      setTemplates(d.templates);
      setTeam(d.team);
      setSnippets(d.snippets);
      setLoadingThreads(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  // ------------------------------------------------------------- threads
  useEffect(() => {
    if (demo) return;
    const q = query(collection(db, 'whatsappThreads'), orderBy('updatedAt', 'desc'), limit(threadLimit));
    return onSnapshot(
      q,
      (snap) => {
        setThreads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Thread, 'id'>) })));
        setLoadingThreads(false);
        setLoadingMoreThreads(false);
        setThreadsError(null);
      },
      (err) => {
        console.warn('[whatsapp] threads subscribe failed', err);
        setThreadsError('Could not load conversations. Check your connection, then reload.');
        setLoadingThreads(false);
        setLoadingMoreThreads(false);
      },
    );
  }, [demo, threadLimit]);

  // A full page means there may be older conversations to fetch.
  const hasMoreThreads = !demo && threads.length >= threadLimit;
  const loadMoreThreads = useCallback(() => {
    setLoadingMoreThreads(true);
    setThreadLimit((n) => n + THREAD_PAGE);
  }, []);

  // ------------------------------------------------------------ messages
  useEffect(() => {
    if (demo || !activeId) return;
    setLoadingMessages(true);
    const q = query(collection(db, 'whatsappThreads', activeId, 'messages'), orderBy('createdAt', 'asc'), limit(500));
    return onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        setMessagesByThread((prev) => ({
          ...prev,
          [activeId]: snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as Omit<ThreadMessage, 'id'>) })),
        }));
        setLoadingMessages(false);
      },
      () => setLoadingMessages(false),
    );
  }, [demo, activeId]);

  // ----------------------------------------------- templates, team, snippets
  useEffect(() => {
    if (demo) return;
    const unsubTpl = onSnapshot(query(collection(db, 'whatsappTemplates'), orderBy('name')), (snap) => {
      setTemplates(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: (x.name as string) || d.id,
            language: (x.language as string) || 'en_US',
            category: (x.category as string) || 'utility',
            paramLabels: (x.paramLabels as string[]) || [],
            status: (x.status as string) ?? null,
            bodyText: (x.bodyText as string) ?? null,
          };
        }),
      );
    });
    const unsubSnip = onSnapshot(
      query(collection(db, 'whatsappSnippets'), orderBy('title')),
      (snap) => setSnippets(snap.docs.map((d) => ({ id: d.id, title: String(d.data().title || ''), text: String(d.data().text || '') }))),
      () => setSnippets([]),
    );
    getDocs(query(collection(db, 'users'), where('role', '==', 'admin'), limit(50)))
      .then((snap) =>
        setTeam(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              uid: d.id,
              name: String(x.fullName || x.name || x.displayName || x.username || x.email || 'Admin'),
              email: (x.email as string) || null,
            };
          }),
        ),
      )
      .catch(() => setTeam([]));
    return () => {
      unsubTpl();
      unsubSnip();
    };
  }, [demo]);

  // ------------------------------------------------------------- actions
  const patchThreadLocal = useCallback((id: string, patch: Partial<Thread>) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const markRead = useCallback(
    async (t: Thread) => {
      if (!t.unreadCount) return;
      if (demo) return patchThreadLocal(t.id, { unreadCount: 0 });
      await updateDoc(doc(db, 'whatsappThreads', t.id), { unreadCount: 0 }).catch(() => undefined);
      // Blue ticks for the customer; best effort, the server ignores failures.
      if (t.lastInboundMessageId) whatsappAdminApi.markRead(t.phone, t.lastInboundMessageId).catch(() => undefined);
    },
    [demo, patchThreadLocal],
  );

  const assign = useCallback(
    async (threadId: string, member: TeamMember | null) => {
      const assignedTo = member ? { uid: member.uid, name: member.name } : null;
      if (demo) return patchThreadLocal(threadId, { assignedTo });
      await updateDoc(doc(db, 'whatsappThreads', threadId), { assignedTo, assignedAt: serverTimestamp(), assignedBy: actor.uid });
    },
    [demo, patchThreadLocal, actor.uid],
  );

  const setStatus = useCallback(
    async (threadId: string, status: ThreadStatus) => {
      if (demo) return patchThreadLocal(threadId, { status });
      await updateDoc(doc(db, 'whatsappThreads', threadId), {
        status,
        ...(status === 'resolved' ? { resolvedAt: serverTimestamp(), resolvedBy: actor.uid, unreadCount: 0 } : { resolvedAt: null }),
      });
    },
    [demo, patchThreadLocal, actor.uid],
  );

  const pushLocalMessage = useCallback((threadId: string, m: ThreadMessage) => {
    setMessagesByThread((prev) => ({ ...prev, [threadId]: [...(prev[threadId] || []), m] }));
  }, []);

  const demoNow = (): TimeLike => {
    const ms = Date.now();
    return { toMillis: () => ms, toDate: () => new Date(ms) } as TimeLike;
  };

  const addNote = useCallback(
    async (threadId: string, text: string) => {
      const note = { direction: 'note' as const, type: 'note', text, actorUid: actor.uid, actorEmail: actor.email, actorName: actor.name };
      if (demo) return pushLocalMessage(threadId, { id: `note-${Date.now()}`, ...note, createdAt: demoNow() });
      await addDoc(collection(db, 'whatsappThreads', threadId, 'messages'), { ...note, createdAt: serverTimestamp() });
    },
    [demo, actor, pushLocalMessage],
  );

  const send = useCallback(
    async (t: Thread, payload: { text: string } | { template: TemplateMeta; params: string[] }) => {
      if (demo) {
        const isTpl = 'template' in payload;
        const text = isTpl ? renderTemplate(payload.template.bodyText || '', payload.params) : payload.text;
        pushLocalMessage(t.id, {
          id: `demo-out-${Date.now()}`,
          direction: 'outbound',
          type: isTpl ? 'template' : 'text',
          text,
          template: isTpl ? { name: payload.template.name, params: payload.params } : undefined,
          status: 'delivered',
          actorName: actor.name,
          createdAt: demoNow(),
        });
        patchThreadLocal(t.id, { lastMessage: text, lastDirection: 'outbound', lastStatus: 'delivered', unreadCount: 0 });
        return;
      }
      if ('template' in payload) {
        await whatsappAdminApi.send({
          phone: t.phone,
          template: { name: payload.template.name, language: payload.template.language, params: payload.params },
        });
      } else {
        await whatsappAdminApi.send({ phone: t.phone, text: payload.text });
      }
    },
    [demo, actor.name, pushLocalMessage, patchThreadLocal],
  );

  /** Send a prepared photo or document (see waMedia.prepareAttachment). */
  const sendMedia = useCallback(
    async (t: Thread, file: File, kind: 'image' | 'document', caption: string) => {
      if (demo) {
        pushLocalMessage(t.id, {
          id: `demo-out-${Date.now()}`,
          direction: 'outbound',
          type: kind,
          text: caption || (kind === 'document' ? file.name : ''),
          media: { id: '', mimeType: file.type, caption: caption || null, filename: kind === 'document' ? file.name : null },
          status: 'delivered',
          actorName: actor.name,
          createdAt: demoNow(),
        });
        patchThreadLocal(t.id, { lastMessage: kind === 'image' ? 'Photo' : 'Document', lastDirection: 'outbound', lastStatus: 'delivered', unreadCount: 0 });
        return;
      }
      await whatsappAdminApi.sendMedia({
        phone: t.phone,
        media: { mime: file.type, filename: file.name, data: await fileToBase64(file) },
        caption: caption || undefined,
      });
    },
    [demo, actor.name, pushLocalMessage, patchThreadLocal],
  );

  const addSnippet = useCallback(
    async (title: string, text: string) => {
      if (demo) return setSnippets((s) => [...s, { id: `s-${Date.now()}`, title, text }].sort((a, b) => a.title.localeCompare(b.title)));
      await addDoc(collection(db, 'whatsappSnippets'), { title, text, createdBy: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    },
    [demo, actor.uid],
  );

  const deleteSnippet = useCallback(
    async (id: string) => {
      if (demo) return setSnippets((s) => s.filter((x) => x.id !== id));
      await deleteDoc(doc(db, 'whatsappSnippets', id));
    },
    [demo],
  );

  return {
    demo,
    threads,
    loadingThreads,
    threadsError,
    hasMoreThreads,
    loadingMoreThreads,
    loadMoreThreads,
    messages: activeId ? messagesByThread[activeId] || [] : [],
    loadingMessages: !demo && loadingMessages && !!activeId && !messagesByThread[activeId],
    templates,
    team,
    snippets,
    actions: { markRead, assign, setStatus, addNote, send, sendMedia, addSnippet, deleteSnippet },
  };
}
