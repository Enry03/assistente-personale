export const TZ = "Europe/Rome";

export function formatDateTime(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

/** Data di oggi a Roma come YYYY-MM-DD. */
export function todayInRome(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Inizio e fine (ISO, UTC) del giorno indicato nel fuso di Roma. */
export function romeDayRange(day = todayInRome(), plusDays = 0) {
  const offsetFor = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value; // es. GMT+01:00
    const m = parts?.match(/GMT([+-]\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "+00:00";
  };
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + plusDays);
  const d = base.toISOString().slice(0, 10);
  const start = new Date(`${d}T00:00:00${offsetFor(base)}`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function nowInRomeLabel(now = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
}

/** Converte data (YYYY-MM-DD) e ora (HH:MM) locali di Roma in ISO UTC, ora legale inclusa. */
export function romeLocalToIso(date: string, time = "09:00") {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = parts?.match(/GMT([+-]\d{2}):(\d{2})/);
  const offset = m ? `${m[1]}:${m[2]}` : "+00:00";
  return new Date(`${date}T${time}:00${offset}`).toISOString();
}
