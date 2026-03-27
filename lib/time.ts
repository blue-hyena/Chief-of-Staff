function getOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const timeZoneName = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!timeZoneName) {
    throw new Error(`Unable to determine UTC offset for ${timeZone}`);
  }

  const match = timeZoneName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    return 0;
  }

  const [, sign, hours, minutes] = match;
  const totalMinutes =
    Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes ?? "0", 10);

  return sign === "-" ? -totalMinutes : totalMinutes;
}

export function getLocalDateString(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

export function addDaysToLocalDate(localDate: string, days: number) {
  const [year, month, day] = localDate.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid local date: ${localDate}`);
  }

  const adjusted = new Date(Date.UTC(year, month - 1, day + days));
  const adjustedYear = adjusted.getUTCFullYear();
  const adjustedMonth = String(adjusted.getUTCMonth() + 1).padStart(2, "0");
  const adjustedDay = String(adjusted.getUTCDate()).padStart(2, "0");

  return `${adjustedYear}-${adjustedMonth}-${adjustedDay}`;
}

export function getUtcRangeForLocalDate(localDate: string, timeZone: string) {
  const [year, month, day] = localDate.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid local date: ${localDate}`);
  }

  const startProbe = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const endProbe = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const startOffsetMinutes = getOffsetMinutes(startProbe, timeZone);
  const endOffsetMinutes = getOffsetMinutes(endProbe, timeZone);

  const startUtc = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0) - startOffsetMinutes * 60_000,
  );
  const endUtc = new Date(
    Date.UTC(year, month - 1, day, 23, 59, 59, 999) -
      endOffsetMinutes * 60_000,
  );

  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
  };
}

export function formatDisplayDate(localDate: string, timeZone: string) {
  const { startIso } = getUtcRangeForLocalDate(localDate, timeZone);

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startIso));
}

export function formatLocalDateTime(isoDate: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
