import type { SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & { size?: number; strokeWidth?: number };

function base({ size = 15, strokeWidth = 1.4, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

const make = (body: React.ReactNode, opts?: { fill?: boolean }) => {
  const Icon = (p: IconProps) => (
    <svg {...base(p)} fill={opts?.fill ? 'currentColor' : 'none'} stroke={opts?.fill ? 'none' : 'currentColor'}>
      {body}
    </svg>
  );
  return Icon;
};

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

export const IconChevronUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 10 8 5.5 12.5 10" />
  </svg>
);

export const IconArrowDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 2.8v10.4M4.2 9.4 8 13.2l3.8-3.8" />
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

export const IconFolderOpen = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.2a1.5 1.5 0 0 1 1.2.6l.6.8h5A1.5 1.5 0 0 1 14 5.9v1.1" />
    <path d="M2 6h11.4a1 1 0 0 1 .97 1.24l-1.2 4.5A1.5 1.5 0 0 1 11.7 13H3.5A1.5 1.5 0 0 1 2 11.5z" />
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

export const IconMinus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 8h9" />
  </svg>
);

export const IconSparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 2.2 9.4 6 13.2 7.4 9.4 8.8 8 12.6 6.6 8.8 2.8 7.4 6.6 6z" />
    <path d="M12.4 11.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
  </svg>
);

export const IconSparkleSmall = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 2.4 7 5.4l3 1-3 1-1 3-1-3-3-1 3-1z" />
    <path d="M12 9.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
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

export const IconSliders = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 4.4h10M3 8h10M3 11.6h10" />
    <circle cx="6" cy="4.4" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="8" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="5" cy="11.6" r="1.5" fill="currentColor" stroke="none" />
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

export const IconGitFork = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="4.4" cy="3.4" r="1.5" />
    <circle cx="11.6" cy="3.4" r="1.5" />
    <circle cx="8" cy="12.6" r="1.5" />
    <path d="M4.4 4.9v1.3a2.4 2.4 0 0 0 2.4 2.4h2.4a2.4 2.4 0 0 0 2.4-2.4V4.9M8 8.6v2.5" />
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

export const IconCheckCircle = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.9" />
    <path d="m5.4 8.2 1.8 1.8 3.4-3.8" />
  </svg>
);

export const IconCircle = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.6" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 4.6V8l2.3 1.6" />
  </svg>
);

export const IconHistory = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" />
    <path d="M2.4 2.6v3.2h3.2" />
    <path d="M8 5.2V8l2 1.3" />
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

export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5.6" y="5.6" width="8" height="8" rx="1.6" />
    <path d="M10.4 5.6V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v4.8A1.6 1.6 0 0 0 4 10.4h1.6" />
  </svg>
);

export const IconPencil = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11.1 2.6a1.6 1.6 0 0 1 2.3 2.3l-7.2 7.2-3.1.8.8-3.1z" />
    <path d="m9.9 3.8 2.3 2.3" />
  </svg>
);

export const IconRewind = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.8 6.2h7.4a3.4 3.4 0 0 1 0 6.8H6.6" />
    <path d="M5.4 3 2.4 6.2l3 3.2" />
  </svg>
);

export const IconBook = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 3.2A1.2 1.2 0 0 1 4.2 2h8.4v10.6H4.4A1.4 1.4 0 0 0 3 14z" />
    <path d="M3 11.6A1.4 1.4 0 0 1 4.4 10.2h8.2" />
  </svg>
);

export const IconShield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 1.9 13 3.6v4.2c0 3-2 5.3-5 6.3-3-1-5-3.3-5-6.3V3.6z" />
    <path d="m5.8 7.9 1.6 1.6 2.9-3.2" />
  </svg>
);

export const IconWrench = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.6 2.2a3.4 3.4 0 0 0-3 5.4L2.9 12.3a1.1 1.1 0 0 0 1.6 1.6l4.7-4.7a3.4 3.4 0 0 0 4.5-4.4l-2 2-1.9-.5-.5-1.9z" />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2.4" y="3" width="11.2" height="10" rx="1.8" />
    <circle cx="6" cy="6.4" r="1.1" />
    <path d="m3.2 11.4 2.9-2.6 2.2 2 2-1.7 2.5 2.3" />
  </svg>
);

