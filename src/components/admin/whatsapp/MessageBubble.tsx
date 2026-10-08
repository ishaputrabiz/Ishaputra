/**
 * One message in the inbox timeline: customer message, team reply (with
 * delivery ticks) or internal note. Media loads only when an admin asks for
 * it, through the admin-only proxy, so nothing is downloaded by default.
 */
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
  ImageIcon,
  Lock,
  MapPin,
  Mic,
  Film,
  Sticker,
  UserRound,
  LayoutTemplate,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { whatsappAdminApi } from '@/services/whatsappAdminApi';
import { formatWhatsAppText } from './WhatsAppPreviewBubble';
import { describeSendError, formatBubbleTime, type DeliveryStatus, type ThreadMessage } from './inboxModel';

export const DeliveryTicks = ({ status, className = '' }: { status?: DeliveryStatus | null; className?: string }) => {
  if (!status) return null;
  const common = cn('size-3.5 flex-none', className);
  if (status === 'failed') return <AlertCircle className={cn(common, 'text-destructive')} aria-label="Not delivered" role="img" />;
  if (status === 'read') return <CheckCheck className={cn(common, 'text-status-info-fg')} aria-label="Read" role="img" />;
  if (status === 'delivered') return <CheckCheck className={cn(common, 'text-muted-foreground')} aria-label="Delivered" role="img" />;
  if (status === 'sent') return <Check className={cn(common, 'text-muted-foreground')} aria-label="Sent" role="img" />;
  return <Clock className={cn(common, 'text-muted-foreground')} aria-label="Sending" role="img" />;
};

const MEDIA_META: Record<string, { label: string; Icon: typeof ImageIcon }> = {
  image: { label: 'Photo', Icon: ImageIcon },
  sticker: { label: 'Sticker', Icon: Sticker },
  video: { label: 'Video', Icon: Film },
  audio: { label: 'Audio', Icon: Mic },
  document: { label: 'Document', Icon: FileText },
};

/** The tinted tile used for media and location links inside a bubble. */
const tileClass =
  'mb-1 flex w-full min-w-[12rem] items-center gap-3 rounded-control bg-foreground/[0.05] px-3 py-2.5 text-left transition-colors duration-hover hover:bg-foreground/[0.09] disabled:cursor-default';

