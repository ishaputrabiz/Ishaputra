/**
 * "Create template" form for Admin -> Marketing -> Templates.
 * Submits to Meta through /api/whatsapp-reply { action: 'templates-create' }.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Bold,
  CornerUpLeft,
  ExternalLink,
  Italic,
  Phone,
  Plus,
  Send,
  Trash2,
  Info,
} from 'lucide-react';
import {
  CATEGORY_HELP,
  TEMPLATE_LIMITS,
  extractVariables,
  nextVariableNumber,
  renderWithExamples,
  validateTemplateDraft,
  type TemplateButtonDraft,
  type TemplateCategory,
  type TemplateDraft,
} from './templateRules';
import WhatsAppPreviewBubble from './WhatsAppPreviewBubble';
import TemplatePictureField from './TemplatePictureField';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BRAND } from '@/config/brand';
import { cn } from '@/lib/utils';
import { whatsappAdminApi, WhatsAppApiError } from '@/services/whatsappAdminApi';

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mr', label: 'Marathi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'gu', label: 'Gujarati' },
];

/** Shortcuts that insert the next variable and pre-fill its label and example. */
const VARIABLE_PRESETS: Array<{ label: string; example: string }> = [
  { label: 'Customer name', example: 'Priya' },
  { label: 'Order number', example: 'ORD-1024' },
  { label: 'Amount', example: 'Rs. 499' },
  { label: 'Date', example: '12 Oct' },
];

/** Native select, same look as <Input>. */
const SELECT_CLS =
  'flex h-11 w-full rounded-control border border-input bg-background px-3 py-2 text-base text-foreground transition-[border-color,box-shadow] duration-hover ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive md:text-sm';

const emptyDraft = (): TemplateDraft => ({
  name: '',
  language: 'en',
  category: 'UTILITY',
  header: { text: '' },
  body: { text: '', examples: [] },
  footer: { text: '' },
  buttons: [],
  paramLabels: [],
  auth: { addSecurityRecommendation: true, codeExpirationMinutes: 10 },
});

