import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square' as const,
  'aria-hidden': true,
  ...props,
});

export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 13l1-3 7-7 2 2-7 7-3 1z" />
  </svg>
);
export const EraserIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 13h7M2.5 9.5l6-6 4 4-5.5 5.5H5z" />
  </svg>
);
export const PickerIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10 2l4 4-2 1-5 5-3 1 1-3 5-5z" />
  </svg>
);
export const FillIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 2l6 6-5 5-6-6zM13 11v2" />
  </svg>
);
export const GridIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 2h12v12H2zM6 2v12M10 2v12M2 6h12M2 10h12" strokeWidth={1} />
  </svg>
);
export const CompareIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 1v14M2 3h4v10H2zM10 3h4v10h-4z" />
  </svg>
);
export const UndoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 4L2 7l3 3M2 7h8a4 4 0 010 8H7" />
  </svg>
);
export const RedoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M11 4l3 3-3 3M14 7H6a4 4 0 000 8h3" />
  </svg>
);
export const UpIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 10l4-4 4 4" />
  </svg>
);
export const DownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
export const DiceIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2.5 2.5h11v11h-11z" />
    <circle cx="5.5" cy="5.5" r="0.8" fill="currentColor" />
    <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor" />
    <circle cx="8" cy="8" r="0.8" fill="currentColor" />
  </svg>
);