const MediaBlock = ({ m, demo }: { m: ThreadMessage; demo: boolean }) => {
  const type = m.type || 'document';
  const meta = MEDIA_META[type] || MEDIA_META.document;
  const label = type === 'audio' && m.media?.voice ? 'Voice message' : meta.label;
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const load = async () => {
    if (!m.media?.id) return;
    if (demo) {
      setError('Demo data: media loads on the live site.');
      setState('error');
      return;
    }
    setState('loading');
    try {
      const objectUrl = await whatsappAdminApi.mediaObjectUrl(m.media.id);
      setUrl(objectUrl);
      setState('idle');
      if (type === 'document') {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = m.media.filename || 'whatsapp-document';
        a.click();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load media.');
      setState('error');
    }
  };

  if (url && (type === 'image' || type === 'sticker')) {
    return <img src={url} alt={m.media?.caption || label} className={cn('mb-1 rounded-control', type === 'sticker' ? 'size-32 object-contain' : 'max-h-80 w-full object-cover')} />;
  }
  if (url && type === 'video') return <video src={url} controls className="mb-1 max-h-80 w-full rounded-control" />;
  if (url && type === 'audio') return <audio src={url} controls className="mb-1 w-64 max-w-full" />;

  return (
    <div className="mb-1">
      <button type="button" onClick={load} disabled={state === 'loading' || !m.media?.id} className={cn(tileClass, 'mb-0')}>
        <span className="grid size-9 flex-none place-items-center rounded-full bg-card text-muted-foreground">
          {state === 'loading' ? <Spinner /> : <meta.Icon className="size-4" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{type === 'document' ? m.media?.filename || label : label}</span>
          <span className="block text-[11px] text-muted-foreground">
            {state === 'loading' ? 'Loading' : type === 'document' ? 'Tap to download' : 'Tap to view'}
          </span>
        </span>
        {type === 'document' && state !== 'loading' && <Download className="size-4 flex-none text-muted-foreground" aria-hidden="true" />}
      </button>
      {state === 'error' && <p role="alert" className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
};

const LocationBlock = ({ m }: { m: ThreadMessage }) => {
  const l = m.location!;
  const href = `https://www.google.com/maps?q=${encodeURIComponent(`${l.latitude},${l.longitude}`)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={tileClass}>
      <span className="grid size-9 flex-none place-items-center rounded-full bg-card text-destructive">
        <MapPin className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{l.name || 'Shared location'}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{l.address || 'Open in Google Maps'}</span>
      </span>
    </a>
  );
};

export const MessageBubble = ({ m, demo = false }: { m: ThreadMessage; demo?: boolean }) => {
  if (m.direction === 'note') {
    return (
      <li className="flex justify-center px-1">
        <div className="w-full max-w-[92%] rounded-card border border-status-warning-line bg-status-warning-bg px-3 py-2 text-[13.5px] text-status-warning-fg shadow-sm md:max-w-[72%]">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold">
            <Lock className="size-3" aria-hidden="true" /> Internal note. Only your team sees this
          </p>
          <p className="whitespace-pre-wrap break-words">{m.text}</p>
          <p className="mt-0.5 text-right text-[11px] tabular-nums">
            {m.actorName || m.actorEmail || 'Team'}, {formatBubbleTime(m.createdAt)}
          </p>
        </div>
      </li>
    );
  }

  const outbound = m.direction === 'outbound';
  const isMedia = !!m.media && !!MEDIA_META[m.type || ''];
  const isTemplate = m.type === 'template';
  const showText = !!m.text && !(isTemplate && m.text.startsWith('[template:'));

  return (
    <li className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[86%] md:max-w-[65%]">
        <div
          className={cn(
            'rounded-card px-2.5 pb-1.5 pt-1.5 text-sm leading-[1.4] text-foreground shadow-sm',
            outbound
              ? 'rounded-tr-chip border border-primary/20 bg-primary/10'
              : 'rounded-tl-chip border border-foreground/[0.06] bg-card',
          )}
        >
          <span className="sr-only">{outbound ? 'You: ' : 'Customer: '}</span>
          {isTemplate && (
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <LayoutTemplate className="size-3" aria-hidden="true" /> Template: {m.template?.name}
            </p>
          )}
          {isMedia && <MediaBlock m={m} demo={demo} />}
          {m.type === 'location' && m.location && <LocationBlock m={m} />}
          {m.type === 'contacts' && (
            <p className="mb-1 flex items-center gap-1.5 text-[13px]">
              <UserRound className="size-4" aria-hidden="true" /> Shared a contact
            </p>
          )}
          {showText && m.type !== 'location' && <p className="whitespace-pre-wrap break-words">{formatWhatsAppText(m.text || '')}</p>}
          {isTemplate && !showText && m.template?.params?.length ? (
            <ol className="list-decimal pl-4 text-[13px]">
              {m.template.params.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          ) : null}
          {!showText && !isMedia && !isTemplate && m.type !== 'location' && m.type !== 'contacts' && (
            <p className="italic text-muted-foreground">Empty message</p>
          )}
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted-foreground">
            {outbound && m.actorEmail ? <span className="mr-1 hidden truncate sm:inline">{m.actorName || m.actorEmail}</span> : null}
            {formatBubbleTime(m.createdAt)}
            {/* Messages sent before status tracking have no status: Meta accepted them. */}
            {outbound && <DeliveryTicks status={m.status || (m.providerMessageId ? 'sent' : 'accepted')} />}
          </p>
        </div>
        {outbound && m.status === 'failed' && (
          <p className="mt-1 flex items-start justify-end gap-1 text-right text-[11.5px] text-destructive" role="status">
            <AlertCircle className="mt-[2px] size-3 flex-none" aria-hidden="true" />
            {describeSendError(m.error)}
          </p>
        )}
      </div>
    </li>
  );
};

export default MessageBubble;
