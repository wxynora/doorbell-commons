export const HUMAN_SESSION_COOKIE_NAME = "doorbell_session";
export const HUMAN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function secureAttribute(secure: boolean): string {
  return secure ? "; Secure" : "";
}

export function serializeHumanSessionCookie(token: string, secure: boolean): string {
  return `${HUMAN_SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${HUMAN_SESSION_MAX_AGE_SECONDS}${secureAttribute(secure)}`;
}

export function serializeClearedHumanSessionCookie(secure: boolean): string {
  return `${HUMAN_SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0${secureAttribute(secure)}`;
}

export function readHumanSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const section of cookieHeader.split(";")) {
    const separatorIndex = section.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = section.slice(0, separatorIndex).trim();
    if (name === HUMAN_SESSION_COOKIE_NAME) {
      const token = section.slice(separatorIndex + 1).trim();
      return token || undefined;
    }
  }
  return undefined;
}
