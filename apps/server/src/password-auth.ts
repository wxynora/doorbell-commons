import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;
const CREDENTIAL_VERSION = "scrypt-v1";
const DUMMY_CREDENTIAL = [
  CREDENTIAL_VERSION,
  SCRYPT_COST,
  SCRYPT_BLOCK_SIZE,
  SCRYPT_PARALLELIZATION,
  Buffer.alloc(SCRYPT_SALT_LENGTH).toString("base64url"),
  Buffer.alloc(SCRYPT_KEY_LENGTH).toString("base64url"),
].join("$");
export function isValidHumanPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

async function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        maxmem: SCRYPT_MAX_MEMORY,
        p: SCRYPT_PARALLELIZATION,
        r: SCRYPT_BLOCK_SIZE,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });
}

export async function createHumanPasswordCredential(password: string): Promise<string> {
  if (!isValidHumanPassword(password)) {
    throw new Error("Human password must contain 8 to 128 characters");
  }
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const key = await derivePasswordKey(password, salt);
  return [
    CREDENTIAL_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyHumanPassword(
  password: string,
  credential: string | null | undefined,
): Promise<boolean> {
  const storedCredential = credential ?? DUMMY_CREDENTIAL;
  const [version, cost, blockSize, parallelization, saltEncoded, keyEncoded, extra] =
    storedCredential.split("$");
  if (
    version !== CREDENTIAL_VERSION ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !saltEncoded ||
    !keyEncoded ||
    extra !== undefined
  ) {
    return false;
  }
  let salt: Buffer;
  let expectedKey: Buffer;
  try {
    salt = Buffer.from(saltEncoded, "base64url");
    expectedKey = Buffer.from(keyEncoded, "base64url");
  } catch {
    return false;
  }
  if (salt.length !== SCRYPT_SALT_LENGTH || expectedKey.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }
  const actualKey = await derivePasswordKey(password, salt);
  return credential != null && timingSafeEqual(actualKey, expectedKey);
}
