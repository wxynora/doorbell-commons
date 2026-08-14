export interface FarmDirectoryEntry {
  aiName?: string;
  farmDoorplate: string;
  farmName: string;
  humanName?: string;
}

export interface BoundFarmPlot {
  plotId: number;
  state: "empty" | "growing" | "ripe";
  seedType: string | null;
  watered: number;
}

export interface BoundFarmOverview extends FarmDirectoryEntry {
  plots: BoundFarmPlot[];
}

export interface FarmHumanPage {
  html: string;
}

export interface FarmHumanActionRedirect {
  location: string;
}

export interface FarmDirectoryReader {
  lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry>;
  lookupFarmByHumanKey(farmHumanKey: string): Promise<FarmDirectoryEntry>;
  readFarmOverview(farmDoorplate: string): Promise<BoundFarmOverview>;
  readFarmHumanPage(
    farmHumanKey: string,
    pagePath: string,
    query: URLSearchParams,
  ): Promise<FarmHumanPage>;
  submitFarmHumanAction(
    farmHumanKey: string,
    actionPath: string,
    form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect>;
}

export class FarmNotFoundError extends Error {
  constructor(farmDoorplate: string) {
    super(`Farm ${farmDoorplate} was not found`);
    this.name = "FarmNotFoundError";
  }
}

export class FarmDirectoryUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FarmDirectoryUnavailableError";
  }
}

export class FarmNotPubliclyReadableError extends Error {
  constructor(farmDoorplate: string) {
    super(`Farm ${farmDoorplate} is not publicly readable`);
    this.name = "FarmNotPubliclyReadableError";
  }
}

export class FarmHumanCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is invalid");
    this.name = "FarmHumanCredentialInvalidError";
  }
}

export class FarmUpstreamContractUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmUpstreamContractUnavailableError";
  }
}

interface FarmDirectoryClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#([0-9]+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string) => {
      if (decimal) {
        const codePoint = Number.parseInt(decimal, 10);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
      }
      if (hexadecimal) {
        const codePoint = Number.parseInt(hexadecimal, 16);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
      }
      const namedEntities: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: "\u00a0",
        quot: '"',
      };
      return namedEntities[named.toLowerCase()] ?? entity;
    },
  );
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function readAttributes(tag: string): Map<string, string | null> {
  const attributes = new Map<string, string | null>();
  const tagNameEnd = tag.search(/\s|\/?>/);
  const source = tagNameEnd === -1 ? "" : tag.slice(tagNameEnd);
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || name === "/") {
      continue;
    }
    attributes.set(name, decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function hasClass(attributes: Map<string, string | null>, className: string): boolean {
  return (attributes.get("class") ?? "").split(/\s+/).includes(className);
}

function extractBalancedDivBody(html: string, startIndex: number, openingTag: string): string {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = startIndex + openingTag.length;
  let depth = 1;
  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) {
      return html.slice(startIndex + openingTag.length, match.index);
    }
  }
  return "";
}

function directChildElementBodies(html: string, targetTagName: string): string[] {
  const bodies: string[] = [];
  const voidElements = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  const tagPattern = /<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi;
  let depth = 0;
  let directTargetStart: number | undefined;
  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    const tagName = (match[1] ?? "").toLowerCase();
    const closing = /^<\//.test(match[0]);
    if (closing) {
      if (depth > 0) {
        depth -= 1;
      }
      if (depth === 0 && directTargetStart !== undefined && tagName === targetTagName) {
        bodies.push(html.slice(directTargetStart, match.index));
        directTargetStart = undefined;
      }
      continue;
    }

    const selfClosing = /\/\s*>$/.test(match[0]) || voidElements.has(tagName);
    if (depth === 0 && tagName === targetTagName && !selfClosing) {
      directTargetStart = tagPattern.lastIndex;
    }
    if (!selfClosing) {
      depth += 1;
    }
  }
  return bodies;
}

