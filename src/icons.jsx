const svgProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "currentColor",
  "aria-hidden": "true",
  focusable: "false",
};

export function GripIcon() {
  return (
    <svg {...svgProps}>
      {[4, 8, 12].map((y) => (
        <g key={y}>
          <circle cx="5.5" cy={y} r="1.3" />
          <circle cx="10.5" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  );
}

export function ChevronUpIcon() {
  return (
    <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10.5 8 6l4.5 4.5" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5 8 10l4.5-4.5" />
    </svg>
  );
}

export function ImageIcon() {
  return (
    <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2" />
      <circle cx="5.6" cy="6.4" r="1.2" />
      <path d="m2.5 12 3.4-3.4 2.6 2.6 2-2 3 2.8" />
    </svg>
  );
}

export function ChecklistIcon() {
  return (
    <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="2.5" />
      <path d="m5.2 8.2 2 2 3.6-4" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.6.6" />
      <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.6-.6" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.2c1.9-.7 4-.5 6 .8 2-1.3 4.1-1.5 6-.8v9c-1.9-.7-4-.5-6 .8-2-1.3-4.1-1.5-6-.8z" />
      <path d="M8 4v9" />
    </svg>
  );
}
