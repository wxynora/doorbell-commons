export const DOORBELL_FARM_PATH = "/lingye/farm" as const;
export const SNOW_LIVE_PATH = "/lingye/snow-fort-live" as const;
export function isSnowLivePath(pathname: string): boolean {
  return pathname === SNOW_LIVE_PATH || pathname === `${SNOW_LIVE_PATH}/`;
}
export const MID_AUTUMN_PATH = "/lingye/mid-autumn" as const;
export const HALLOWEEN_PATH = "/lingye/halloween" as const;
export const CONSTABLE_INTERVIEW_PATH = "/lingye/constable-interview" as const;

export function isConstableInterviewPath(pathname: string): boolean {
  return pathname === CONSTABLE_INTERVIEW_PATH || pathname === `${CONSTABLE_INTERVIEW_PATH}/`;
}

export function isDoorbellFarmPath(pathname: string): boolean {
  return pathname === DOORBELL_FARM_PATH || pathname === `${DOORBELL_FARM_PATH}/`;
}

export function isMidAutumnPath(pathname: string): boolean {
  return pathname === MID_AUTUMN_PATH || pathname === `${MID_AUTUMN_PATH}/`;
}

export function isHalloweenPath(pathname: string): boolean {
  return pathname === HALLOWEEN_PATH || pathname === `${HALLOWEEN_PATH}/`;
}
