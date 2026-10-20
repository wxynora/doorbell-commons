export const DOORBELL_FARM_PATH = "/lingye/farm" as const;
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
