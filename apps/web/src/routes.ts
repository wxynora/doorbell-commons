export const DOORBELL_FARM_PATH = "/lingye/farm" as const;
export const SNOW_LIVE_PATH = "/lingye/snow-championship" as const;
export function isSnowLivePath(pathname: string): boolean {
  return pathname === SNOW_LIVE_PATH || pathname === `${SNOW_LIVE_PATH}/` ||
    pathname === "/lingye/snow-fort-live" || pathname === "/lingye/snow-fort-live/";
}
export const MID_AUTUMN_PATH = "/lingye/mid-autumn" as const;
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

export const MOMENTS_PATH = "/lingye/moments" as const;
export function isMomentsPath(pathname: string): boolean {
  return pathname === MOMENTS_PATH || pathname === `${MOMENTS_PATH}/`;
}