export const TemplateCreator = ({ onCreated }: { onCreated?: () => void }) => {
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isAuth = draft.category === 'AUTHENTICATION';
  const bodyText = draft.body?.text || '';
  const vars = useMemo(() => extractVariables(bodyText), [bodyText]);
  const varCount = vars.length ? Math.max(...vars) : 0;
  const errors = useMemo(() => ({ ...validateTemplateDraft(draft), ...serverFieldErrors }), [draft, serverFieldErrors]);
  const errorFor = (key: string) => (submitted || touched[key] ? errors[key] : undefined);
  const touch = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  const update = (patch: Partial<TemplateDraft>) => {
    setServerFieldErrors({});
    setServerError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setBody = (text: string, examples = draft.body?.examples || []) => update({ body: { text, examples } });
  const setExample = (i: number, value: string) => {
    const examples = [...(draft.body?.examples || [])];
    examples[i] = value;
    update({ body: { text: bodyText, examples } });
  };
  const setLabel = (i: number, value: string) => {
    const labels = [...(draft.paramLabels || [])];
    labels[i] = value;
    update({ paramLabels: labels });
  };

  /** Insert text at the caret (or replace / wrap the selection). */
  const insertAtCaret = (makeText: (selected: string) => string, after?: (draftAfter: { text: string }) => void) => {
    const ta = bodyRef.current;
    const start = ta?.selectionStart ?? bodyText.length;
    const end = ta?.selectionEnd ?? bodyText.length;
    const selected = bodyText.slice(start, end);
    const insert = makeText(selected);
    const next = bodyText.slice(0, start) + insert + bodyText.slice(end);
    after?.({ text: next });
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const caret = start + insert.length;
      ta.setSelectionRange(caret, caret);
    });
    return next;
  };

  const addVariable = (preset?: { label: string; example: string }) => {
    const n = nextVariableNumber(bodyText);
    const needsSpaceBefore = (() => {
      const pos = bodyRef.current?.selectionStart ?? bodyText.length;
      const prev = bodyText.slice(0, pos);
      return prev.length > 0 && !/\s$/.test(prev);
    })();
    const next = insertAtCaret(() => `${needsSpaceBefore ? ' ' : ''}{{${n}}}`);
    const examples = [...(draft.body?.examples || [])];
    const labels = [...(draft.paramLabels || [])];
    if (preset) {
      examples[n - 1] = examples[n - 1] || preset.example;
      labels[n - 1] = labels[n - 1] || preset.label;
    }
    setServerFieldErrors({});
    setDraft((d) => ({ ...d, body: { text: next, examples }, paramLabels: labels }));
  };

  const wrapSelection = (mark: string) => {
    const next = insertAtCaret((sel) => `${mark}${sel || 'text'}${mark}`);
    setBody(next);
  };

  const buttons = draft.buttons || [];
  const setButton = (i: number, patch: Partial<TemplateButtonDraft>) => {
    const next = buttons.map((b, idx) => (idx === i ? ({ ...b, ...patch } as TemplateButtonDraft) : b));
    update({ buttons: next });
  };
  const addButton = (type: TemplateButtonDraft['type']) => {
    const b: TemplateButtonDraft =
      type === 'URL' ? { type, text: 'Visit website', url: 'https://' } : type === 'PHONE_NUMBER' ? { type, text: 'Call us', phone: '+91' } : { type, text: '' };
    update({ buttons: [...buttons, b] });
  };
  const removeButton = (i: number) => update({ buttons: buttons.filter((_, idx) => idx !== i) });
  const urlCount = buttons.filter((b) => b.type === 'URL').length;
  const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
  const canAddButton = buttons.length < TEMPLATE_LIMITS.buttons;

  const payload = (): TemplateDraft => {
    if (isAuth) return { name: draft.name.trim(), language: draft.language, category: draft.category, auth: draft.auth };
    return {
      name: draft.name.trim(),
      language: draft.language,
      category: draft.category,
      header:
        draft.header?.format === 'IMAGE'
          ? draft.header.imageUrl
            ? { text: '', format: 'IMAGE', imageUrl: draft.header.imageUrl }
            : null
          : draft.header?.text?.trim()
            ? { text: draft.header.text.trim() }
            : null,
      body: { text: bodyText.trim(), examples: Array.from({ length: varCount }, (_, i) => (draft.body?.examples?.[i] || '').trim()) },
      footer: draft.footer?.text?.trim() ? { text: draft.footer.text.trim() } : null,
      buttons,
      paramLabels: Array.from({ length: varCount }, (_, i) => (draft.paramLabels?.[i] || '').trim()),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const local = validateTemplateDraft(draft);
    if (Object.keys(local).length) {
      setServerError('Fix the highlighted fields first.');
      const firstKey = Object.keys(local)[0];
      document.getElementById(`tpl-${firstKey.replace(/\./g, '-')}`)?.focus();
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const resp = await whatsappAdminApi.createTemplate(payload());
      toast.success(`"${resp.template.name}" sent to Meta for review`, {
        description: 'Status shows "In review" until Meta approves it. Use Sync from Meta to refresh.',
      });
      setDraft(emptyDraft());
      setTouched({});
      setSubmitted(false);
      onCreated?.();
    } catch (err) {
      const apiErr = err instanceof WhatsAppApiError ? err : null;
      setServerError(apiErr?.message || 'Could not create the template.');
      if (apiErr?.fieldErrors) setServerFieldErrors(apiErr.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  // ---- preview content
  const examples = draft.body?.examples || [];
  const previewBody = isAuth
    ? `*123456* is your verification code.${draft.auth?.addSecurityRecommendation !== false ? ' For your security, do not share this code.' : ''}`
    : renderWithExamples(bodyText, examples);
  const previewFooter = isAuth
    ? draft.auth?.codeExpirationMinutes
      ? `This code expires in ${draft.auth.codeExpirationMinutes} minutes.`
      : null
    : draft.footer?.text || null;
  const previewButtons = isAuth
    ? [{ type: 'OTP', text: 'Copy code' }]
    : [...buttons.filter((b) => b.type === 'QUICK_REPLY'), ...buttons.filter((b) => b.type !== 'QUICK_REPLY')];

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ------------------------------------------------------------ form */}
      <div className="space-y-5 lg:col-start-1 lg:row-start-1">
        <Card title="Basics">
          <FieldRow id="tpl-name" label="Template name" hint="Lowercase letters, numbers and underscores. A deleted name can't be reused for 30 days." error={errorFor('name')}>
            <Input
              id="tpl-name"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
              onBlur={() => touch('name')}
              placeholder="order_shipped_v1"
              maxLength={TEMPLATE_LIMITS.name}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!errorFor('name')}
              className="font-mono"
            />
          </FieldRow>
          <FieldRow id="tpl-language" label="Language" error={errorFor('language')}>
            <select id="tpl-language" value={draft.language} onChange={(e) => update({ language: e.target.value })} className={SELECT_CLS}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>
          </FieldRow>
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-foreground/80">Category</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
              {(Object.keys(CATEGORY_HELP) as TemplateCategory[]).map((c) => {
                const active = draft.category === c;
                return (
                  <label
                    key={c}
                    className={cn(
                      'relative flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-card border p-3 transition-[border-color,background-color] duration-hover has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                      active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-foreground/30',
                    )}
                  >
                    <input type="radio" name="tpl-category" value={c} checked={active} onChange={() => update({ category: c })} className="sr-only" />
                    <span className="text-sm font-medium text-foreground">{CATEGORY_HELP[c].label}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-foreground/80">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 flex-none" />
              <span>{CATEGORY_HELP[draft.category].help}</span>
            </p>
          </fieldset>
        </Card>

        {isAuth ? (
          <Card title="Code message">
            <p className="text-xs text-foreground/80">
              Meta writes authentication messages itself. You only choose these options.
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={draft.auth?.addSecurityRecommendation !== false}
                onChange={(e) => update({ auth: { ...draft.auth, addSecurityRecommendation: e.target.checked } })}
                className="size-4 accent-primary"
              />
              Add "For your security, do not share this code."
            </label>
            <FieldRow id="tpl-auth-codeExpirationMinutes" label="Code expires after (minutes, optional)" error={errorFor('auth.codeExpirationMinutes')}>
              <Input
                id="tpl-auth-codeExpirationMinutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={draft.auth?.codeExpirationMinutes ?? ''}
                onChange={(e) => update({ auth: { ...draft.auth, codeExpirationMinutes: e.target.value === '' ? null : Number(e.target.value) } })}
                onBlur={() => touch('auth.codeExpirationMinutes')}
                aria-invalid={!!errorFor('auth.codeExpirationMinutes')}
                className="max-w-[10rem]"
              />
            </FieldRow>
          </Card>
        ) : (
          <>
            <Card title="Message">
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span id="tpl-header-kind" className="text-xs font-medium text-foreground/80">Header (optional)</span>
                  <ToggleGroup
                    type="single"
                    value={draft.header?.format || 'TEXT'}
                    onValueChange={(kind) => {
                      if (!kind) return;
                      update({ header: kind === 'IMAGE' ? { text: '', format: 'IMAGE', imageUrl: draft.header?.imageUrl } : { text: '' } });
                    }}
                    aria-labelledby="tpl-header-kind"
                  >
                    <ToggleGroupItem value="TEXT" size="sm" className="h-8 px-3 text-xs">Text</ToggleGroupItem>
                    <ToggleGroupItem value="IMAGE" size="sm" className="h-8 px-3 text-xs">Picture</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                {draft.header?.format === 'IMAGE' ? (
                  <TemplatePictureField
                    imageUrl={draft.header.imageUrl || null}
                    onChange={(imageUrl) => update({ header: { text: '', format: 'IMAGE', imageUrl: imageUrl || undefined } })}
                    error={errorFor('header.imageUrl')}
                  />
                ) : (
                  <FieldRow id="tpl-header-text" label="Header text" counter={`${(draft.header?.text || '').length}/${TEMPLATE_LIMITS.header}`} error={errorFor('header.text')}>
                    <Input
                      id="tpl-header-text"
                      value={draft.header?.text || ''}
                      onChange={(e) => update({ header: { text: e.target.value } })}
                      onBlur={() => touch('header.text')}
                      maxLength={TEMPLATE_LIMITS.header}
                      placeholder="Your order is on its way"
                      aria-invalid={!!errorFor('header.text')}
                    />
                  </FieldRow>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-end justify-between gap-2">
                  <label htmlFor="tpl-body-text" className="text-xs font-medium text-foreground/80">
                    Message text <span aria-hidden="true" className="text-status-danger-fg">*</span>
                  </label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {bodyText.length}/{TEMPLATE_LIMITS.body}
                  </span>
                </div>
                <div role="group" className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Insert into message">
                  <Button type="button" variant="outline" size="sm" onClick={() => addVariable()} className="h-8 border-primary px-3 text-primary hover:bg-primary/10">
                    <Plus aria-hidden="true" /> Add variable {`{{${nextVariableNumber(bodyText)}}}`}
                  </Button>
                  {VARIABLE_PRESETS.map((p) => (
                    <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => addVariable(p)} className="h-8 px-3">
                      {p.label}
                    </Button>
                  ))}
                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                  <IconButton type="button" size="sm" label="Bold selected text" onClick={() => wrapSelection('*')}>
                    <Bold />
                  </IconButton>
                  <IconButton type="button" size="sm" label="Italic selected text" onClick={() => wrapSelection('_')}>
                    <Italic />
                  </IconButton>
                </div>
                <Textarea
                  id="tpl-body-text"
                  ref={bodyRef}
                  value={bodyText}
                  onChange={(e) => setBody(e.target.value)}
                  onBlur={() => touch('body.text')}
                  rows={6}
                  maxLength={TEMPLATE_LIMITS.body}
                  placeholder={`Hi {{1}}, your ${BRAND.name} order {{2}} has been shipped. We will message you again when it is out for delivery.`}
                  aria-invalid={!!errorFor('body.text')}
                  aria-describedby="tpl-body-help"
                  className="resize-y leading-relaxed"
                />
                {errorFor('body.text') ? (
                  <FieldError>{errorFor('body.text')}</FieldError>
                ) : (
                  <p id="tpl-body-help" className="mt-1.5 text-[11px] text-muted-foreground">
                    Variables are filled in when you send, for example the customer's name. Use *bold* and _italic_ like in WhatsApp.
                  </p>
                )}
              </div>

              {varCount > 0 && (
                <div className="rounded-card border border-border bg-muted/60 p-3">
                  <p className="mb-2 text-xs font-medium text-foreground">Variables</p>
                  <p className="mb-3 text-[11px] text-foreground/80">
                    Meta needs a realistic example for each variable to approve the template. The name helps your team when sending.
                  </p>
                  <div className="space-y-3">
                    {Array.from({ length: varCount }, (_, i) => (
                      <div key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)]">
                        <span className="mt-2 inline-flex h-7 items-center justify-center rounded-chip bg-card font-mono text-xs text-foreground ring-1 ring-border">
                          {`{{${i + 1}}}`}
                        </span>
                        <div>
                          <label htmlFor={`tpl-label-${i}`} className="sr-only">{`Name for variable ${i + 1}`}</label>
                          <Input
                            id={`tpl-label-${i}`}
                            value={draft.paramLabels?.[i] || ''}
                            onChange={(e) => setLabel(i, e.target.value)}
                            maxLength={TEMPLATE_LIMITS.label}
                            placeholder="What is it? e.g. Customer name"
                          />
                        </div>
                        <div className="col-start-2 sm:col-start-3">
                          <label htmlFor={`tpl-body-examples-${i}`} className="sr-only">{`Example for variable ${i + 1}`}</label>
                          <Input
                            id={`tpl-body-examples-${i}`}
                            value={examples[i] || ''}
                            onChange={(e) => setExample(i, e.target.value)}
                            onBlur={() => touch(`body.examples.${i}`)}
                            maxLength={TEMPLATE_LIMITS.example}
                            placeholder="Example, e.g. Priya"
                            aria-invalid={!!errorFor(`body.examples.${i}`)}
                          />
                          {errorFor(`body.examples.${i}`) && <FieldError>{errorFor(`body.examples.${i}`)}</FieldError>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FieldRow id="tpl-footer-text" label="Footer (optional)" counter={`${(draft.footer?.text || '').length}/${TEMPLATE_LIMITS.footer}`} error={errorFor('footer.text')}>
                <Input
                  id="tpl-footer-text"
                  value={draft.footer?.text || ''}
                  onChange={(e) => update({ footer: { text: e.target.value } })}
                  onBlur={() => touch('footer.text')}
                  maxLength={TEMPLATE_LIMITS.footer}
                  placeholder="Reply STOP to opt out"
                  aria-invalid={!!errorFor('footer.text')}
                />
              </FieldRow>
            </Card>

            <Card title="Buttons (optional)" aside={<span className="text-[11px] tabular-nums text-muted-foreground">{buttons.length}/{TEMPLATE_LIMITS.buttons}</span>}>
              {buttons.length === 0 && (
                <p className="text-xs text-foreground/80">
                  Quick replies let customers answer with one tap. Website and call buttons open a link or dial your number.
                </p>
              )}
              <ul className="space-y-3">
                {buttons.map((b, i) => (
                  <li key={i} className="rounded-card border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                        {b.type === 'URL' ? <ExternalLink aria-hidden="true" className="size-3.5" /> : b.type === 'PHONE_NUMBER' ? <Phone aria-hidden="true" className="size-3.5" /> : <CornerUpLeft aria-hidden="true" className="size-3.5" />}
                        {b.type === 'URL' ? 'Website link' : b.type === 'PHONE_NUMBER' ? 'Call phone number' : 'Quick reply'}
                      </span>
                      <IconButton type="button" size="sm" label={`Remove button ${i + 1}`} onClick={() => removeButton(i)} className="hover:text-destructive">
                        <Trash2 />
                      </IconButton>
                    </div>
                    <div className={cn('grid gap-2', b.type !== 'QUICK_REPLY' && 'sm:grid-cols-2')}>
                      <div>
                        <label htmlFor={`tpl-buttons-${i}-text`} className="sr-only">Button label</label>
                        <Input
                          id={`tpl-buttons-${i}-text`}
                          value={b.text}
                          onChange={(e) => setButton(i, { text: e.target.value })}
                          onBlur={() => touch(`buttons.${i}.text`)}
                          maxLength={TEMPLATE_LIMITS.buttonText}
                          placeholder={b.type === 'QUICK_REPLY' ? 'e.g. Track my order' : 'Button label'}
                          aria-invalid={!!errorFor(`buttons.${i}.text`)}
                        />
                        {errorFor(`buttons.${i}.text`) && <FieldError>{errorFor(`buttons.${i}.text`)}</FieldError>}
                      </div>
                      {b.type === 'URL' && (
                        <div>
                          <label htmlFor={`tpl-buttons-${i}-url`} className="sr-only">Link</label>
                          <Input
                            id={`tpl-buttons-${i}-url`}
                            type="url"
                            inputMode="url"
                            value={b.url}
                            onChange={(e) => setButton(i, { url: e.target.value } as Partial<TemplateButtonDraft>)}
                            onBlur={() => touch(`buttons.${i}.url`)}
                            placeholder="https://your-domain.com"
                            aria-invalid={!!errorFor(`buttons.${i}.url`)}
                          />
                          {errorFor(`buttons.${i}.url`) && <FieldError>{errorFor(`buttons.${i}.url`)}</FieldError>}
                        </div>
                      )}
                      {b.type === 'PHONE_NUMBER' && (
                        <div>
                          <label htmlFor={`tpl-buttons-${i}-phone`} className="sr-only">Phone number</label>
                          <Input
                            id={`tpl-buttons-${i}-phone`}
                            type="tel"
                            inputMode="tel"
                            value={b.phone}
                            onChange={(e) => setButton(i, { phone: e.target.value } as Partial<TemplateButtonDraft>)}
                            onBlur={() => touch(`buttons.${i}.phone`)}
                            placeholder="+919876543210"
                            aria-invalid={!!errorFor(`buttons.${i}.phone`)}
                          />
                          {errorFor(`buttons.${i}.phone`) && <FieldError>{errorFor(`buttons.${i}.phone`)}</FieldError>}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {errors.buttons && <FieldError>{errors.buttons}</FieldError>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!canAddButton} onClick={() => addButton('QUICK_REPLY')}>
                  <CornerUpLeft aria-hidden="true" /> Quick reply
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!canAddButton || urlCount >= TEMPLATE_LIMITS.urlButtons} onClick={() => addButton('URL')}>
                  <ExternalLink aria-hidden="true" /> Website link
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!canAddButton || phoneCount >= TEMPLATE_LIMITS.phoneButtons} onClick={() => addButton('PHONE_NUMBER')}>
                  <Phone aria-hidden="true" /> Call number
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* --------------------------------------------------------- preview */}
      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="space-y-2 lg:sticky lg:top-4">
          <p className="text-xs font-medium text-foreground/80">Preview</p>
          <WhatsAppPreviewBubble
            header={isAuth || draft.header?.format === 'IMAGE' ? null : draft.header?.text}
            headerImage={!isAuth && draft.header?.format === 'IMAGE' ? draft.header.imageUrl || 'placeholder' : null}
            body={previewBody}
            footer={previewFooter}
            buttons={previewButtons}
          />
          <p className="text-[11px] text-muted-foreground">Shown with your example values. Customers see their own details.</p>
        </div>
      </div>

      {/* --------------------------------------------------------- actions */}
      <div className="space-y-3 lg:col-start-1 lg:row-start-2">
        <div aria-live="polite">
          {serverError && (
            <Notice tone="danger" compact>
              {serverError}
            </Notice>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner /> : <Send aria-hidden="true" />}
            {saving ? 'Submitting' : 'Submit to Meta for review'}
          </Button>
          <p className="text-xs text-muted-foreground">Review usually takes a few minutes, sometimes up to 24 hours.</p>
        </div>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
const Card = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

const FieldError = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 flex items-start gap-1 text-[12px] text-status-danger-fg">
    <AlertCircle aria-hidden="true" className="mt-[2px] size-3 flex-none" />
    <span>{children}</span>
  </p>
);

const FieldRow = ({
  id,
  label,
  hint,
  counter,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  counter?: string;
  error?: string;
  children: ReactNode;
}) => (
  <div>
    <div className="mb-1.5 flex items-end justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-foreground/80">
        {label}
      </label>
      {counter && <span className="text-[11px] tabular-nums text-muted-foreground">{counter}</span>}
    </div>
    {children}
    {error ? <FieldError>{error}</FieldError> : hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
  </div>
);

export default TemplateCreator;