function parseFarmIdentityPage(html: string): FarmDirectoryEntry {
  const plaqueBodies: string[] = [];
  const divPattern = /<div\b[^>]*>/gi;
  for (const match of html.matchAll(divPattern)) {
    if (hasClass(readAttributes(match[0]), "plaque")) {
      plaqueBodies.push(extractBalancedDivBody(html, match.index ?? 0, match[0]));
    }
  }

  const identityHeadings = plaqueBodies.flatMap((body) =>
    directChildElementBodies(body, "h1")
      .map(normalizeText)
      .filter((text) => text === "✍️ TA的农场"),
  );
  if (identityHeadings.length !== 1) {
    throw new FarmUpstreamContractUnavailableError("Farm identity page sentinel is unavailable");
  }

  const doorplateCandidates = plaqueBodies.flatMap((body) =>
    [...body.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
      .filter((match) =>
        hasClass(readAttributes(match[0].slice(0, match[0].indexOf(">") + 1)), "tag"),
      )
      .filter((match) => normalizeText((match[1] ?? "").split("<", 1)[0] ?? "") === "🏠 门牌号")
      .map((match) => {
        const directBold = directChildElementBodies(match[1] ?? "", "b");
        return directBold.length === 1 ? normalizeText(directBold[0] ?? "") : "";
      }),
  );
  if (doorplateCandidates.length !== 1 || !doorplateCandidates[0]) {
    throw new FarmUpstreamContractUnavailableError("Farm identity doorplate is unavailable");
  }

  const identityCandidates = {
    aiName: [] as string[],
    farmName: [] as string[],
    humanName: [] as string[],
  };
  for (const formMatch of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)) {
    const openingTag = formMatch[0].slice(0, formMatch[0].indexOf(">") + 1);
    const formAttributes = readAttributes(openingTag);
    if (
      formAttributes.get("method")?.toLowerCase() !== "post" ||
      !formAttributes.get("action")?.endsWith("/ta/names")
    ) {
      continue;
    }
    for (const inputMatch of formMatch[0].matchAll(/<input\b[^>]*>/gi)) {
      const attributes = readAttributes(inputMatch[0]);
      const name = attributes.get("name");
      if (
        (name === "farmName" || name === "aiName" || name === "humanName") &&
        attributes.has("value")
      ) {
        identityCandidates[name].push((attributes.get("value") ?? "").trim());
      }
    }
  }
  if (
    identityCandidates.farmName.length !== 1 ||
    !identityCandidates.farmName[0] ||
    identityCandidates.aiName.length !== 1 ||
    identityCandidates.humanName.length !== 1
  ) {
    throw new FarmUpstreamContractUnavailableError("Farm identity name is unavailable");
  }

  return {
    ...(identityCandidates.aiName[0] ? { aiName: identityCandidates.aiName[0] } : {}),
    farmDoorplate: doorplateCandidates[0],
    farmName: identityCandidates.farmName[0],
    ...(identityCandidates.humanName[0] ? { humanName: identityCandidates.humanName[0] } : {}),
  };
}

function escapeHtmlAttribute(value: string, quote: string): string {
  return value.replaceAll("&", "&amp;").replaceAll(quote, quote === '"' ? "&quot;" : "&#39;");
}

function farmUiSuffix(url: URL, farmHumanKey: string): string | undefined {
  const segments = url.pathname.split("/");
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] !== "ui") {
      continue;
    }
    let decodedKey: string;
    try {
      decodedKey = decodeURIComponent(segments[index + 1] ?? "");
    } catch {
      continue;
    }
    if (decodedKey === farmHumanKey) {
      const suffix = segments.slice(index + 2).join("/");
      return suffix ? `/${suffix}` : "";
    }
  }
  return undefined;
}

function localFarmUiLocation(suffix: string, search: string, hash: string): string {
  const path =
    suffix === "/glimmer"
      ? "/api/lingye-glimmer"
      : suffix === "/together"
        ? "/api/lingye-together"
        : `/api/farm/ui${suffix}`;
  return `${path}${search}${hash}`;
}

function assertHumanKeyAbsent(value: string, farmHumanKey: string): void {
  const decoded = decodeHtmlEntities(value);
  if (decoded.includes(farmHumanKey) || decoded.includes(encodeURIComponent(farmHumanKey))) {
    throw new FarmUpstreamContractUnavailableError("Farm response could not be safely rewritten");
  }
}

