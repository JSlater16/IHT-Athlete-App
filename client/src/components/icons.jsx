/* Inline SVG icons, stroked with currentColor so they inherit the
   text color of their nav link / button. Thin 1.75 stroke matches
   the glass / Apple aesthetic rather than the heavier Lucide default. */

function Icon({ children, size = 22, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* Athlete tab-bar icons */

export function HomeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V20" />
    </Icon>
  );
}

export function ProfileIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c1.3-3.8 4.2-5.5 7.5-5.5s6.2 1.7 7.5 5.5" />
    </Icon>
  );
}

/* Coach sidebar icons */

export function AthletesIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1.2-3.5 3.7-5 6.5-5s5.3 1.5 6.5 5" />
      <circle cx="17" cy="6.5" r="2.5" />
      <path d="M16 13c2.6.2 4.5 1.8 5.5 5" />
    </Icon>
  );
}

export function WorkoutsIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6.5 12h11" />
      <rect x="2.25" y="9.5" width="2.5" height="5" rx="0.8" />
      <rect x="19.25" y="9.5" width="2.5" height="5" rx="0.8" />
      <rect x="4.75" y="10.5" width="2.25" height="3" rx="0.4" />
      <rect x="17" y="10.5" width="2.25" height="3" rx="0.4" />
    </Icon>
  );
}

export function AmitIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 12h3.5L9 5l4.5 14L16 12h5" />
    </Icon>
  );
}

export function StaffIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A2 2 0 0 1 10.5 3.5h3a2 2 0 0 1 2 2V7" />
      <path d="M3 13h18" />
    </Icon>
  );
}

export function AuditIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V5A1.5 1.5 0 0 1 8 3.5z" />
      <path d="M14.5 3.5V9h5" />
      <path d="M9.5 13h7" />
      <path d="M9.5 16.5h5" />
    </Icon>
  );
}

export function LeaderboardIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M4.5 5.5h2.5V8a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M19.5 5.5H17V8a2.5 2.5 0 0 0 2.5-2.5z" />
      <path d="M9 13.5h6l-.5 3.5h-5z" />
      <path d="M7 20h10" />
    </Icon>
  );
}

/* ForceDecks — stylized vertical bars (force plates / jump data).
   Reads as "performance" without leaning on a literal jump arc. */
export function ForceDecksIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 20V11" />
      <path d="M9 20V6" />
      <path d="M14 20V8" />
      <path d="M19 20V13" />
      <path d="M3 20h18" />
    </Icon>
  );
}
