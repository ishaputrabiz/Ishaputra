import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Coins, Save, Loader2, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { describeError } from '@/lib/errorMessage';

const AdminSilverRate = () => {
  const [silverPricePerGram, setSilverPricePerGram] = useState<number>(95);
  const [currentSaved, setCurrentSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Live-subscribe to Firestore so the admin sees what customers currently see
  useEffect(() => {
    const ref = doc(db, 'siteSettings', 'silverRate');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        if (typeof d.manualPricePerGramInr === 'number' && d.manualPricePerGramInr > 0) {
          setSilverPricePerGram(d.manualPricePerGramInr);
          setCurrentSaved(d.manualPricePerGramInr);
        }
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSave = async () => {
    if (!silverPricePerGram || silverPricePerGram <= 0) {
      toast.error('Enter a valid price per gram');
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'siteSettings', 'silverRate'),
        {
          manualOverride: true,
          manualPricePerGramInr: silverPricePerGram,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast.success('Silver rate updated — customers see it instantly ✓');
    } catch (err) {
      console.error(err);
      toast.error('Could not save the silver rate', { description: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  const changed = currentSaved !== null && silverPricePerGram !== currentSaved;

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400 font-medium mb-2 flex items-center gap-2">
          <Coins className="w-3.5 h-3.5" /> Live Rate Control
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Silver Rate
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Set the silver price per gram displayed to all customers. Updates are reflected <strong>instantly</strong> site-wide.
        </p>
      </div>

      {/* Current live rate badge */}
      {currentSaved !== null && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-6"
        >
          <TrendingUp className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Customers currently see: <span className="font-bold">₹{currentSaved.toFixed(2)}/g</span>
            {' · '}10g = ₹{(currentSaved * 10).toFixed(2)}
            {' · '}1kg = ₹{(currentSaved * 1000).toLocaleString('en-IN')}
          </p>
        </motion.div>
      )}

      {/* Input card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-6 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 grid place-items-center text-amber-700 dark:text-amber-400">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Price per gram (₹)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Updates the customer widget in real time</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Price per gram (₹)</Label>
            {loading ? (
              <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading current rate…
              </div>
            ) : (
              <Input
                type="number"
                min={1}
                step={0.01}
                value={silverPricePerGram}
                onChange={(e) => setSilverPricePerGram(Number(e.target.value))}
                placeholder="e.g. 95"
                className="mt-1.5 bg-white dark:bg-gray-950 max-w-[200px] text-lg font-semibold"
              />
            )}
          </div>

          {/* Auto-calculated values */}
          {silverPricePerGram > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#FBF8F3] dark:bg-gray-800 rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">10 grams</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  ₹{(silverPricePerGram * 10).toFixed(2)}
                </p>
              </div>
              <div className="bg-[#FBF8F3] dark:bg-gray-800 rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">1 kilogram</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  ₹{(silverPricePerGram * 1000).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className={`w-full mt-2 ${changed ? 'bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-400' : 'bg-amber-600 hover:bg-amber-700'} text-white`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> {changed ? 'Save new rate' : 'Save rate'}</>
            )}
          </Button>
          {changed && (
            <p className="text-xs text-center text-amber-600 dark:text-amber-400">
              ⚠ Unsaved — current customer rate is ₹{currentSaved?.toFixed(2)}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminSilverRate;
