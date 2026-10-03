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
      toast.success('Silver rate saved. Customers see it now.');
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
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium mb-2 flex items-center gap-2">
          <Coins className="w-3.5 h-3.5" /> Live Rate Control
        </p>
        <h1 className="text-2xl font-semibold text-foreground">
          Silver Rate
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set the silver price per gram displayed to all customers. Updates are reflected <strong>instantly</strong> site-wide.
        </p>
      </div>

      {/* Current live rate badge */}
      {currentSaved !== null && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-card px-4 py-3 mb-6"
        >
          <TrendingUp className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-primary">
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
        className="bg-card border border-border rounded-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 grid place-items-center text-primary">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Price per gram (₹)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Updates the customer widget in real time</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Price per gram (₹)</Label>
            {loading ? (
              <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
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
                className="mt-1.5 bg-card max-w-[200px] text-lg font-semibold"
              />
            )}
          </div>

          {/* Auto-calculated values */}
          {silverPricePerGram > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/60 rounded-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">10 grams</p>
                <p className="text-lg font-bold text-foreground">
                  ₹{(silverPricePerGram * 10).toFixed(2)}
                </p>
              </div>
              <div className="bg-muted/60 rounded-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">1 kilogram</p>
                <p className="text-lg font-bold text-foreground">
                  ₹{(silverPricePerGram * 1000).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className={`w-full mt-2 ${changed ? 'bg-primary hover:bg-primary/90 ring-2 ring-ring/70' : 'bg-primary hover:bg-primary/90'} text-primary-foreground`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> {changed ? 'Save new rate' : 'Save rate'}</>
            )}
          </Button>
          {changed && (
            <p className="text-xs text-center text-primary">
              Unsaved. The current customer rate is ₹{currentSaved?.toFixed(2)}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminSilverRate;
