// Line drawings behind the three study cards. They use currentColor, so they turn
// white on the selected (blue) card, and stay faint so the text reads first.

import type { Tab } from "../url";

const common = {
  viewBox: "0 0 120 120",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  className: "choose-art",
};

/** A clipboard with a questionnaire: tick boxes and answer lines. */
function Clipboard() {
  return (
    <svg {...common}>
      <rect x="20" y="16" width="80" height="98" rx="7" />
      <path d="M46 16v-4a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v4" />
      <rect x="42" y="12" width="36" height="12" rx="3" />
      <rect x="32" y="38" width="10" height="10" rx="1.5" />
      <path d="M52 41h34M52 46h22" />
      <rect x="32" y="60" width="10" height="10" rx="1.5" />
      <path d="M34 65l3 3 6-8" />
      <path d="M52 63h34M52 68h26" />
      <rect x="32" y="82" width="10" height="10" rx="1.5" />
      <path d="M52 85h34M52 90h18" />
    </svg>
  );
}

/** Two flasks filled to different levels: a control and a treatment group. */
function Flasks() {
  return (
    <svg {...common}>
      <path d="M26 18h18M30 18v26L13 84q-3 8 6 8h32q9 0 6-8L40 44V18" />
      <path d="M20 72h30" />
      <circle cx="30" cy="80" r="2" />
      <circle cx="38" cy="84" r="1.5" />
      <path d="M72 18h18M76 18v26L59 84q-3 8 6 8h32q9 0 6-8L86 44V18" />
      <path d="M71 58h20" />
      <circle cx="78" cy="70" r="2" />
      <circle cx="86" cy="78" r="1.5" />
      <circle cx="74" cy="84" r="1.5" />
      <path d="M22 106h76" />
    </svg>
  );
}

/** Two concentration–time curves (test and reference) and a capsule. */
function PkCurves() {
  return (
    <svg {...common}>
      <path d="M14 14v92h96" />
      <path d="M14 104C22 40 32 30 42 34S70 80 108 98" />
      <path d="M14 104C24 48 34 38 46 42S74 84 108 100" strokeDasharray="5 5" />
      <g transform="rotate(-35 88 30)">
        <rect x="72" y="22" width="32" height="16" rx="8" />
        <path d="M88 22v16" />
      </g>
    </svg>
  );
}

export function TabArt({ tab }: { tab: Tab }) {
  return tab === "apklausa" ? <Clipboard /> : tab === "grupes" ? <Flasks /> : <PkCurves />;
}