export const IconGlobe = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M2.4 8h11.2M8 2.2c1.6 1.7 2.4 3.6 2.4 5.8S9.6 12.1 8 13.8C6.4 12.1 5.6 10.2 5.6 8S6.4 3.9 8 2.2z" />
  </svg>
);

export const IconGrid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2.6" y="2.6" width="4.6" height="4.6" rx="1.2" />
    <rect x="8.8" y="2.6" width="4.6" height="4.6" rx="1.2" />
    <rect x="2.6" y="8.8" width="4.6" height="4.6" rx="1.2" />
    <rect x="8.8" y="8.8" width="4.6" height="4.6" rx="1.2" />
  </svg>
);

export const IconList = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 4h7.4M6 8h7.4M6 12h7.4" />
    <circle cx="3.2" cy="4" r=".9" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="8" r=".9" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="12" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconMore = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCommand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.6 5.6h4.8v4.8H5.6z" />
    <path d="M5.6 5.6V4.4a1.8 1.8 0 1 0-1.8 1.8h1.8M10.4 5.6V4.4a1.8 1.8 0 1 1 1.8 1.8h-1.8M5.6 10.4v1.2a1.8 1.8 0 1 1-1.8-1.8h1.8M10.4 10.4v1.2a1.8 1.8 0 1 0 1.8-1.8h-1.8" />
  </svg>
);

export const IconAt = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="2.6" />
    <path d="M10.6 5.4v3.4a1.8 1.8 0 0 0 3.1 1.2A5.8 5.8 0 1 0 11 13.4" />
  </svg>
);

export const IconPaperclip = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12.6 7.2 7.4 12.4a3 3 0 0 1-4.2-4.2l5.4-5.4a2 2 0 0 1 2.8 2.8l-5.3 5.3a1 1 0 0 1-1.4-1.4l4.8-4.8" />
  </svg>
);

export const IconInfo = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.9" />
    <path d="M8 7.2v3.6M8 5.4h.01" />
  </svg>
);

export const IconX = IconClose;
export const IconLoader = (p: IconProps) => (
  <svg {...base(p)} className={`spin ${p.className ?? ''}`}>
    <path d="M8 2.2a5.8 5.8 0 1 0 5.8 5.8" />
  </svg>
);

export const IconEye = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M1.8 8S4 4.2 8 4.2 14.2 8 14.2 8 12 11.8 8 11.8 1.8 8 1.8 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
);

export const IconPalette = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 2.2a5.8 5.8 0 0 0 0 11.6c.9 0 1.5-.6 1.5-1.4 0-.5-.2-.8-.5-1.1-.3-.3-.5-.6-.5-1 0-.8.6-1.4 1.4-1.4h1.2A3 3 0 0 0 14 5.9C13.6 3.8 11.1 2.2 8 2.2Z" />
    <circle cx="5.4" cy="6.2" r=".9" fill="currentColor" stroke="none" />
    <circle cx="7.6" cy="4.6" r=".9" fill="currentColor" stroke="none" />
    <circle cx="10.2" cy="6" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRobot = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.2" y="5.4" width="9.6" height="7" rx="2" />
    <path d="M8 2.4v3M6 8.6h.01M10 8.6h.01M6.4 11h3.2" />
    <circle cx="8" cy="2.2" r=".8" fill="currentColor" stroke="none" />
  </svg>
);

export const IconExit = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.4 2.6H12A1.4 1.4 0 0 1 13.4 4v8A1.4 1.4 0 0 1 12 13.4H9.4" />
    <path d="M2.6 8h7.2M7.2 5.4 9.8 8l-2.6 2.6" />
  </svg>
);

export const IconKeyboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="1.8" y="4" width="12.4" height="8" rx="1.6" />
    <path d="M4.4 6.6h.01M7 6.6h.01M9.6 6.6h.01M12 6.6h.01M5.4 9.4h5.2" />
  </svg>
);

export const IconPlug = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 2.4v3.2M10 2.4v3.2" />
    <path d="M4.4 5.6h7.2v3a3.6 3.6 0 0 1-3.6 3.6A3.6 3.6 0 0 1 4.4 8.6z" />
    <path d="M8 12.2v1.6" />
  </svg>
);
