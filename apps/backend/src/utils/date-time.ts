export function formatDateTimeDdMmYyyyHmAmPm(value: Date, timeZone?: string): string {
  const parts = getDateTimeParts(value, timeZone);
  if (!parts) {
    return "-";
  }

  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} ${parts.period}`;
}

function getDateTimeParts(value: Date, timeZone?: string): {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  period: string;
} | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const formatter = createFormatter(timeZone);
  const parts = formatter.formatToParts(value);

  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const period = parts.find((part) => part.type === "dayPeriod")?.value?.toUpperCase();

  if (!day || !month || !year || !hour || !minute || !period) {
    return null;
  }

  return {
    day,
    month,
    year,
    hour,
    minute,
    period
  };
}

function createFormatter(timeZone?: string): Intl.DateTimeFormat {
  const baseOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    hourCycle: "h12"
  };

  if (timeZone) {
    let tzFormatter: Intl.DateTimeFormat | null = null;
    try {
      tzFormatter = new Intl.DateTimeFormat("en-GB", {
        ...baseOptions,
        timeZone
      });
    } catch {
      tzFormatter = null;
    }

    if (tzFormatter) {
      return tzFormatter;
    }
  }

  return new Intl.DateTimeFormat("en-GB", baseOptions);
}
