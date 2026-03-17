function parseDateInput(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function startOfWeek(dateInput = new Date()) {
  const date = new Date(dateInput);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function endOfWeek(dateInput = new Date()) {
  const date = startOfWeek(dateInput);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function getWeekRange(weekQuery) {
  const base = parseDateInput(weekQuery) || new Date();
  return {
    weekStart: startOfWeek(base),
    weekEnd: endOfWeek(base)
  };
}

module.exports = {
  parseDateInput,
  getWeekRange
};
