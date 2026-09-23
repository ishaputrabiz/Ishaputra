import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Download, Users, Loader2, Search, Trash2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from newsletter?`)) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, 'newsletterSubscriptions', id));
      toast.success('Removed from newsletter');
    } catch {
      toast.error('Failed to remove');
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
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="w-6 h-6 text-amber-600" />
            Newsletter Subscribers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emails collected from the footer newsletter form
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          variant="outline"
          className="flex items-center gap-2"
          disabled={filtered.length === 0}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Subscribers</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-400 mt-1">{subs.length}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Showing</p>
          <p className="text-3xl font-bold text-blue-700 dark:text-blue-400 mt-1">{filtered.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search emails…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'No matching emails' : 'No subscribers yet'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subscribed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub, idx) => (
                <motion.tr
                  key={sub.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="border-t border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">{sub.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub.subscribedAt?.toDate
                      ? sub.subscribedAt.toDate().toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(sub.id, sub.email)}
                      disabled={deleting === sub.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      {deleting === sub.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminNewsletterSubscriptions;
