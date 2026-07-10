import type { GeneratedInterface, InterfaceRequest } from '#/lib/interface-contract';

const hasAny = (brief: string, words: string[]) =>
  words.some((word) => brief.toLowerCase().includes(word));

const extractDestination = (brief: string) => {
  const match = brief.match(/\b(?:to|in|for|near)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})/);
  return match?.[1] ?? 'the destination';
};

const extractTripPreference = (brief: string) => {
  if (hasAny(brief, ['stress', 'connection', 'layover', 'jet lag'])) return 'least stressful path';
  if (hasAny(brief, ['cheap', 'budget', 'lowest'])) return 'lowest reliable fare';
  if (hasAny(brief, ['fast', 'quick', 'door-to-door'])) return 'shortest door-to-door time';
  return 'balanced value';
};

const buildTravelInterface = (
  { brief }: InterfaceRequest,
  backend: GeneratedInterface['backend'],
): GeneratedInterface => {
  const destination = extractDestination(brief);
  const preference = extractTripPreference(brief);

  return {
    title: `Trip workspace: ${destination}`,
    domain: 'travel',
    intent: 'Find the right round-trip path and remove booking friction.',
    summary: `The request reads like a travel decision with a clear optimization target: ${preference}. The interface is tuned around comparing routes, exposing tradeoffs, and turning the chosen option into a ready booking flow.`,
    backend,
    controls: [
      {
        id: 'trip-type',
        label: 'Round trip',
        type: 'toggle',
        value: hasAny(brief, ['one way', 'one-way']) ? 'off' : 'on',
        options: [],
      },
      {
        id: 'priority',
        label: 'Priority',
        type: 'select',
        value: preference,
        options: ['least stressful path', 'lowest reliable fare', 'shortest door-to-door time'],
      },
      {
        id: 'bags',
        label: 'Bags',
        type: 'stepper',
        value: hasAny(brief, ['checked bag', 'luggage']) ? '1 checked' : 'carry-on',
        options: ['carry-on', '1 checked', '2 checked'],
      },
    ],
    sections: [
      {
        id: 'shortlist',
        title: 'Ticket shortlist',
        kind: 'options',
        items: [
          {
            primary: 'Calm connection',
            secondary: 'One protected connection, enough transfer time, checked-bag compatible.',
            meta: ['Best fit', 'Lower risk', 'Moderate fare'],
            tone: 'success',
          },
          {
            primary: 'Fastest door-to-door',
            secondary: 'Minimizes total travel time but keeps a tighter transfer window.',
            meta: ['Fastest', 'Higher stress'],
            tone: 'warning',
          },
          {
            primary: 'Fare saver',
            secondary: 'Cheaper route with longer waiting time and less flexible timing.',
            meta: ['Lowest fare', 'Long wait'],
            tone: 'neutral',
          },
        ],
      },
      {
        id: 'timeline',
        title: 'Trip timeline',
        kind: 'timeline',
        items: [
          {
            primary: 'Leave buffer before departure',
            secondary: 'Anchor search around a calm airport arrival and predictable transfer.',
            meta: ['T-3h'],
            tone: 'neutral',
          },
          {
            primary: 'Connection check',
            secondary: 'Compare terminal change, baggage policy, and missed-connection protection.',
            meta: ['Before purchase'],
            tone: 'warning',
          },
          {
            primary: 'Return symmetry',
            secondary: 'Prefer the same airport pair and a later return departure when possible.',
            meta: ['Return leg'],
            tone: 'neutral',
          },
        ],
      },
      {
        id: 'friction',
        title: 'Friction resolver',
        kind: 'checklist',
        items: [
          {
            primary: 'Baggage included',
            secondary: 'Surface total cost after bag fees instead of base fare.',
            meta: ['Cost clarity'],
            tone: 'success',
          },
          {
            primary: 'Connection protected',
            secondary:
              'Avoid split-ticket options unless savings are large enough to justify risk.',
            meta: ['Risk control'],
            tone: 'warning',
          },
          {
            primary: 'Calendar hold',
            secondary: 'Keep a visible hold step before checkout so dates can be verified.',
            meta: ['Decision point'],
            tone: 'neutral',
          },
        ],
      },
      {
        id: 'sandbox',
        title: 'Display target',
        kind: 'sandbox',
        items: [
          {
            primary: 'Vercel Sandbox',
            secondary: 'Publish the generated interface on port 3000 and share the sandbox domain.',
            meta: ['node24', 'port 3000'],
            tone: 'neutral',
          },
        ],
      },
    ],
    actions: [
      {
        label: 'Compare calm routes',
        intent: 'Rank routes by transfer risk first.',
        tone: 'success',
      },
      {
        label: 'Tighten dates',
        intent: 'Ask for exact departure and return windows.',
        tone: 'neutral',
      },
      {
        label: 'Price with bags',
        intent: 'Recalculate with baggage and seat fees included.',
        tone: 'warning',
      },
    ],
    sandbox: {
      provider: 'vercel-sandbox',
      runtime: 'node24',
      port: 3000,
      command: 'bun run interface-lab:dev',
      previewPath: '/',
    },
  };
};

