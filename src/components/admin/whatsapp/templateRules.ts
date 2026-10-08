/**
 * Client copy of the WhatsApp template rules in api/whatsapp-reply.ts
 * (`validateTemplateInput`). Vercel functions here cannot import from src/, so
 * the two are kept in sync by hand and checked against the same cases in the
 * unit test. The server is the authority; this copy only powers live form hints.
 */

export const TEMPLATE_LIMITS = {
  name: 512,
  body: 1024,
  header: 60,
  footer: 60,
  buttonText: 25,
  buttons: 10,
  urlButtons: 2,
  phoneButtons: 1,
  url: 2000,
  example: 200,
  label: 60,
} as const;

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type TemplateButtonDraft =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone: string };

export interface TemplateDraft {
  name: string;
  language: string;
  category: TemplateCategory;
  /** A text header, or a picture (`format: 'IMAGE'`) stored at `imageUrl`. */
  header?: { text: string; format?: 'TEXT' | 'IMAGE'; imageUrl?: string } | null;
  body?: { text: string; examples: string[] } | null;
  footer?: { text: string } | null;
  buttons?: TemplateButtonDraft[];
  paramLabels?: string[];
  auth?: { addSecurityRecommendation?: boolean; codeExpirationMinutes?: number | null } | null;
}

export const CATEGORY_HELP: Record<TemplateCategory, { label: string; help: string }> = {
  UTILITY: {
    label: 'Utility',
    help: 'Updates a customer expects about something they did: order confirmed, shipped, delivery slot, return pickup. Cheapest to send and approved fastest. No offers or promotions.',
  },
  MARKETING: {
    label: 'Marketing',
    help: 'Offers, new collections, festive sales, back-in-stock alerts. Customers can block or report these, so send them only to people who opted in.',
  },
  AUTHENTICATION: {
    label: 'Authentication',
    help: 'One-time login or verification codes only. Meta writes the wording ("123456 is your verification code") and adds a Copy code button.',
  },
};

const VAR_RE = /\{\{(\d+)\}\}/g;

