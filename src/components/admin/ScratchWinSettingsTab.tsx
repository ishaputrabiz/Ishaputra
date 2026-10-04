import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, Coins, Eye, Info, Plus, RefreshCw, Save, Ticket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { FormSkeleton } from '@/components/skeletons';
import { StatCard } from '@/components/admin/StatCard';
import { ScratchCardDialog } from '@/components/scratch/ScratchCardDialog';
import { describeError } from '@/lib/errorMessage';
import { formatINR } from '@/lib/format';
import { type RewardSettings } from '@/lib/rewards';
import {
  SCRATCH_MAX_PRIZES,
  drawScratchPrize,
  normaliseScratchSettings,
  scratchPrizeStats,
  scratchTotalWeight,
  type ScratchCard,
  type ScratchWinSettings,
} from '@/lib/scratchWin';
import { getRewardSettings } from '@/services/rewardsService';
import { getScratchSettings, saveScratchSettings, type ScratchResult } from '@/services/scratchWinService';

const DAY = 86_400_000;

type Row = { id: string; points: number; weight: number };
type Form = Omit<ScratchWinSettings, 'prizes'> & { rows: Row[] };

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const toForm = (s: ScratchWinSettings): Form => ({
  enabled: s.enabled,
  minOrder: s.minOrder,
  expiryDays: s.expiryDays,
  noWinWeight: s.noWinWeight,
  rows: s.prizes.map((p) => ({ id: newId(), ...p })),
});
const toSettings = (f: Form): ScratchWinSettings => ({
  enabled: f.enabled,
  minOrder: f.minOrder,
  expiryDays: f.expiryDays,
  noWinWeight: f.noWinWeight,
  prizes: f.rows.map(({ points, weight }) => ({ points, weight })),
});

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtPct = (share: number) => `${fmtNum(Math.round(share * 1000) / 10)}%`;

function ChanceBar({ share }: { share: number | null }) {
  // A prize under 1 point is dropped on save, so it has no chance.
  if (share === null) return <span className="text-right text-xs text-muted-foreground">Not saved</span>;
  return (
    <div className="flex items-center gap-2">
      <div aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-foreground/[0.08] sm:block">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(share * 100, 100)}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-semibold tabular-nums text-foreground">{fmtPct(share)}</span>
    </div>
  );
}

/** A random whole number in [0, total) for the preview (the real draw happens on the server). */
const localRoll = (total: number) => crypto.getRandomValues(new Uint32Array(1))[0] % total;

