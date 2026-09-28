import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true } as const;

/** Bar and triangle, after VS Code's debug-continue. */
export function ContinueIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="3" width="1.75" height="10" rx="0.5" />
      <path d="M6 3.2v9.6a.5.5 0 0 0 .77.42l7.2-4.8a.5.5 0 0 0 0-.84l-7.2-4.8A.5.5 0 0 0 6 3.2Z" />
    </svg>
  );
}

/** Arrow down into a dot, after VS Code's debug-step-into. */
export function StepIntoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 1.5a.75.75 0 0 1 .75.75v5.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V2.25A.75.75 0 0 1 8 1.5Z" />
      <circle cx="8" cy="13" r="1.75" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="3" width="2.5" height="10" rx="0.5" />
      <rect x="9.5" y="3" width="2.5" height="10" rx="0.5" />
    </svg>
  );
}
