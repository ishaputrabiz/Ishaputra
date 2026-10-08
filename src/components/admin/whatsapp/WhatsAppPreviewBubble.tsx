/**
 * WhatsApp-style message bubble used to preview templates before they are
 * submitted to Meta. Renders WhatsApp's light markup (*bold*, _italic_,
 * ~strike~, ```mono```) as React nodes, never as HTML.
 */
import { Fragment, type ReactNode } from 'react';
import { CornerUpLeft, ExternalLink, Phone, Copy, CheckCheck, Image as ImageIcon } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { formatTime } from '@/lib/format';

export interface PreviewButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'OTP' | string;
  text: string;
}

const TOKEN_RE = /(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

export function formatWhatsAppText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  String(text || '')
    .split(TOKEN_RE)
    .forEach((part, i) => {
      if (!part) return;
      if (part.startsWith('```') && part.endsWith('```') && part.length > 6) {
        out.push(<code key={i} className="font-mono text-[0.95em]">{part.slice(3, -3)}</code>);
      } else if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
        out.push(<strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>);
      } else if (part.length > 2 && part.startsWith('_') && part.endsWith('_')) {
        out.push(<em key={i}>{part.slice(1, -1)}</em>);
      } else if (part.length > 2 && part.startsWith('~') && part.endsWith('~')) {
        out.push(<s key={i}>{part.slice(1, -1)}</s>);
      } else {
        out.push(<Fragment key={i}>{part}</Fragment>);
      }
    });
  return out;
}

const ButtonIcon = ({ type }: { type: string }) => {
  if (type === 'URL') return <ExternalLink className="size-4" aria-hidden="true" />;
  if (type === 'PHONE_NUMBER') return <Phone className="size-4" aria-hidden="true" />;
  if (type === 'OTP') return <Copy className="size-4" aria-hidden="true" />;
  return <CornerUpLeft className="size-4" aria-hidden="true" />;
};

const bubbleClass = 'border border-foreground/[0.06] bg-card shadow-sm';

export const WhatsAppPreviewBubble = ({
  header,
  headerImage,
  body,
  footer,
  buttons = [],
  businessName = BRAND.name,
}: {
  header?: string | null;
  /** Picture header: its URL, 'placeholder' while none is chosen, or nothing. */
  headerImage?: string | null;
  body: string;
  footer?: string | null;
  buttons?: PreviewButton[];
  businessName?: string;
}) => {
  const time = formatTime(new Date());
  return (
    <div className="overflow-hidden rounded-card border border-border">
      <div className="flex items-center gap-2.5 border-b border-border bg-muted px-3 py-2.5 text-foreground">
        <div className="grid size-8 place-items-center rounded-full bg-card text-xs font-semibold" aria-hidden="true">
          {businessName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">{businessName}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">Business account</p>
        </div>
      </div>
      <div className="tx-paper min-h-[220px] bg-background p-3">
        <div className="max-w-[92%]">
          <div className={`relative rounded-card rounded-tl-chip px-2.5 pb-1.5 pt-2 text-sm leading-[1.4] text-foreground ${bubbleClass}`}>
            {headerImage === 'placeholder' ? (
              <div className="-mx-1 -mt-1 mb-1.5 grid aspect-[1.91/1] place-items-center rounded-control bg-muted text-muted-foreground">
                <ImageIcon className="size-8" aria-hidden="true" />
              </div>
            ) : headerImage ? (
              <img src={headerImage} alt="" className="-mx-1 -mt-1 mb-1.5 aspect-[1.91/1] w-[calc(100%+0.5rem)] max-w-none rounded-control object-cover" />
            ) : null}
            {header ? <p className="mb-1 font-semibold">{header}</p> : null}
            <p className="whitespace-pre-wrap break-words">
              {body ? formatWhatsAppText(body) : <span className="text-muted-foreground">Your message appears here.</span>}
            </p>
            {footer ? <p className="mt-1 text-[12.5px] text-muted-foreground">{footer}</p> : null}
            <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted-foreground">
              {time}
              <CheckCheck className="size-3.5 text-status-info-fg" aria-hidden="true" />
            </p>
          </div>
          {buttons.length > 0 && (
            <div className="mt-0.5 space-y-0.5">
              {buttons.slice(0, 3).map((b, i) => (
                <div
                  key={`${b.type}-${i}`}
                  className={`flex items-center justify-center gap-1.5 rounded-card px-3 py-2 text-sm font-medium text-primary ${bubbleClass}`}
                >
                  <ButtonIcon type={b.type} />
                  <span className="truncate">{b.text || 'Button'}</span>
                </div>
              ))}
              {buttons.length > 3 && (
                <div className={`flex items-center justify-center rounded-card px-3 py-2 text-sm font-medium text-primary ${bubbleClass}`}>
                  See all options
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppPreviewBubble;
