import type { DemoTab } from '../lib/demo-session';

const paths = {
  Approvals: 'M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 14l3 3 5-6',
  Contractors: 'M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z',
  'Case record': 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M7 17 17 7M7 7h10v10',
} satisfies Record<DemoTab | 'plus' | 'arrow', string>;

export function DemoIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
      <path d={paths[name]} />
    </svg>
  );
}
