import { useState } from 'react';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRewards } from '@/hooks/useRewards';
import { adminAdjustRewards } from '@/services/rewardsService';
import type { RewardCurrency } from '@/lib/rewards';

const fmt = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Admin: a customer's points/cashback, history, and manual adjustments. */
export const RewardsAdminPanel = ({ customerId }: { customerId: string }) => {
  const { entries, balances, loading } = useRewards(customerId);
  const [currency, setCurrency] = useState<RewardCurrency>('points');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const now = Date.now();

  const submit = async () => {
    setSaving(true);
    try {
      await adminAdjustRewards(customerId, { currency, amount: Number(amount), note });
      toast.success('Adjustment saved');
      setAmount('');
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the adjustment');
    } finally {
      setSaving(false);
    }
  };

  const figure = (label: string, value: number, unit: 'pts' | '₹') => (
    <div className={`rounded-xl border p-4 ${value < 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {unit === '₹' ? `₹${value.toLocaleString('en-IN')}` : `${value.toLocaleString('en-IN')} pts`}
      </p>
      {value < 0 && <p className="text-[11px] text-red-600">Negative balance - review</p>}
    </div>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-highlight" />
        <h2 className="text-lg font-semibold text-gray-900">Rewards</h2>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {figure('Points available', balances.points.available, 'pts')}
        {figure('Points pending', balances.points.pending, 'pts')}
        {figure('Wallet cashback', balances.cashback.available, '₹')}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[150px_150px_1fr_auto] sm:items-end">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Type</p>
          <Select value={currency} onValueChange={(v) => setCurrency(v as RewardCurrency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="cashback">Cashback (₹)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Amount (− to debit)</p>
          <Input type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Reason (shown to the customer)</p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Goodwill for a late delivery" />
        </div>
        <Button onClick={submit} disabled={saving || !amount || !note.trim()}>
          {saving ? 'Saving…' : 'Apply'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No reward activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{fmt(e.createdAtMs)}</td>
                  <td className="py-2 pr-3 capitalize">{e.kind}</td>
                  <td className="py-2 pr-3">{e.note}</td>
                  <td className={`py-2 pr-3 text-right font-medium ${e.amount < 0 ? 'text-gray-700' : 'text-emerald-700'}`}>
                    {e.amount > 0 ? '+' : ''}
                    {e.currency === 'cashback' ? `₹${e.amount}` : `${e.amount} pts`}
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {e.status === 'void' ? 'Void' : e.unlockAtMs > now ? `Pending until ${fmt(e.unlockAtMs)}` : 'Available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
