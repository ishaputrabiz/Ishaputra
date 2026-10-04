import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Users, Search, Trash2, Mail, ListFilter } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/skeletons';
import { staggerDelay } from '@/lib/motion';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';
import {
  listenNewsletterSubscriptions,
  type NewsletterSubscription,
} from '@/services/newsletterService';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AdminNewsletterSubscriptions = () => {
  const [subs, setSubs] = useState<NewsletterSubscription[]>([]);
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<NewsletterSubscription | null>(null);

  useEffect(() => {
    const unsub = listenNewsletterSubscriptions((data) => {
      setSubs(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = subs.filter((s) =>
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string, _email?: string) => {
    setDeleting(id);
    try {
      await deleteDoc(doc(db, 'newsletterSubscriptions', id));
      toast.success('Removed from newsletter');
    } catch {
      toast.error('Could not remove the email');
    } finally {
      setDeleting(null);
    }
  };

  const handleExportCSV = () => {
    const rows = ['Email,Subscribed At'];
    filtered.forEach((s) => {
      const date = s.subscribedAt?.toDate
        ? s.subscribedAt.toDate().toLocaleDateString('en-IN')
        : '';
      rows.push(`${s.email},${date}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newsletter-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Newsletter subscribers"
        description="Emails collected from the footer newsletter form."
        actions={
          <Button onClick={handleExportCSV} variant="outline" size="sm" disabled={filtered.length === 0}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      {/* Stats */}
      <ul className="mb-6 grid grid-cols-2 gap-3 lg:gap-4">
        <li><StatCard label="Total subscribers" value={subs.length} icon={Mail} /></li>
        <li><StatCard label="Showing" value={filtered.length} icon={ListFilter} /></li>
      </ul>

      {/* Search */}
      <div className="relative mb-4">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search emails"
          placeholder="Search emails"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <TableSkeleton rows={6} cols={3} label="Loading subscribers" />
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-12">
          <EmptyState
            icon={search ? Search : Users}
            title={search ? 'No matching emails' : 'No subscribers yet'}
            description={search ? 'Try a different search.' : 'Emails from the footer form appear here.'}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"><span className="sr-only">Number</span>#</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Subscribed</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub, idx) => (
                <motion.tr
                  key={sub.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: staggerDelay(idx) }}
                  className="border-t border-border transition-colors duration-hover hover:bg-muted/60"
                >
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="break-all px-4 py-3 font-medium text-foreground">{sub.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {sub.subscribedAt?.toDate ? formatDate(sub.subscribedAt.toDate()) : 'Unknown'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <IconButton
                      label={`Remove ${sub.email}`}
                      tooltip="Remove"
                      size="sm"
                      onClick={(e) => { confirmReturnRef.current = e.currentTarget; setToRemove(sub); }}
                      disabled={deleting === sub.id}
                      className="text-muted-foreground hover:text-status-danger-fg"
                    >
                      {deleting === sub.id ? <Spinner /> : <Trash2 />}
                    </IconButton>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={`Remove ${toRemove?.email ?? 'this email'}?`}
        description="They stop getting the newsletter. They can subscribe again from the footer."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => (toRemove ? handleDelete(toRemove.id, toRemove.email) : undefined)}
      />
    </div>
  );
};

export default AdminNewsletterSubscriptions;