function rewriteFarmHtml(html: string, apiBaseUrl: URL, farmHumanKey: string): string {
  const rewritten = html.replace(
    /\b(href|action)\s*=\s*(["'])([\s\S]*?)\2/gi,
    (attribute, name: string, quote: string, encodedValue: string) => {
      const value = decodeHtmlEntities(encodedValue);
      let url: URL;
      try {
        url = new URL(value, apiBaseUrl);
      } catch {
        return attribute;
      }
      const suffix = farmUiSuffix(url, farmHumanKey);
      if (suffix === undefined) {
        return attribute;
      }
      const location = localFarmUiLocation(suffix, url.search, url.hash);
      return `${name}=${quote}${escapeHtmlAttribute(location, quote)}${quote}`;
    },
  );
  assertHumanKeyAbsent(rewritten, farmHumanKey);
  return rewritten;
}

function rewriteFarmLocation(location: string, apiBaseUrl: URL, farmHumanKey: string): string {
  let url: URL;
  try {
    url = new URL(decodeHtmlEntities(location), apiBaseUrl);
  } catch {
    throw new FarmUpstreamContractUnavailableError("Farm redirect is invalid");
  }
  const suffix = farmUiSuffix(url, farmHumanKey);
  if (suffix === undefined) {
    throw new FarmUpstreamContractUnavailableError("Farm redirect is outside the bound farm UI");
  }
  const rewritten = localFarmUiLocation(suffix, url.search, url.hash);
  assertHumanKeyAbsent(rewritten, farmHumanKey);
  return rewritten;
}

export class FarmDirectoryClient implements FarmDirectoryReader {
  readonly #apiBaseUrl: URL;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmDirectoryClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm request timeout must be a positive integer in milliseconds");
    }
    this.#apiBaseUrl = new URL(options.apiBaseUrl);
    this.#requestTimeoutMs = options.requestTimeoutMs;
    if (!this.#apiBaseUrl.pathname.endsWith("/")) {
      this.#apiBaseUrl.pathname += "/";
    }
  }

  async lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry> {
    const farm = await this.#readPublicFarm(farmDoorplate);
    const farmDoorplateFromResponse = farm.id;
    const farmName = farm.name;
    if (farmDoorplateFromResponse !== farmDoorplate || typeof farmName !== "string") {
      throw new FarmDirectoryUnavailableError("Farm directory returned an invalid farm record");
    }

    return {
      farmDoorplate: farmDoorplateFromResponse,
      farmName,
    };
  }

  async lookupFarmByHumanKey(farmHumanKey: string): Promise<FarmDirectoryEntry> {
    const response = await this.#requestHumanUi(farmHumanKey, "ta", new URLSearchParams(), "GET");
    if (response.status === 404) {
      throw new FarmHumanCredentialInvalidError();
    }
    if (!response.ok) {
      throw new FarmDirectoryUnavailableError("Farm human-credential lookup failed");
    }
    this.#assertHtmlResponse(response);
    try {
      return parseFarmIdentityPage(await response.text());
    } catch (error) {
      if (error instanceof FarmUpstreamContractUnavailableError) {
        throw error;
      }
      throw new FarmDirectoryUnavailableError("Farm human-credential response failed", {
        cause: error,
      });
    }
  }

  async readFarmOverview(farmDoorplate: string): Promise<BoundFarmOverview> {
    const farm = await this.#readPublicFarm(farmDoorplate);
    const farmDoorplateFromResponse = farm.id;
    const farmName = farm.name;
    if (
      farmDoorplateFromResponse !== farmDoorplate ||
      typeof farmName !== "string" ||
      !Array.isArray(farm.plots)
    ) {
      throw new FarmDirectoryUnavailableError("Farm directory returned an invalid farm overview");
    }

    const plots = farm.plots.map<BoundFarmPlot>((plot) => {
      if (
        !isObject(plot) ||
        typeof plot.id !== "number" ||
        !Number.isInteger(plot.id) ||
        plot.id <= 0 ||
        (plot.state !== "empty" && plot.state !== "growing" && plot.state !== "ripe") ||
        (plot.seedType !== null && typeof plot.seedType !== "string") ||
        typeof plot.watered !== "number" ||
        !Number.isInteger(plot.watered) ||
        plot.watered < 0
      ) {
        throw new FarmDirectoryUnavailableError("Farm directory returned an invalid farm plot");
      }
      return {
        plotId: plot.id,
        state: plot.state,
        seedType: plot.seedType,
        watered: plot.watered,
      };
    });

    return {
      farmDoorplate: farmDoorplateFromResponse,
      farmName,
      plots,
    };
  }

  async readFarmHumanPage(
    farmHumanKey: string,
    pagePath: string,
    query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    const response = await this.#requestHumanUi(farmHumanKey, pagePath, query, "GET");
    if (response.status === 404) {
      throw new FarmHumanCredentialInvalidError();
    }
    if (!response.ok) {
      throw new FarmDirectoryUnavailableError("Farm human page request failed");
    }
    this.#assertHtmlResponse(response);
    try {
      return {
        html: rewriteFarmHtml(await response.text(), this.#apiBaseUrl, farmHumanKey),
      };
    } catch (error) {
      if (error instanceof FarmUpstreamContractUnavailableError) {
        throw error;
      }
      throw new FarmDirectoryUnavailableError("Farm human page response failed", { cause: error });
    }
  }

  async submitFarmHumanAction(
    farmHumanKey: string,
    actionPath: string,
    form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    const response = await this.#requestHumanUi(farmHumanKey, actionPath, form, "POST");
    if (response.status === 404) {
      throw new FarmHumanCredentialInvalidError();
    }
    if (response.status !== 303) {
      throw new FarmDirectoryUnavailableError("Farm human action returned an invalid status");
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new FarmUpstreamContractUnavailableError("Farm action redirect is unavailable");
    }
    return {
      location: rewriteFarmLocation(location, this.#apiBaseUrl, farmHumanKey),
    };
  }

  async #requestHumanUi(
    farmHumanKey: string,
    routePath: string,
    parameters: URLSearchParams,
    method: "GET" | "POST",
  ): Promise<Response> {
    const suffix = routePath ? `/${routePath}` : "";
    const url = new URL(`ui/${encodeURIComponent(farmHumanKey)}${suffix}`, this.#apiBaseUrl);
    const requestInit: RequestInit = {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    };
    if (method === "GET") {
      url.search = parameters.toString();
    } else {
      requestInit.headers = { "content-type": "application/x-www-form-urlencoded" };
      requestInit.body = parameters.toString();
    }

    try {
      return await fetch(url, requestInit);
    } catch (error) {
      throw new FarmDirectoryUnavailableError("Farm human UI request failed", { cause: error });
    }
  }

  #assertHtmlResponse(response: Response): void {
    if (
      response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "text/html"
    ) {
      throw new FarmUpstreamContractUnavailableError("Farm human UI did not return HTML");
    }
  }

  async #readPublicFarm(farmDoorplate: string): Promise<Record<string, unknown>> {
    const url = new URL("c", this.#apiBaseUrl);
    url.searchParams.set("a", "visit");
    url.searchParams.set("farm", farmDoorplate);
    url.searchParams.set("detail", "true");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch (error) {
      throw new FarmDirectoryUnavailableError("Farm directory request failed", {
        cause: error,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new FarmDirectoryUnavailableError("Farm directory returned invalid JSON", {
        cause: error,
      });
    }

    if (
      response.status === 400 &&
      isObject(payload) &&
      payload.ok === false &&
      payload.text === `找不到农场 ${farmDoorplate}`
    ) {
      throw new FarmNotFoundError(farmDoorplate);
    }

    if (response.status === 403 && isObject(payload) && payload.ok === false) {
      throw new FarmNotPubliclyReadableError(farmDoorplate);
    }

    if (!response.ok || !isObject(payload) || payload.ok !== true || !isObject(payload.farm)) {
      throw new FarmDirectoryUnavailableError("Farm directory returned an invalid response");
    }

    return payload.farm;
  }
}
