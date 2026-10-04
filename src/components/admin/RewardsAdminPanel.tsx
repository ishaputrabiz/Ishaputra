import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/skeletons';
import { formatDateTime } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRewards } from '@/hooks/useRewards';
import { adminAdjustRewards, type RewardEntry } from '@/services/rewardsService';
import type { RewardCurrency } from '@/lib/rewards';

const fmt = (ms: number) => formatDateTime(ms);

/** "+120 pts", "−₹50". */
const signed = (value: number, unit: 'pts' | '₹', plus = false) => {
  const sign = value < 0 ? '−' : plus && value > 0 ? '+' : '';
  const n = Math.abs(value).toLocaleString('en-IN');
  return unit === '₹' ? `${sign}₹${n}` : `${sign}${n} pts`;
};

const TONE = {
  ok: 'text-foreground/80',
  wait: 'text-status-warning-fg',
  warn: 'font-medium text-status-danger-fg',
  off: 'text-muted-foreground',
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
  const uid = useId();
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
      className={`rounded-card border p-4 ${
        value < 0 ? 'border-status-danger-line bg-status-danger-bg' : 'border-border bg-muted/50'
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${value < 0 ? 'text-status-danger-fg' : 'text-foreground'}`}>
        {signed(value, unit)}
      </p>
      {value < 0 && <p className="text-xs text-status-danger-fg">Negative balance. Review it.</p>}
      {detail && <p className="mt-0.5 text-xs text-status-warning-fg">{detail}</p>}
    </div>
  );

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Coins aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Rewards</h2>
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
          <Label htmlFor={`${uid}-type`} className="mb-1.5 block text-xs font-medium text-foreground/80">Type</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as RewardCurrency)}>
            <SelectTrigger id={`${uid}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="cashback">Cashback (₹)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-amount`} className="mb-1.5 block text-xs font-medium text-foreground/80">Amount (minus to debit)</Label>
          <Input id={`${uid}-amount`} type="number" step={1} className="tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" />
        </div>
        <div>
          <Label htmlFor={`${uid}-note`} className="mb-1.5 block text-xs font-medium text-foreground/80">Reason (shown to the customer)</Label>
          <Input id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Goodwill for a late delivery" />
        </div>
        <Button onClick={submit} disabled={saving || !amount || !note.trim()}>
          {saving && <Spinner />}
          {saving ? 'Saving' : 'Apply'}
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={3} cols={5} label="Loading reward activity" />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reward activity yet.</p>
      ) : (
        <>
        {/* Phones: one stacked row per entry, so nothing hides past a scroll edge. */}
        <ul aria-label="Rewards history" className="divide-y divide-border sm:hidden">
          {entries.map((e) => {
            const status = entryStatus(e, now);
            const voided = e.status === 'void';
            return (
              <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">{fmt(e.createdAtMs)}</span>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      voided ? 'text-muted-foreground line-through' : e.amount < 0 ? 'text-foreground/80' : 'text-status-success-fg'
                    }`}
                  >
                    {signed(e.amount, e.currency === 'cashback' ? '₹' : 'pts', true)}
                  </span>
                </div>
                <p className={`mt-1 text-sm ${voided ? 'text-muted-foreground' : 'text-foreground'}`}>
                  <span className="capitalize">{e.kind}</span>
                  {e.note ? <> · {e.note}</> : null}
                </p>
                <p className={`mt-0.5 text-xs ${TONE[status.tone]}`}>
                  {status.label}
                  {status.hint ? <span className="text-muted-foreground"> · {status.hint}</span> : null}
                </p>
              </li>
            );
          })}
        </ul>
        {/* From sm: the table. Focusable so keyboard users can scroll it when it is wider than the panel. */}
        <div className="hidden overflow-x-auto rounded-control sm:block" tabIndex={0} role="region" aria-label="Rewards history">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2 pr-3 font-medium">Kind</th>
                <th scope="col" className="py-2 pr-3 font-medium">Note</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
                <th scope="col" className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const status = entryStatus(e, now);
                const voided = e.status === 'void';
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{fmt(e.createdAtMs)}</td>
                    <td className="py-2 pr-3 capitalize">{e.kind}</td>
                    <td className={`py-2 pr-3 ${voided ? 'text-muted-foreground' : ''}`}>{e.note}</td>
                    <td
                      className={`whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums ${
                        voided
                          ? 'text-muted-foreground line-through'
                          : e.amount < 0
                            ? 'text-foreground/80'
                            : 'text-status-success-fg'
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
        </>
      )}
    </section>
  );
};
