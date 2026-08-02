export interface LaunchRow {
  task: string;
  owner: string;
  initials: string;
  due: string;
  blocker: string;
  status: 'In progress' | 'Planned';
  revisable?: boolean;
}

export const launchRows: LaunchRow[] = [
  { task: 'Landing page', owner: 'Maya', initials: 'MM', due: 'May 12', blocker: 'Copy review', status: 'In progress' },
  { task: 'Email campaign', owner: 'Jordan', initials: 'JO', due: 'May 13', blocker: 'Design assets', status: 'In progress' },
  { task: 'Product hunt', owner: 'Alex', initials: 'AK', due: 'May 14', blocker: 'Screenshots', status: 'Planned' },
  { task: 'Launch video', owner: 'Taylor', initials: 'TW', due: 'May 15', blocker: 'Script', status: 'Planned', revisable: true },
  { task: 'Blog post', owner: 'Casey', initials: 'CR', due: 'May 16', blocker: '—', status: 'Planned' },
  { task: 'Analytics setup', owner: 'Riley', initials: 'RS', due: 'May 16', blocker: 'Tracking doc', status: 'Planned' },
];

export const stages = [
  {
    name: 'Ask',
    label: 'Start with what you want done',
    copy: 'Describe the recurring work in plain language. No template, setup flow, or wiring required.',
  },
  {
    name: 'Build',
    label: 'Watch the idea find its interface',
    copy: 'Austi turns the request into structure, state, and controls you can see taking shape.',
  },
  {
    name: 'Open',
    label: 'Skip the recap. Open the app.',
    copy: 'The result is a real local tool you can reopen whenever the same work comes back.',
  },
  {
    name: 'Keep',
    label: 'Change it without starting over',
    copy: 'Revise the workflow in plain language while preserving the work already inside it.',
  },
];
