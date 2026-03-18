export function startOfWeek(dateInput = new Date()) {
  const date = new Date(dateInput);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

export function addDays(dateInput, days) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return date;
}

export function toDateInputValue(dateInput) {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDayShort(dateInput) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short"
  }).format(new Date(dateInput));
}

export function formatMonthDay(dateInput) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(dateInput));
}

export function formatLongDate(dateInput) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(dateInput));
}

export function formatDateTime(dateInput) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateInput));
}

export function formatCalendarDate(dateInput) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateInput));
}

export function formatWeekRange(weekStartInput) {
  const weekStart = new Date(weekStartInput);
  const weekEnd = addDays(weekStart, 6);
  const startText = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(weekStart);
  const endText = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(weekEnd);
  return `${startText} - ${endText}`;
}

export function buildWeekDays(weekStartInput) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartInput, index));
}

export function sameDay(left, right) {
  return toDateInputValue(left) === toDateInputValue(right);
}

export function groupLiftsByDate(lifts) {
  return lifts.reduce((accumulator, lift) => {
    const key = toDateInputValue(lift.date);
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(lift);
    return accumulator;
  }, {});
}

export function buildWorkoutDayGroups(lifts) {
  const liftsByDate = groupLiftsByDate(lifts);

  return Object.entries(liftsByDate)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, groupedLifts], index) => ({
      key,
      date: new Date(groupedLifts[0].date),
      label: `Day ${index + 1}`,
      lifts: groupedLifts
    }));
}

function getLiftBlockLabel(lift) {
  if (typeof lift.blockLabel === "string" && lift.blockLabel.trim()) {
    return lift.blockLabel.trim();
  }

  if (typeof lift.notes === "string") {
    if (/(^|\|)\s*Prep\b/i.test(lift.notes)) {
      return "Prep";
    }
  }

  return "Workout";
}

export function groupLiftsByBlock(lifts) {
  const groups = new Map();
  const pendingLifts = [];

  for (const lift of lifts) {
    const label = getLiftBlockLabel(lift);

    if (/^Block\s+\d+$/i.test(label)) {
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label).push(lift);
      continue;
    }

    pendingLifts.push(lift);
  }

  if (groups.size === 0 && pendingLifts.length > 0) {
    groups.set("Block 1", [...pendingLifts]);
  } else if (groups.size > 0 && pendingLifts.length > 0) {
    const firstBlockLabel = groups.keys().next().value;
    groups.set(firstBlockLabel, [...pendingLifts, ...groups.get(firstBlockLabel)]);
  }

  return Array.from(groups.entries()).map(([label, groupedLifts]) => ({
    label,
    lifts: groupedLifts
  }));
}