/** Admin > Commerce settings > Scratch & Win. */
export function ScratchWinSettingsTab() {
  // Set only by a successful read. A failed one never falls back to the
  // defaults: saving those would overwrite the shop's real settings.
  const [saved, setSaved] = useState<ScratchWinSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [rewards, setRewards] = useState<RewardSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ScratchCard | null>(null);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    Promise.all([getScratchSettings(), getRewardSettings()])
      .then(([s, r]) => {
        if (!live) return;
        setSaved(s);
        setForm(toForm(s));
        setRewards(r);
      })
      .catch((err) => {
        console.error(err);
        if (live) setLoadError(describeError(err));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const clean = useMemo(() => (form ? normaliseScratchSettings(toSettings(form)) : null), [form]);
  const stats = useMemo(() => (clean ? scratchPrizeStats(clean) : null), [clean]);

  if (!form && !loadError) {
    return (
      <div className="rounded-card border border-border bg-card p-4 sm:p-6">
        <FormSkeleton fields={5} label="Loading Scratch & Win settings" />
      </div>
    );
  }

  const header = (
    <div className="mb-5 flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-foreground/70">
        <Ticket className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-foreground">Scratch &amp; Win</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Placeholder values until the client confirms them.</p>
      </div>
      {saved?.enabled ? <StatusBadge tone="success" label="Live" dot pulse /> : <StatusBadge tone="neutral" label="Off" dot />}
    </div>
  );

  if (!form || !clean || !stats || !rewards) {
    return (
      <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-6">
        {header}
        <Notice
          tone="danger"
          title="Could not load the Scratch & Win settings"
          className="mb-5"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          }
        >
          <p>{loadError}</p>
          <p className="mt-1">Saving stays off until they load, so the current settings cannot be overwritten.</p>
        </Notice>
        <Button disabled>
          <Save aria-hidden="true" /> Save Scratch &amp; Win
        </Button>
      </section>
    );
  }

  const total = scratchTotalWeight(clean);
  // Clamped like the save, so a typed weight never shows more than 100%.
  const share = (weight: number) => (total > 0 ? Math.min(1000, Math.max(0, Math.floor(weight))) / total : 0);
  const avgRupees = stats.averagePoints * rewards.pointValue;
  const ofOrder = clean.minOrder > 0 ? (avgRupees / clean.minOrder) * 100 : 0;
  const update = (id: string, patch: Partial<Row>) =>
    setForm((f) => (f ? { ...f, rows: f.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : f));
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    const before = form;
    setSaving(true);
    try {
      const next = normaliseScratchSettings(toSettings(before));
      await saveScratchSettings(next, saved?.enabled === true);
      const adjusted = JSON.stringify(next) !== JSON.stringify(toSettings(before));
      setSaved(next);
      // Show what was written, but keep anything typed while the save was running.
      setForm((current) => (current === before ? toForm(next) : current));
      toast.success(
        'Scratch & Win saved',
        adjusted ? { description: 'Values outside the allowed range were adjusted to fit.' } : undefined,
      );
    } catch (err) {
      console.error(err);
      toast.error('Could not save Scratch & Win', { description: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  const openPreview = () => {
    const now = Date.now();
    setPreview({
      id: 'preview',
      orderNumber: 'PREVIEW',
      orderAmount: clean.minOrder,
      status: 'new',
      points: 0,
      createdAtMs: now,
      deliveredAtMs: now,
      expiresAtMs: now + clean.expiryDays * DAY,
      unlockAtMs: now + rewards.unlockDays * DAY,
      scratchedAtMs: 0,
      voidedAtMs: 0,
    });
  };
  const previewScratch = async (): Promise<ScratchResult> => {
    await new Promise((r) => window.setTimeout(r, 400));
    const points = total > 0 ? drawScratchPrize(clean, localRoll(total)) : 0;
    return { ok: true, points, held: false, unlockAtMs: Date.now() + rewards.unlockDays * DAY };
  };

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-6">
      {header}

      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="sw-on" className="text-sm font-medium text-foreground">Scratch &amp; Win on</Label>
          <p id="sw-on-hint" className="text-xs text-muted-foreground">
            Off stops new cards. Cards already given can still be scratched until they expire.
          </p>
        </div>
        <Switch id="sw-on" aria-describedby="sw-on-hint" checked={form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </div>

      {form.enabled && !rewards.enabled && (
        <Notice tone="warning" className="mb-5">
          Loyalty rewards are off (Rewards tab), so no new cards are given. Prizes are loyalty points.
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="sw-min" className="text-sm">Minimum order (₹)</Label>
          <Input
            id="sw-min"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.minOrder}
            onChange={(e) => set({ minOrder: Number(e.target.value) })}
            className="mt-1.5 tabular-nums"
            aria-describedby="sw-min-hint"
          />
          <p id="sw-min-hint" className="mt-1.5 text-xs text-muted-foreground">
            Delivered online orders at or above this get one card.
          </p>
        </div>
        <div>
          <Label htmlFor="sw-exp" className="text-sm">Card expires after (days)</Label>
          <Input
            id="sw-exp"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.expiryDays}
            onChange={(e) => set({ expiryDays: Number(e.target.value) })}
            className="mt-1.5 tabular-nums"
            aria-describedby="sw-exp-hint"
          />
          <p id="sw-exp-hint" className="mt-1.5 text-xs text-muted-foreground">
            Counted from delivery. Unscratched cards then show as expired.
          </p>
        </div>
      </div>

      <h3 className="mb-1 text-sm font-semibold text-foreground">Prizes</h3>
      <p className="mb-3 text-xs text-muted-foreground">A higher weight comes up more often. Chances update as you type.</p>
      <div className="overflow-hidden rounded-card border border-foreground/[0.08]">
        <table className="w-full text-left">
          <thead className="bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-2.5 font-semibold sm:px-3">Points</th>
              <th scope="col" className="px-2 py-2.5 font-semibold sm:px-3">Weight</th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold sm:px-3">Chance</th>
              <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.07]">
            {form.rows.map((r, i) => {
              const valid = Math.floor(r.points) >= 1;
              return (
                <tr key={r.id}>
                  <td className="px-2 py-2 sm:px-3">
                    <Input
                      aria-label={`Prize ${i + 1}, points`}
                      aria-invalid={!valid || undefined}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={r.points}
                      onChange={(e) => update(r.id, { points: Number(e.target.value) })}
                      className="h-10 w-full max-w-[6rem] tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    <Input
                      aria-label={`Prize ${i + 1}, weight`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={r.weight}
                      onChange={(e) => update(r.id, { weight: Number(e.target.value) })}
                      className="h-10 w-full max-w-[6rem] tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    <div className="flex justify-end">
                      <ChanceBar share={valid ? share(r.weight) : null} />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <IconButton
                      label={`Remove the ${r.points}-point prize`}
                      size="sm"
                      onClick={() => set({ rows: form.rows.filter((x) => x.id !== r.id) })}
                    >
                      <Trash2 />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/30">
              <td className="px-2 py-2 text-sm text-foreground sm:px-3">Better luck next time</td>
              <td className="px-2 py-2 sm:px-3">
                <Input
                  aria-label="Better luck next time, weight"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.noWinWeight}
                  onChange={(e) => set({ noWinWeight: Number(e.target.value) })}
                  className="h-10 w-full max-w-[6rem] tabular-nums"
                />
              </td>
              <td className="px-2 py-2 sm:px-3">
                <div className="flex justify-end">
                  <ChanceBar share={share(form.noWinWeight)} />
                </div>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={form.rows.length >= SCRATCH_MAX_PRIZES}
        onClick={() => set({ rows: [...form.rows, { id: newId(), points: 100, weight: 1 }] })}
      >
        <Plus aria-hidden="true" /> Add prize
      </Button>
      {form.rows.length >= SCRATCH_MAX_PRIZES && (
        <p className="mt-1.5 text-xs text-muted-foreground">Up to {SCRATCH_MAX_PRIZES} prizes.</p>
      )}

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <li>
          <StatCard
            label="Average cost per card"
            icon={Coins}
            value={`${fmtNum(stats.averagePoints)} pts`}
            subtitle={`${formatINR(Math.round(avgRupees * 10) / 10)}, ${fmtNum(Math.round(ofOrder * 10) / 10)}% of a ${formatINR(clean.minOrder)} order`}
          />
        </li>
        <li>
          <StatCard
            label="Biggest prize"
            icon={Award}
            value={stats.top ? `${stats.top.points} pts` : 'None'}
            subtitle={stats.topOneIn ? `About 1 in ${stats.topOneIn} cards` : 'Never drawn'}
          />
        </li>
        <li>
          <StatCard
            label="Cards that win"
            icon={Ticket}
            value={fmtPct(stats.winShare)}
            subtitle={`Better luck next time: ${fmtPct(total > 0 ? clean.noWinWeight / total : 0)}`}
          />
        </li>
      </ul>

      <Notice tone="info" icon={Info} title="How cards work" className="mt-6">
        <p>
          A card is given when an online order of {formatINR(clean.minOrder)} or more is delivered. The prize is drawn when the
          customer scratches it. Won points follow that order: they unlock with its points, and are taken back if it is
          returned. A card not yet scratched is cancelled if its order is returned.
        </p>
      </Notice>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={openPreview}>
          <Eye aria-hidden="true" /> Preview card
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          Save Scratch &amp; Win
        </Button>
      </div>

      <ScratchCardDialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
        cards={preview ? [preview] : []}
        startId={preview?.id ?? null}
        scratch={previewScratch}
        pointValue={rewards.pointValue}
        minOrder={clean.enabled ? clean.minOrder : null}
        title="Preview card"
        describe={() => 'Preview, gives nothing'}
      />
    </section>
  );
}