const buildGeneralInterface = (
  { brief }: InterfaceRequest,
  backend: GeneratedInterface['backend'],
): GeneratedInterface => ({
  title: 'Problem workspace',
  domain: hasAny(brief, ['ops', 'queue', 'team']) ? 'operations' : 'planning',
  intent: 'Turn an open-ended request into a small operating interface.',
  summary:
    'The brief needs a structured decision surface: priorities up front, constraints visible, and concrete next actions grouped by confidence.',
  backend,
  controls: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      value: 'focused',
      options: ['focused', 'exploratory', 'handoff'],
    },
    {
      id: 'confidence',
      label: 'Confidence',
      type: 'stepper',
      value: 'medium',
      options: ['low', 'medium', 'high'],
    },
    { id: 'review', label: 'Review gate', type: 'toggle', value: 'on', options: [] },
  ],
  sections: [
    {
      id: 'decision',
      title: 'Decision frame',
      kind: 'decision',
      items: [
        {
          primary: 'Primary outcome',
          secondary: 'Define the one result this interface should move toward.',
          meta: ['Owner needed'],
          tone: 'warning',
        },
        {
          primary: 'Constraints',
          secondary: 'Keep assumptions visible and editable before any automation runs.',
          meta: ['Editable'],
          tone: 'neutral',
        },
      ],
    },
    {
      id: 'actions',
      title: 'Action stack',
      kind: 'checklist',
      items: [
        {
          primary: 'Clarify missing inputs',
          secondary: 'Ask only for details that change the next decision.',
          meta: ['High leverage'],
          tone: 'success',
        },
        {
          primary: 'Generate narrow output',
          secondary: 'Produce a tailored view rather than a long chat response.',
          meta: ['Interface first'],
          tone: 'success',
        },
        {
          primary: 'Prepare sandbox display',
          secondary: 'Ship the interface to a preview environment once the shape is accepted.',
          meta: ['Vercel Sandbox'],
          tone: 'neutral',
        },
      ],
    },
  ],
  actions: [
    { label: 'Refine inputs', intent: 'Collect the missing constraints.', tone: 'neutral' },
    {
      label: 'Generate surface',
      intent: 'Create the minimal interface for this problem.',
      tone: 'success',
    },
  ],
  sandbox: {
    provider: 'vercel-sandbox',
    runtime: 'node24',
    port: 3000,
    command: 'bun run interface-lab:dev',
    previewPath: '/',
  },
});

export const buildFallbackInterface = (
  request: InterfaceRequest,
  detail = 'Deterministic fallback generated this surface.',
) => {
  const backend: GeneratedInterface['backend'] = { kind: 'fallback', detail };
  const isTravel = hasAny(request.brief, [
    'ticket',
    'flight',
    'travel',
    'trip',
    'airport',
    'train',
    'hotel',
    'round trip',
    'return',
  ]);

  return isTravel
    ? buildTravelInterface(request, backend)
    : buildGeneralInterface(request, backend);
};
