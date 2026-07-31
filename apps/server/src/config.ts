export const COMMUNITY_QQ_GROUP_ID = "515831305";

export interface QqGroupEligibilityConfig {
  oneBotApiBaseUrl: string;
  oneBotApiToken: string;
  qqGroupId: typeof COMMUNITY_QQ_GROUP_ID;
}

function readRequiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readQqGroupEligibilityConfig(
  environment: NodeJS.ProcessEnv = process.env,
): QqGroupEligibilityConfig {
  const oneBotApiBaseUrl = readRequiredEnvironmentValue(environment, "ONEBOT_API_BASE_URL");
  const oneBotApiToken = readRequiredEnvironmentValue(environment, "ONEBOT_API_TOKEN");
  const qqGroupId = readRequiredEnvironmentValue(environment, "DOORBELL_QQ_GROUP_ID");

  const parsedBaseUrl = new URL(oneBotApiBaseUrl);
  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("ONEBOT_API_BASE_URL must use http or https");
  }

  if (qqGroupId !== COMMUNITY_QQ_GROUP_ID) {
    throw new Error(`DOORBELL_QQ_GROUP_ID must be ${COMMUNITY_QQ_GROUP_ID}`);
  }

  return {
    oneBotApiBaseUrl: parsedBaseUrl.toString(),
    oneBotApiToken,
    qqGroupId: COMMUNITY_QQ_GROUP_ID,
  };
}
