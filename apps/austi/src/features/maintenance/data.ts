export const trades = ['Plumbing', 'Heating', 'Electrical', 'General repairs'] as const;
export type Trade = (typeof trades)[number];
export const statuses = [
  'Needs approval',
  'Escalated',
  'Unassigned',
  'Contractor contacted',
  'Scheduled',
  'Awaiting confirmation',
  'Resolved',
] as const;
export type CaseStatus = (typeof statuses)[number];
export const inboxFilters = [
  'Needs attention',
  'Open',
  'Scheduled',
  'Waiting',
  'Resolved',
] as const;
export type InboxFilter = (typeof inboxFilters)[number];

export interface Contractor {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  trades: Trade[];
  area: string;
  properties: string;
  priority: number;
  timeoutHours: number;
  active: boolean;
}

export interface MaintenanceCase {
  id: string;
  title: string;
  property: string;
  unit: string;
  category: Trade;
  urgency: 'Emergency' | 'Urgent' | 'Routine';
  status: CaseStatus;
  contractorId?: string;
  nextAction: string;
  age: string;
  reportedAt: string;
  tenant: string;
  report: string;
  assessment: string;
  attachments: { name: string; size: string }[];
  access: string;
  appointment?: string;
  contractorActivity?: string;
  automation: boolean;
  quote?: { amount: number; reference: string; work: string };
  messages: { sender: string; time: string; body: string }[];
  timeline: {
    time: string;
    title: string;
    kind?: 'report' | 'assessment' | 'quote' | 'escalation' | 'assignment';
  }[];
}

export const contractors: Contractor[] = [
  {
    id: 'plumbco',
    company: 'PlumbCo',
    contact: 'Tomas Petrauskas',
    phone: '+370 600 00001',
    email: 'tomas@plumbco.example',
    trades: ['Plumbing'],
    area: 'Kaunas',
    properties: 'Laisvės al. 21, Kęstučio g. 8',
    priority: 1,
    timeoutHours: 2,
    active: true,
  },
  {
    id: 'fixit',
    company: 'FixIT',
    contact: 'Rasa Kazlauskaitė',
    phone: '+370 600 00002',
    email: 'rasa@fixit.example',
    trades: ['Plumbing', 'Heating'],
    area: 'Kaunas',
    properties: 'All properties',
    priority: 2,
    timeoutHours: 2,
    active: true,
  },
  {
    id: 'electropro',
    company: 'ElectroPro',
    contact: 'Mantas Jankauskas',
    phone: '+370 600 00003',
    email: 'mantas@electropro.example',
    trades: ['Electrical'],
    area: 'Kaunas',
    properties: 'All properties',
    priority: 1,
    timeoutHours: 2,
    active: true,
  },
  {
    id: 'homecare',
    company: 'HomeCare',
    contact: 'Ieva Stankevičienė',
    phone: '+370 600 00004',
    email: 'ieva@homecare.example',
    trades: ['General repairs'],
    area: 'Kaunas, Garliava',
    properties: 'Vytauto pr. 42',
    priority: 1,
    timeoutHours: 4,
    active: false,
  },
];

