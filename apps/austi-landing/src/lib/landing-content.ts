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
  { name: 'Ask', label: 'Start with what you want done' },
  { name: 'Build', label: 'Watch the idea find its interface' },
  { name: 'Open', label: 'Skip the recap. Open the app.' },
  { name: 'Keep', label: 'Change it without starting over' },
];
