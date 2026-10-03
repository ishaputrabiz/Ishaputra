import { useState } from 'react';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRewards } from '@/hooks/useRewards';
import { adminAdjustRewards, type RewardEntry } from '@/services/rewardsService';
import type { RewardCurrency } from '@/lib/rewards';

const fmt = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "+120 pts", "−₹50". */
const signed = (value: number, unit: 'pts' | '₹', plus = false) => {
  const sign = value < 0 ? '−' : plus && value > 0 ? '+' : '';
  const n = Math.abs(value).toLocaleString('en-IN');
  return unit === '₹' ? `${sign}₹${n}` : `${sign}${n} pts`;
};

const TONE = {
  ok: 'text-gray-600',
  wait: 'text-amber-700',
  warn: 'font-medium text-red-700 dark:text-red-400',
  off: 'text-gray-500',
} as const;

/**
 * What an entry does to the balance right now. Only earned points can be
 * pending (until they unlock, or held while their order has a return open);
 * every other entry counts at once, and a void one counts for nothing.
 */
const entryStatus = (e: RewardEntry, now: number): { label: string; tone: keyof typeof TONE; hint?: string } => {
  if (e.status === 'void') {
    if (e.kind === 'spend' && e.voidReason === 'payment-not-completed') {
      return { label: 'Released (payment not completed)', tone: 'off' };
    }
    if (e.kind === 'refund' && e.voidReason === 'order-reopened') {
      return { label: 'Taken back (order reopened)', tone: 'off' };
    }
    return { label: e.voidReason ? `Void (${e.voidReason.replace(/-/g, ' ')})` : 'Void', tone: 'off' };
  }
  if (e.kind === 'spend' && e.hold) {
    return {
      label: 'Reserved (payment in progress)',
      tone: 'wait',
      hint: e.holdUntilMs
        ? `Can be released after ${fmt(e.holdUntilMs)} if Razorpay shows no payment.`
        : undefined,
    };
  }
  if (e.kind === 'spend' && e.late) {
    return {
      label: 'Late (paid after release)',
      tone: 'warn',
      hint: 'The payment completed after this reservation had been released, so it was deducted after all. The balance may be below zero.',
    };
  }
  if (e.kind === 'earn' && e.amount > 0) {
    if (e.held) return { label: 'Held (return open)', tone: 'wait' };
    if (e.unlockAtMs > now) return { label: `Pending until ${fmt(e.unlockAtMs)}`, tone: 'wait' };
  }
  return { label: e.amount < 0 ? 'Deducted' : 'Available', tone: 'ok' };
};

/** Admin: a customer's points/cashback, history, and manual adjustments. */
export const RewardsAdminPanel = ({ customerId }: { customerId: string }) => {
  const { entries, balances, reserved, loading } = useRewards(customerId);
  const [currency, setCurrency] = useState<RewardCurrency>('points');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const now = Date.now();
  // Earned points frozen by an open return: part of "pending", not of "available".
  const heldPoints = entries.reduce(
    (n, e) => n + (e.kind === 'earn' && e.status === 'active' && e.held && e.amount > 0 ? e.amount : 0),
    0,
  );

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

  const figure = (label: string, value: number, unit: 'pts' | '₹', detail?: string) => (
    <div
      className={`rounded-xl border p-4 ${
        value < 0 ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${value < 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-900'}`}>
        {signed(value, unit)}
      </p>
      {value < 0 && <p className="text-[11px] text-red-700 dark:text-red-400">Negative balance - review</p>}
      {detail && <p className="mt-0.5 text-[11px] text-amber-700">{detail}</p>}
    </div>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-highlight" />
        <h2 className="text-lg font-semibold text-gray-900">Rewards</h2>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {figure(
          'Points available',
          balances.points.available,
          'pts',
          reserved.points > 0 ? `Excludes ${signed(reserved.points, 'pts')} reserved for a payment in progress` : undefined,
        )}
        {figure(
          'Points pending',
          balances.points.pending,
          'pts',
          heldPoints > 0 ? `Includes ${signed(heldPoints, 'pts')} held while a return is open` : undefined,
        )}
        {figure(
          'Wallet cashback',
          balances.cashback.available,
          '₹',
          reserved.cashback > 0 ? `Excludes ${signed(reserved.cashback, '₹')} reserved for a payment in progress` : undefined,
        )}
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
          <table className="w-full min-w-[680px] text-sm">
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
              {entries.map((e) => {
                const status = entryStatus(e, now);
                const voided = e.status === 'void';
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{fmt(e.createdAtMs)}</td>
                    <td className="py-2 pr-3 capitalize">{e.kind}</td>
                    <td className={`py-2 pr-3 ${voided ? 'text-gray-500' : ''}`}>{e.note}</td>
                    <td
                      className={`py-2 pr-3 text-right font-medium whitespace-nowrap ${
                        voided
                          ? 'text-gray-500 line-through'
                          : e.amount < 0
                            ? 'text-gray-700'
                            : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {signed(e.amount, e.currency === 'cashback' ? '₹' : 'pts', true)}
                    </td>
                    <td className={`py-2 text-xs ${TONE[status.tone]}`} title={status.hint}>
                      {status.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
