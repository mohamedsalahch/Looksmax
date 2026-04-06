export function formatStoreDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(value);
}
