/**
 * DEV-ONLY sample conversations for /admin/whatsapp?demo=1, used to review
 * the inbox layout without a Meta account. Loaded through a dynamic import
 * behind `import.meta.env.DEV`, so it never ships in the production bundle.
 * Names and numbers are made up.
 */
import type { Snippet, TeamMember, TemplateMeta, Thread, ThreadMessage, TimeLike } from './inboxModel';

const at = (ms: number): TimeLike => ({ toMillis: () => ms, toDate: () => new Date(ms) }) as TimeLike;
const MIN = 60_000;
const HOUR = 60 * MIN;

export function buildDemoData(myUid: string, myName: string) {
  const now = Date.now();
  const team: TeamMember[] = [
    { uid: myUid, name: myName },
    { uid: 'demo-staff-1', name: 'Store Staff' },
  ];
  const threads: Thread[] = [
    {
      id: '+919800000001',
      phone: '+919800000001',
      contactName: 'Priya (demo)',
      lastMessage: 'Is the hair oil available in a bigger bottle?',
      lastDirection: 'inbound',
      lastInboundAt: at(now - 12 * MIN),
      lastInboundMessageId: 'wamid.demo1.6',
      replyWindowClosesAt: at(now - 12 * MIN + 24 * HOUR),
      unreadCount: 2,
      updatedAt: at(now - 12 * MIN),
      status: 'open',
      assignedTo: null,
    },
    {
      id: '+919800000002',
      phone: '+919800000002',
      contactName: 'Ramesh (demo)',
      lastMessage: 'Your order ORD-1024 has been shipped.',
      lastDirection: 'outbound',
      lastStatus: 'read',
      lastInboundAt: at(now - 3 * HOUR),
      replyWindowClosesAt: at(now - 3 * HOUR + 24 * HOUR),
      unreadCount: 0,
      updatedAt: at(now - 2 * HOUR),
      status: 'open',
      assignedTo: { uid: myUid, name: myName },
    },
    {
      id: '+919800000003',
      phone: '+919800000003',
      contactName: null,
      lastMessage: 'Photo',
      lastMessageType: 'image',
      lastDirection: 'inbound',
      lastInboundAt: at(now - (23 * HOUR + 20 * MIN)),
      replyWindowClosesAt: at(now + 40 * MIN),
      unreadCount: 1,
      updatedAt: at(now - (23 * HOUR + 20 * MIN)),
      status: 'open',
      assignedTo: { uid: 'demo-staff-1', name: 'Store Staff' },
    },
    {
      id: '+919800000004',
      phone: '+919800000004',
      contactName: 'Lakshmi (demo)',
      lastMessage: 'Thank you!',
      lastDirection: 'inbound',
      lastInboundAt: at(now - 3 * 24 * HOUR),
      replyWindowClosesAt: at(now - 2 * 24 * HOUR),
      unreadCount: 0,
      updatedAt: at(now - 3 * 24 * HOUR),
      status: 'resolved',
      assignedTo: { uid: myUid, name: myName },
    },
  ];

  const messages: Record<string, ThreadMessage[]> = {
    '+919800000001': [
      { id: 'wamid.demo1.1', direction: 'inbound', type: 'text', text: 'Hello, I saw the Bhringraj hair oil on your website.', createdAt: at(now - 26 * HOUR) },
      { id: 'wamid.demo1.2', direction: 'outbound', type: 'text', text: 'Hi Priya, thank you for writing to us. Which product were you looking at?', status: 'read', actorEmail: 'team@example.com', actorName: myName, createdAt: at(now - 25 * HOUR) },
      { id: 'note-1', direction: 'note', text: 'Customer asked about this product last week too. Check the pack sizes before replying.', actorName: 'Store Staff', createdAt: at(now - 24.5 * HOUR) },
      { id: 'wamid.demo1.3', direction: 'inbound', type: 'image', text: 'This one', media: { id: '1234567890', mimeType: 'image/jpeg', caption: 'This one' }, createdAt: at(now - 40 * MIN) },
      { id: 'wamid.demo1.4', direction: 'inbound', type: 'location', text: '', location: { latitude: 17.385, longitude: 78.4867, name: 'Home', address: 'Hyderabad' }, createdAt: at(now - 30 * MIN) },
      { id: 'wamid.demo1.5', direction: 'outbound', type: 'text', text: 'We will check delivery to your area and reply here.', status: 'failed', error: { code: 131026, message: 'Message undeliverable' }, actorEmail: 'team@example.com', actorName: myName, createdAt: at(now - 20 * MIN) },
      { id: 'wamid.demo1.6', direction: 'inbound', type: 'text', text: 'Is the hair oil available in a bigger bottle?', createdAt: at(now - 12 * MIN) },
    ],
    '+919800000002': [
      { id: 'wamid.demo2.1', direction: 'inbound', type: 'text', text: 'Where is my order?', createdAt: at(now - 3 * HOUR) },
      { id: 'wamid.demo2.2', direction: 'outbound', type: 'template', text: 'Your order ORD-1024 has been shipped.', template: { name: 'order_update_v1', language: 'en_US', params: ['Ramesh', 'ORD-1024'] }, status: 'read', actorName: myName, createdAt: at(now - 2 * HOUR) },
    ],
    '+919800000003': [
      { id: 'wamid.demo3.1', direction: 'inbound', type: 'document', text: 'invoice.pdf', media: { id: '2234567890', mimeType: 'application/pdf', filename: 'invoice.pdf' }, createdAt: at(now - 23.4 * HOUR) },
      { id: 'wamid.demo3.2', direction: 'inbound', type: 'audio', text: '', media: { id: '3234567890', mimeType: 'audio/ogg', voice: true }, createdAt: at(now - (23 * HOUR + 20 * MIN)) },
    ],
    '+919800000004': [
      { id: 'wamid.demo4.1', direction: 'inbound', type: 'text', text: 'Thank you!', createdAt: at(now - 3 * 24 * HOUR) },
    ],
  };

  const templates: TemplateMeta[] = [
    { id: 'order_update_v1', name: 'order_update_v1', language: 'en_US', category: 'utility', paramLabels: ['Customer name', 'Order number'], status: 'APPROVED', bodyText: 'Hi {{1}}, your order {{2}} has an update. Reply here if you need help.' },
    { id: 'new_range_v1', name: 'new_range_v1', language: 'en_US', category: 'marketing', paramLabels: ['Customer name'], status: 'PENDING', bodyText: 'Hi {{1}}, our new range is here.' },
  ];

  const snippets: Snippet[] = [
    { id: 's1', title: 'Order tracking', text: 'Once your order ships you will get the tracking link on WhatsApp.' },
    { id: 's2', title: 'Order help', text: 'Please share your order number and we will check the status for you.' },
  ];

  return { team, threads, messages, templates, snippets, at };
}
