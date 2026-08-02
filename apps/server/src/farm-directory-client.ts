export interface FarmDirectoryEntry {
  farmDoorplate: string;
  farmName: string;
}

export interface FarmDirectoryReader {
  lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry>;
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

interface FarmDirectoryClientOptions {
  apiBaseUrl: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class FarmDirectoryClient implements FarmDirectoryReader {
  readonly #apiBaseUrl: URL;

  constructor(options: FarmDirectoryClientOptions) {
    this.#apiBaseUrl = new URL(options.apiBaseUrl);
    if (!this.#apiBaseUrl.pathname.endsWith("/")) {
      this.#apiBaseUrl.pathname += "/";
    }
  }

  async lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry> {
    const url = new URL("c", this.#apiBaseUrl);
    url.searchParams.set("a", "visit");
    url.searchParams.set("farm", farmDoorplate);
    url.searchParams.set("detail", "true");

    let response: Response;
    try {
      response = await fetch(url, { method: "GET" });
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

    if (!response.ok || !isObject(payload) || payload.ok !== true || !isObject(payload.farm)) {
      throw new FarmDirectoryUnavailableError("Farm directory returned an invalid response");
    }

    const farmDoorplateFromResponse = payload.farm.id;
    const farmName = payload.farm.name;
    if (farmDoorplateFromResponse !== farmDoorplate || typeof farmName !== "string") {
      throw new FarmDirectoryUnavailableError("Farm directory returned an invalid farm record");
    }

    return {
      farmDoorplate: farmDoorplateFromResponse,
      farmName,
    };
  }
}