export const cases: MaintenanceCase[] = [
  {
    id: 'M-1042',
    title: 'Kitchen sink leaking',
    property: 'Laisvės al. 21',
    unit: '14B',
    category: 'Plumbing',
    urgency: 'Urgent',
    status: 'Needs approval',
    contractorId: 'plumbco',
    nextAction: 'Approve €280 quote',
    age: '2h',
    reportedAt: '20 Sep, 12:24',
    tenant: 'Eglė Vaitkutė',
    report:
      'Water is leaking underneath the kitchen sink. It starts again whenever I use the tap. I have turned off the water and put a bucket underneath.',
    assessment:
      'Likely a leaking drain connection. Water is isolated; no active flooding. Replace the trap and check the adjoining pipework.',
    attachments: [
      { name: 'Under-sink.jpg', size: '2.4 MB' },
      { name: 'Drain-connection.jpg', size: '1.8 MB' },
    ],
    access: 'Tenant home after 16:00. Ring 14B.',
    contractorActivity: 'Quote received · 20 Sep, 14:10',
    automation: true,
    quote: {
      amount: 280,
      reference: 'PC-2084',
      work: 'Replace sink trap, reseal drain connection, and test for leaks.',
    },
    messages: [
      {
        sender: 'Eglė Vaitkutė',
        time: '2026-09-20T12:24:00+03:00',
        body: 'The cupboard floor is wet. I have attached two photos.',
      },
      {
        sender: 'Austi',
        time: '2026-09-20T12:26:00+03:00',
        body: 'Can you isolate the water beneath the sink?',
      },
      {
        sender: 'Eglė Vaitkutė',
        time: '2026-09-20T12:29:00+03:00',
        body: 'Yes, the water is off now.',
      },
    ],
    timeline: [
      { time: '2026-09-20T12:24:00+03:00', title: 'Issue reported', kind: 'report' },
      { time: '2026-09-20T12:25:00+03:00', title: 'Two attachments received' },
      {
        time: '2026-09-20T12:30:00+03:00',
        title: 'Classified as urgent plumbing',
        kind: 'assessment',
      },
      { time: '2026-09-20T12:31:00+03:00', title: 'PlumbCo contacted' },
      { time: '2026-09-20T14:10:00+03:00', title: '€280 quote awaiting approval', kind: 'quote' },
    ],
  },
  {
    id: 'M-1041',
    title: 'Toilet blocked',
    property: 'Kęstučio g. 8',
    unit: '5C',
    category: 'Plumbing',
    urgency: 'Emergency',
    status: 'Escalated',
    contractorId: 'fixit',
    nextAction: 'Review emergency',
    age: '3h',
    reportedAt: '20 Sep, 11:18',
    tenant: 'Jonas Balčiūnas',
    report:
      'The only toilet in the flat is blocked and the water is rising. We have stopped using it.',
    assessment:
      'Possible drain blockage. The only toilet is unusable; manager review is required under the emergency rule.',
    attachments: [],
    access: 'Tenant available all day. Call on arrival.',
    contractorActivity: 'Awaiting manager review',
    automation: false,
    messages: [
      {
        sender: 'Jonas Balčiūnas',
        time: '2026-09-20T11:18:00+03:00',
        body: 'We need someone today. This is our only toilet.',
      },
    ],
    timeline: [
      { time: '2026-09-20T11:18:00+03:00', title: 'Issue reported', kind: 'report' },
      {
        time: '2026-09-20T11:19:00+03:00',
        title: 'Emergency escalation triggered',
        kind: 'escalation',
      },
      { time: '2026-09-20T11:30:00+03:00', title: 'Manager took over case' },
    ],
  },
  {
    id: 'M-1040',
    title: 'Bedroom window will not close',
    property: 'Vytauto pr. 42',
    unit: '12',
    category: 'General repairs',
    urgency: 'Routine',
    status: 'Unassigned',
    nextAction: 'Assign contractor',
    age: '5h',
    reportedAt: '20 Sep, 09:05',
    tenant: 'Lina Žukaitė',
    report:
      'The window handle turns but the window will not shut fully. There is a gap along the top edge.',
    assessment:
      'Likely a misaligned hinge or locking mechanism. No active contractor covers this trade and property.',
    attachments: [{ name: 'Window-hinge.jpg', size: '1.2 MB' }],
    access: 'Weekdays after 17:30.',
    automation: true,
    messages: [
      {
        sender: 'Lina Žukaitė',
        time: '2026-09-20T09:05:00+03:00',
        body: 'Please let me know before anyone visits.',
      },
    ],
    timeline: [
      { time: '2026-09-20T09:05:00+03:00', title: 'Issue reported', kind: 'report' },
      { time: '2026-09-20T09:07:00+03:00', title: 'Classified as general repairs' },
      {
        time: '2026-09-20T09:08:00+03:00',
        title: 'No eligible contractor found',
        kind: 'assignment',
      },
    ],
  },
  {
    id: 'M-1039',
    title: 'Boiler not heating',
    property: 'Laisvės al. 21',
    unit: '8A',
    category: 'Heating',
    urgency: 'Urgent',
    status: 'Contractor contacted',
    contractorId: 'fixit',
    nextAction: 'Reply due today, 16:20',
    age: '6h',
    reportedAt: '20 Sep, 08:20',
    tenant: 'Darius Varnas',
    report:
      'The boiler shows error E10. There is no hot water. Restarting it did not clear the error.',
    assessment:
      'The reported code may indicate low system pressure. A heating technician needs to inspect the unit.',
    attachments: [{ name: 'Boiler-display.jpg', size: '2.1 MB' }],
    access: 'Keys with concierge. Call tenant before entering.',
    contractorActivity: 'Contacted · 20 Sep, 14:20',
    automation: true,
    messages: [
      {
        sender: 'Darius Varnas',
        time: '2026-09-20T08:20:00+03:00',
        body: 'I have uploaded a photo of the display.',
      },
      {
        sender: 'Austi',
        time: '2026-09-20T14:20:00+03:00',
        body: 'FixIT has been contacted with the boiler details.',
      },
    ],
    timeline: [
      { time: '2026-09-20T08:20:00+03:00', title: 'Issue reported', kind: 'report' },
      { time: '2026-09-20T08:24:00+03:00', title: 'Boiler details confirmed', kind: 'assessment' },
      { time: '2026-09-20T14:20:00+03:00', title: 'FixIT contacted' },
    ],
  },
  {
    id: 'M-1038',
    title: 'Hallway light flickering',
    property: 'Kęstučio g. 8',
    unit: '21',
    category: 'Electrical',
    urgency: 'Routine',
    status: 'Scheduled',
    contractorId: 'electropro',
    nextAction: 'Visit tomorrow, 10:00',
    age: '1d',
    reportedAt: '19 Sep, 15:40',
    tenant: 'Gabija Norkutė',
    report: 'The hallway light flickers even after changing the bulb.',
    assessment:
      'The fitting or connection needs inspection. Tenant has switched off the affected light.',
    attachments: [],
    access: 'Tenant will meet the electrician at the entrance.',
    appointment: '21 Sep 2026, 10:00–11:00',
    contractorActivity: 'Visit confirmed · 20 Sep, 09:15',
    automation: true,
    messages: [
      {
        sender: 'Gabija Norkutė',
        time: '2026-09-20T09:10:00+03:00',
        body: 'Tomorrow at 10 works for me.',
      },
    ],
    timeline: [
      { time: '2026-09-19T15:40:00+03:00', title: 'Issue reported', kind: 'report' },
      { time: '2026-09-19T15:45:00+03:00', title: 'ElectroPro contacted', kind: 'assessment' },
      { time: '2026-09-20T09:15:00+03:00', title: 'Appointment confirmed' },
    ],
  },
  {
    id: 'M-1036',
    title: 'Radiator valve dripping',
    property: 'Vytauto pr. 42',
    unit: '3A',
    category: 'Heating',
    urgency: 'Routine',
    status: 'Awaiting confirmation',
    contractorId: 'fixit',
    nextAction: 'Waiting for tenant',
    age: '2d',
    reportedAt: '18 Sep, 10:12',
    tenant: 'Paulius Butkus',
    report: 'A small amount of water collects below the bedroom radiator valve overnight.',
    assessment:
      'FixIT replaced the valve seal and reported a successful pressure test. Tenant confirmation is pending.',
    attachments: [],
    access: 'Tenant available 09:00–12:00.',
    appointment: '19 Sep 2026, 09:00–10:00',
    contractorActivity: 'Repair completed · 19 Sep, 09:45',
    automation: true,
    messages: [
      {
        sender: 'Austi',
        time: '2026-09-19T10:00:00+03:00',
        body: 'Has the dripping stopped since the valve was repaired?',
      },
    ],
    timeline: [
      { time: '2026-09-18T10:12:00+03:00', title: 'Issue reported', kind: 'report' },
      { time: '2026-09-18T11:00:00+03:00', title: 'FixIT accepted job' },
      { time: '2026-09-19T09:45:00+03:00', title: 'Repair completed', kind: 'assessment' },
      { time: '2026-09-19T10:00:00+03:00', title: 'Tenant confirmation requested' },
    ],
  },
  {
    id: 'M-1033',
    title: 'Bathroom extractor not working',
    property: 'Laisvės al. 21',
    unit: '6B',
    category: 'Electrical',
    urgency: 'Routine',
    status: 'Resolved',
    contractorId: 'electropro',
    nextAction: 'Closed',
    age: '3d',
    reportedAt: '17 Sep, 13:00',
    tenant: 'Monika Grigaitė',
    report: 'The extractor fan no longer turns on with the bathroom light.',
    assessment: 'Faulty fan motor replaced. Tenant confirmed the extractor is working.',
    attachments: [],
    access: 'Tenant provided access.',
    appointment: '18 Sep 2026, 14:00–15:00',
    contractorActivity: 'Repair completed · 18 Sep, 14:40',
    automation: true,
    messages: [
      {
        sender: 'Monika Grigaitė',
        time: '2026-09-18T18:20:00+03:00',
        body: 'The fan is working again. Thank you.',
      },
    ],
    timeline: [
      { time: '2026-09-17T13:00:00+03:00', title: 'Issue reported', kind: 'report' },
      { time: '2026-09-18T14:40:00+03:00', title: 'Fan motor replaced' },
      { time: '2026-09-18T18:20:00+03:00', title: 'Tenant confirmed repair', kind: 'assessment' },
      { time: '2026-09-18T18:21:00+03:00', title: 'Case closed' },
    ],
  },
];

export const checkIfNeedsAttention = (item: MaintenanceCase) =>
  ['Needs approval', 'Escalated', 'Unassigned'].includes(item.status);
export const matchesInboxFilter = (item: MaintenanceCase, needsAttention: boolean) => {
  if (needsAttention) return checkIfNeedsAttention(item);
  return true;
};
export const getContractor = (id?: string) => contractors.find((item) => item.id === id);
export const formatEuro = (amount: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
export const filterCases = (needsAttention: boolean, search: string) => {
  const query = search.trim().toLowerCase();
  return cases.filter(
    (item) =>
      matchesInboxFilter(item, needsAttention) &&
      [
        item.id,
        item.title,
        item.property,
        item.unit,
        item.category,
        item.urgency,
        item.status,
        item.nextAction,
        getContractor(item.contractorId)?.company,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );
};
