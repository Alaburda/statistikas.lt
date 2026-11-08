// Small drawings on the "what are you comparing?" buttons, so the six designs can be
// told apart at a glance. currentColor: they turn white on the selected button.

const common = {
  viewBox: "0 0 40 28",
  width: 40,
  height: 28,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  className: "seg-icon",
};

const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.9} fill="currentColor" stroke="none" />;

/** Two separate groups of dots, each with its mean. */
function Means() {
  return (
    <svg {...common}>
      <Dot x={8} y={18} /> <Dot x={12} y={22} /> <Dot x={11} y={14} /> <Dot x={15} y={19} />
      <path d="M5 18h12" />
      <Dot x={25} y={9} /> <Dot x={29} y={12} /> <Dot x={28} y={5} /> <Dot x={33} y={8} />
      <path d="M23 9h12" />
    </svg>
  );
}

/** The same people measured twice: lines join each before to its after. */
function Paired() {
  return (
    <svg {...common}>
      <path d="M9 4v20M31 4v20" strokeOpacity={0.35} />
      <path d="M9 21L31 12M9 16L31 7M9 24L31 18" />
      <Dot x={9} y={21} /> <Dot x={9} y={16} /> <Dot x={9} y={24} />
      <Dot x={31} y={12} /> <Dot x={31} y={7} /> <Dot x={31} y={18} />
    </svg>
  );
}

/** Two groups, each a yes/no share. */
function Props() {
  return (
    <svg {...common}>
      <rect x={7} y={3} width={10} height={22} rx={1.5} />
      <rect x={7} y={17} width={10} height={8} rx={1.5} fill="currentColor" fillOpacity={0.45} />
      <rect x={23} y={3} width={10} height={22} rx={1.5} />
      <rect x={23} y={11} width={10} height={14} rx={1.5} fill="currentColor" fillOpacity={0.45} />
    </svg>
  );
}

/** Two versions of a page. */
function Ab() {
  return (
    <svg {...common}>
      <rect x={3} y={4} width={15} height={20} rx={2} />
      <path d="M3 9h15M22 9h15" />
      <rect x={22} y={4} width={15} height={20} rx={2} />
      <text x={10.5} y={20.5} textAnchor="middle" fontSize={9} fontWeight={600} fill="currentColor" stroke="none">
        A
      </text>
      <text x={29.5} y={20.5} textAnchor="middle" fontSize={9} fontWeight={600} fill="currentColor" stroke="none">
        B
      </text>
    </svg>
  );
}

/** Three groups with their means. */
function Anova() {
  return (
    <svg {...common}>
      <Dot x={6} y={20} /> <Dot x={9} y={23} /> <Dot x={8} y={17} />
      <path d="M3 20h9" />
      <Dot x={18} y={13} /> <Dot x={22} y={16} /> <Dot x={20} y={10} />
      <path d="M15.5 13h9" />
      <Dot x={31} y={7} /> <Dot x={34} y={10} /> <Dot x={32} y={4} />
      <path d="M28 7h9" />
    </svg>
  );
}

/** A scatter with its trend line. */
function Corr() {
  return (
    <svg {...common}>
      <path d="M4 3v22h33" strokeOpacity={0.35} />
      <path d="M7 22L35 6" strokeOpacity={0.6} />
      <Dot x={9} y={19} /> <Dot x={13} y={21} /> <Dot x={16} y={15} /> <Dot x={21} y={16} /> <Dot x={25} y={10} /> <Dot x={30} y={11} />
      <Dot x={33} y={6} />
    </svg>
  );
}

export const DESIGN_ICONS = {
  means: <Means />,
  paired: <Paired />,
  props: <Props />,
  ab: <Ab />,
  anova: <Anova />,
  corr: <Corr />,
};
