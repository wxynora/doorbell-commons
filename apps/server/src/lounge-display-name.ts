/** Display only: registered identity and message bodies remain unchanged. */
export function loungeDisplayName(name: string): string {
  const separator = name.indexOf("&");
  return separator < 0 ? name : name.slice(separator + 1).trim() || name;
}
export function loungeHumanName(name: string): string {
  const separator = name.indexOf("&");
  return separator < 0 ? name : name.slice(0, separator).trim() || name;
}