export function extractVariables(text: string): number[] {
  const seen: number[] = [];
  for (const m of String(text || '').matchAll(VAR_RE)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** The next free variable number (highest used + 1). */
export const nextVariableNumber = (text: string) => Math.max(0, ...extractVariables(text)) + 1;

export function renderWithExamples(text: string, examples: string[]) {
  return String(text || '').replace(VAR_RE, (_, n) => examples[Number(n) - 1] || `{{${n}}}`);
}

function hasMalformedVariable(text: string) {
  const stripped = String(text || '').replace(VAR_RE, '');
  return stripped.includes('{{') || stripped.includes('}}');
}

export function validateTemplateDraft(d: TemplateDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = (d.name || '').trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > TEMPLATE_LIMITS.name) errors.name = `Name must be ${TEMPLATE_LIMITS.name} characters or fewer.`;
  else if (!/^[a-z0-9_]+$/.test(name)) errors.name = 'Use only lowercase letters, numbers and underscores (for example order_update_v2).';

  if (!/^[a-z]{2,3}(_[A-Z]{2,3})?$/.test((d.language || '').trim())) errors.language = 'Use a language code like en, en_US, hi or te.';
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(d.category)) errors.category = 'Pick Marketing, Utility or Authentication.';

  if (d.category === 'AUTHENTICATION') {
    const exp = d.auth?.codeExpirationMinutes;
    if (exp !== undefined && exp !== null && !(Number.isInteger(exp) && exp >= 1 && exp <= 90)) {
      errors['auth.codeExpirationMinutes'] = 'Code expiry must be a whole number from 1 to 90 minutes.';
    }
    return errors;
  }

  const bodyText = (d.body?.text || '').trim();
  let vars: number[] = [];
  if (!bodyText) errors['body.text'] = 'Message text is required.';
  else if (bodyText.length > TEMPLATE_LIMITS.body) errors['body.text'] = `Message text must be ${TEMPLATE_LIMITS.body} characters or fewer.`;
  else if (hasMalformedVariable(bodyText)) errors['body.text'] = 'Variables must look exactly like {{1}}, {{2}} (no spaces or names inside the braces).';
  else {
    vars = extractVariables(bodyText);
    const sorted = [...vars].sort((a, b) => a - b);
    if (sorted.some((n, i) => n !== i + 1)) {
      errors['body.text'] = `Variables must be numbered in sequence starting at {{1}} (found ${sorted.map((n) => `{{${n}}}`).join(', ')}).`;
    } else if (/^\{\{\d+\}\}/.test(bodyText) || /\{\{\d+\}\}$/.test(bodyText)) {
      errors['body.text'] = 'Meta rejects text that starts or ends with a variable. Add words before the first or after the last variable.';
    }
  }
  const examples = d.body?.examples || [];
  vars.forEach((_, i) => {
    const ex = (examples[i] || '').trim();
    if (!ex) errors[`body.examples.${i}`] = `Add an example for {{${i + 1}}}. Meta needs one for every variable.`;
    else if (ex.length > TEMPLATE_LIMITS.example) errors[`body.examples.${i}`] = `Keep the example under ${TEMPLATE_LIMITS.example} characters.`;
    else if (/\{\{|\}\}/.test(ex)) errors[`body.examples.${i}`] = 'Examples cannot contain {{ or }}.';
  });

  const headerText = (d.header?.text || '').trim();
  if (d.header?.format === 'IMAGE') {
    if (!d.header.imageUrl) errors['header.imageUrl'] = 'Choose a picture for the header, or switch the header to text.';
  } else if (headerText) {
    if (headerText.length > TEMPLATE_LIMITS.header) errors['header.text'] = `Header must be ${TEMPLATE_LIMITS.header} characters or fewer.`;
    else if (/\{\{|\}\}/.test(headerText)) errors['header.text'] = 'Variables in the header are not supported here. Put them in the message text.';
    else if (/[\r\n]/.test(headerText)) errors['header.text'] = 'The header must be one line.';
  }
  const footerText = (d.footer?.text || '').trim();
  if (footerText) {
    if (footerText.length > TEMPLATE_LIMITS.footer) errors['footer.text'] = `Footer must be ${TEMPLATE_LIMITS.footer} characters or fewer.`;
    else if (/\{\{|\}\}/.test(footerText)) errors['footer.text'] = 'The footer cannot contain variables.';
    else if (/[\r\n]/.test(footerText)) errors['footer.text'] = 'The footer must be one line.';
  }

  const buttons = d.buttons || [];
  if (buttons.length > TEMPLATE_LIMITS.buttons) errors.buttons = `At most ${TEMPLATE_LIMITS.buttons} buttons.`;
  let urlCount = 0;
  let phoneCount = 0;
  const seen = new Set<string>();
  buttons.slice(0, TEMPLATE_LIMITS.buttons).forEach((b, i) => {
    const key = `buttons.${i}`;
    const text = (b.text || '').trim();
    if (!text) errors[`${key}.text`] = 'Button label is required.';
    else if (text.length > TEMPLATE_LIMITS.buttonText) errors[`${key}.text`] = `Button labels must be ${TEMPLATE_LIMITS.buttonText} characters or fewer.`;
    else if (seen.has(text.toLowerCase())) errors[`${key}.text`] = 'Two buttons cannot have the same label.';
    seen.add(text.toLowerCase());
    if (b.type === 'URL') {
      urlCount += 1;
      const url = (b.url || '').trim();
      let valid = false;
      try {
        const u = new URL(url);
        valid = (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
      } catch {
        valid = false;
      }
      if (!url) errors[`${key}.url`] = 'Link is required.';
      else if (url.length > TEMPLATE_LIMITS.url) errors[`${key}.url`] = 'Link is too long.';
      else if (/\{\{|\}\}/.test(url)) errors[`${key}.url`] = 'Links with variables are not supported here yet. Use a fixed link.';
      else if (!valid) errors[`${key}.url`] = 'Enter a full link starting with https://';
    } else if (b.type === 'PHONE_NUMBER') {
      phoneCount += 1;
      const phone = (b.phone || '').replace(/[\s()-]/g, '');
      if (!/^\+\d{8,15}$/.test(phone)) errors[`${key}.phone`] = 'Enter the number with country code, for example +919876543210.';
    }
  });
  if (urlCount > TEMPLATE_LIMITS.urlButtons) errors.buttons = `At most ${TEMPLATE_LIMITS.urlButtons} website-link buttons.`;
  if (phoneCount > TEMPLATE_LIMITS.phoneButtons) errors.buttons = `At most ${TEMPLATE_LIMITS.phoneButtons} call button.`;
  return errors;
}

export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | string;

/** Tone of the status chip (a StatusBadge tone). */
export type TemplateStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export const STATUS_STYLE: Record<string, { label: string; tone: TemplateStatusTone; help: string }> = {
  APPROVED: {
    label: 'Approved',
    tone: 'success',
    help: 'Ready to send.',
  },
  PENDING: {
    label: 'In review',
    tone: 'warning',
    help: 'Meta is reviewing it. This usually takes minutes, sometimes up to 24 hours.',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'danger',
    help: 'Meta declined it. Fix the reason shown and create it again with a new name.',
  },
  PAUSED: {
    label: 'Paused',
    tone: 'warning',
    help: 'Paused by Meta after customers blocked or reported it.',
  },
  DISABLED: {
    label: 'Disabled',
    tone: 'neutral',
    help: 'Disabled by Meta. It can no longer be sent.',
  },
};

export const statusStyle = (status?: string | null) =>
  STATUS_STYLE[String(status || '').toUpperCase()] || {
    label: status ? String(status).replace(/_/g, ' ').toLowerCase() : 'Manual',
    tone: 'neutral' as TemplateStatusTone,
    help: status ? '' : 'Added by hand. Status is unknown until you sync from Meta.',
  };

/** Templates without a status (manual entries) are allowed, as before. */
export const isSendableTemplate = (status?: string | null) => !status || String(status).toUpperCase() === 'APPROVED';
