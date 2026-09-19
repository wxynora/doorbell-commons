export const DOORBELL_FARM_PATH = "/lingye/farm" as const;
export const MID_AUTUMN_PATH = "/lingye/mid-autumn" as const;

export function isDoorbellFarmPath(pathname: string): boolean {
  return pathname === DOORBELL_FARM_PATH || pathname === `${DOORBELL_FARM_PATH}/`;
}

export function isMidAutumnPath(pathname: string): boolean {
  return pathname === MID_AUTUMN_PATH || pathname === `${MID_AUTUMN_PATH}/`;
}
