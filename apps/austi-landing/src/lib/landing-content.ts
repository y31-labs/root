export const outcomes = [
  {
    id: 'coordination',
    name: 'Less coordination work',
    copy: 'Fewer repetitive calls, emails, scheduling conversations and follow-ups spread across the team.',
    detail: 'Routine handoffs stay attached to one case.',
  },
  {
    id: 'response',
    name: 'Faster first response',
    copy: 'Intake and basic diagnosis can begin when the report arrives, even before a coordinator is available.',
    detail: 'Urgent and uncertain cases surface sooner.',
  },
  {
    id: 'pms',
    name: 'Keep your existing PMS',
    copy: 'Add a coordination layer without migrating the system your team already uses as its source of truth.',
    detail: 'The complete case returns to the existing record.',
  },
] as const;

export const workflowPhases = [
  {
    name: 'Understand',
    range: 'Report → Triage',
    title: 'Turn a fragmented report into a workable brief.',
  },
  {
    name: 'Decide',
    range: 'Approval',
    title: 'Apply the operator’s policy before anything moves.',
  },
  {
    name: 'Coordinate',
    range: 'Select → Follow up',
    title: 'Bring the resident and contractor to one confirmed plan.',
  },
  {
    name: 'Close',
    range: 'Resolve → Record',
    title: 'Verify the outcome and return a complete case to the PMS.',
  },
] as const;

export const stages = [
  {
    name: 'Report',
    copy: 'Pick up the report across phone, email and WhatsApp, then connect it to the right resident and property.',
  },
  {
    name: 'Diagnose',
    copy: 'Ask structured follow-up questions, collect photos, video, error codes and approved low-risk checks.',
  },
  {
    name: 'Triage',
    copy: 'Classify urgency, likely responsibility and trade, while making uncertainty visible.',
  },
  {
    name: 'Approve',
    copy: 'Apply responsibility and spend rules, pausing for a person whenever policy or judgment requires it.',
  },
  {
    name: 'Select',
    copy: 'Start with approved contractors for that property and trade, with a complete job brief ready.',
  },
  {
    name: 'Schedule',
    copy: 'Line up resident access and contractor availability, chase silence and confirm the appointment.',
  },
  {
    name: 'Follow up',
    copy: 'Chase missing replies, keep every party updated and surface a stalled case before it disappears.',
  },
  {
    name: 'Resolve',
    copy: 'Confirm attendance and the outcome with the resident and contractor, then collect evidence and invoice details.',
  },
  {
    name: 'Record',
    copy: 'Prepare the full case history for the PMS so the existing system remains the source of truth.',
  },
] as const;

export const controls = [
  {
    name: 'Portfolio policy',
    copy: 'Approval limits and responsibilities can differ by owner, property and repair type.',
  },
  {
    name: 'Contractor order',
    copy: 'Choose preferred, backup and emergency contractors for every property and trade.',
  },
  {
    name: 'Escalation moments',
    copy: 'Danger, liability, uncertainty, sensitive residents and human requests go straight to a person.',
  },
  {
    name: 'Communication rules',
    copy: 'Set the tone, working hours, update cadence and information each party should receive.',
  },
] as const;

export const faqGroups = [
  {
    id: 'product',
    name: 'Product',
  },
  {
    id: 'operation',
    name: 'How it works',
  },
  {
    id: 'stage',
    name: 'Availability',
  },
] as const;

export const faqItems = [
  {
    group: 'product',
    question: 'What is Austi?',
    answer:
      'Austi is an AI maintenance coordinator for property managers and multi-property landlords. It receives repair reports, gathers the details, follows the owner’s operating policies, coordinates an approved contractor and keeps the case moving until the work is recorded as complete.',
  },
  {
    group: 'product',
    question: 'What maintenance work does Austi handle?',
    answer:
      'The closed alpha covers the work around a repair: receiving the report, asking follow-up questions, assessing urgency, checking policy, requesting approval when needed, contacting contractors, scheduling access, sending updates, following up and recording the outcome.',
  },
  {
    group: 'product',
    question: 'Does Austi handle leasing, rent collection or inspections?',
    answer:
      'Not in the current alpha. Austi is focused on maintenance first. Leasing, rent collection, inspections and broader tenant support are planned for later.',
  },
  {
    group: 'product',
    question: 'How can tenants report a problem?',
    answer:
      'Reports can arrive by phone, email, WhatsApp, SMS or web chat. Messages from each channel stay attached to the same maintenance case.',
  },
  {
    group: 'operation',
    question: 'How much can Austi do without approval?',
    answer:
      'Within the maintenance workflow, Austi can carry out any action covered by policies set by the property owner. Those policies define urgency, responsibility, approval limits, contractor choices and the points where a manager must decide.',
  },
  {
    group: 'operation',
    question: 'Can we keep our existing contractors?',
    answer:
      'Yes. Austi works only with your existing contractor network. You choose the approved contractors for each property and trade.',
  },
  {
    group: 'operation',
    question: 'What happens when a case falls outside our policy?',
    answer:
      'The agent automatically notifies the manager, shares the information collected so far and waits for a decision. Work resumes once the manager gives direction.',
  },
  {
    group: 'operation',
    question: 'How does Austi handle emergencies?',
    answer:
      'Emergency reports follow the escalation policy set by the property owner. When the situation requires a decision outside Austi’s approved actions, the manager is notified automatically and the agent waits for direction.',
  },
  {
    group: 'operation',
    question: 'Does Austi replace our PMS?',
    answer:
      'No. Your PMS remains the source of truth. During the alpha, we are working with operators to decide which integrations and write-back workflows matter first, so we do not claim compatibility with named platforms yet.',
  },
  {
    group: 'operation',
    question: 'What does Austi record?',
    answer:
      'Reports, messages, policy checks, approvals, contractor responses, appointments and outcomes stay attached to the maintenance case. The final record is prepared for your PMS; how it is written back depends on your setup and the integrations chosen during the alpha.',
  },
  {
    group: 'stage',
    question: 'Who is Austi for?',
    answer:
      'The current alpha is designed for property managers and multi-property landlords in Lithuania and Poland.',
  },
  {
    group: 'stage',
    question: 'Is Austi available today?',
    answer:
      'The product is in closed alpha while we continue product and workflow discovery. There is no public self-service product or published pricing yet. Contact us to discuss your maintenance process and whether alpha testing is a fit.',
  },
  {
    group: 'stage',
    question: 'How is tenant and property data handled?',
    answer:
      'Because the product is still in closed alpha, we do not make production security or compliance claims. Contact us to discuss how data would be handled for a specific alpha test.',
  },
  {
    group: 'stage',
    question: 'What happens in the first conversation?',
    answer:
      'We review real maintenance cases from your portfolio and learn how your team handles reports, approvals, contractors, exceptions and PMS records. Contact us to arrange a conversation.',
  },
] as const;
