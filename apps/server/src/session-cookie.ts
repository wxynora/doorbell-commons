export const HUMAN_SESSION_COOKIE_NAME = "doorbell_session";

function secureAttribute(secure: boolean): string {
  return secure ? "; Secure" : "";
}

export function serializeHumanSessionCookie(token: string, secure: boolean): string {
  return `${HUMAN_SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/${secureAttribute(secure)}`;
}

export function serializeClearedHumanSessionCookie(secure: boolean): string {
  return `${HUMAN_SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttribute(secure)}`;
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
