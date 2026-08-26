export const DOORBELL_FARM_PATH = "/lingye/farm" as const;

export function isDoorbellFarmPath(pathname: string): boolean {
  return pathname === DOORBELL_FARM_PATH || pathname === `${DOORBELL_FARM_PATH}/`;
}
