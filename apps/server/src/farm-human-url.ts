export class InvalidFarmHumanUrlError extends Error {
  constructor() {
    super("The submitted farm Human URL is invalid");
    this.name = "InvalidFarmHumanUrlError";
  }
}

function invalidFarmHumanUrl(): never {
  throw new InvalidFarmHumanUrlError();
}

function hasIllegalKeyCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === "/" || character === "\\" || codePoint < 32 || codePoint === 127) {
      return true;
    }
  }
  return false;
}

export function extractFarmHumanKey(farmHumanUrl: string, farmHumanUiBaseUrl: string): string {
  if (farmHumanUrl !== farmHumanUrl.trim() || farmHumanUrl.includes("\\")) {
    return invalidFarmHumanUrl();
  }

  let submitted: URL;
  let configuredBase: URL;
  try {
    submitted = new URL(farmHumanUrl);
    configuredBase = new URL(farmHumanUiBaseUrl);
  } catch {
    return invalidFarmHumanUrl();
  }

  if (!configuredBase.pathname.endsWith("/")) {
    configuredBase.pathname += "/";
  }
  configuredBase.search = "";
  configuredBase.hash = "";
  const configuredHumanUiRoot = new URL("ui/", configuredBase);

  if (
    (submitted.protocol !== "http:" && submitted.protocol !== "https:") ||
    submitted.origin !== configuredHumanUiRoot.origin ||
    submitted.username !== "" ||
    submitted.password !== "" ||
    !submitted.pathname.startsWith(configuredHumanUiRoot.pathname)
  ) {
    return invalidFarmHumanUrl();
  }

  const encodedKey = submitted.pathname
    .slice(configuredHumanUiRoot.pathname.length)
    .split("/", 1)[0];
  if (!encodedKey) {
    return invalidFarmHumanUrl();
  }

  let farmHumanKey: string;
  try {
    farmHumanKey = decodeURIComponent(encodedKey);
  } catch {
    return invalidFarmHumanUrl();
  }
  if (
    farmHumanKey.length === 0 ||
    farmHumanKey === "." ||
    farmHumanKey === ".." ||
    hasIllegalKeyCharacter(farmHumanKey)
  ) {
    return invalidFarmHumanUrl();
  }

  return farmHumanKey;
}

export function buildFarmHumanUrl(farmHumanKey: string, farmHumanUiBaseUrl: string): string {
  const configuredBase = new URL(farmHumanUiBaseUrl);
  if (!configuredBase.pathname.endsWith("/")) {
    configuredBase.pathname += "/";
  }
  configuredBase.search = "";
  configuredBase.hash = "";
  return new URL(`ui/${encodeURIComponent(farmHumanKey)}`, configuredBase).toString();
}
