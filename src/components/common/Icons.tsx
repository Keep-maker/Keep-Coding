import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 15, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </svg>
);

export const IconFile = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6z" />
    <path d="M9 2v4h4" />
  </svg>
);

export const IconFolder = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.2a1.5 1.5 0 0 1 1.2.6l.6.8h5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
  </svg>
);

export const IconFileCode = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.2 6 4 8l2.2 2M9.8 6 12 8l-2.2 2" />
    <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 2.8 2.8" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const IconSparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 2.2 9.4 6 13.2 7.4 9.4 8.8 8 12.6 6.6 8.8 2.8 7.4 6.6 6z" />
    <path d="M12.4 11.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
  </svg>
);

export const IconLayers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 2 2.5 5 8 8l5.5-3z" />
    <path d="M2.5 8.4 8 11.4l5.5-3" />
    <path d="M2.5 11.6 8 14.6l5.5-3" />
  </svg>
);

export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7 3.5 3.5" />
  </svg>
);

export const IconTerminal = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.8" />
    <path d="m5 6.6 1.8 1.8L5 10.2M8.6 10.6h2.6" />
  </svg>
);

export const IconDiff = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.6 2.6v10.8M11.4 2.6v10.8" />
    <circle cx="4.6" cy="5" r="1.5" />
    <circle cx="4.6" cy="11" r="1.5" />
    <circle cx="11.4" cy="8" r="1.5" />
    <path d="M6.1 5h3.8M6.1 11h3.8M11.4 6.5 9.9 8l1.5 1.5" />
  </svg>
);

export const IconStop = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSend = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.6 8 13.4 3 10.4 13 8 9.4z" />
    <path d="M8 9.4 13.4 3" />
  </svg>
);

export const IconBranch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="4.5" cy="3.6" r="1.6" />
    <circle cx="4.5" cy="12.4" r="1.6" />
    <circle cx="11.5" cy="6.4" r="1.6" />
    <path d="M4.5 5.2v5.6M11.5 8c0 2-1.7 2.6-3.4 3" />
  </svg>
);

export const IconWarning = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7.1 2.9 1.9 12a1 1 0 0 0 .9 1.5h10.4A1 1 0 0 0 14.1 12L8.9 2.9a1 1 0 0 0-1.8 0Z" />
    <path d="M8 6.2v3.1M8 11.4h.01" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m3.4 8.4 3 3 6.2-6.6" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 4.6V8l2.3 1.6" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.4 4.4h9.2M6.4 4.4V3.2h3.2v1.2M4.6 4.4l.6 8.2a1.2 1.2 0 0 0 1.2 1.1h3.2a1.2 1.2 0 0 0 1.2-1.1l.6-8.2" />
  </svg>
);

export const IconRefresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" />
    <path d="M13.4 2.4v3.2h-3.2" />
  </svg>
);
