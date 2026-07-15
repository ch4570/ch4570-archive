import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export type ScryptParameters = {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
};

export const PRODUCTION_SCRYPT_PARAMETERS: ScryptParameters = Object.freeze({
  cost: 131_072,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64,
});

function validatePassword(password: string) {
  if (!password || password.length > 256) {
    throw new Error("Password must contain between 1 and 256 characters.");
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  parameters: Pick<ScryptParameters, "cost" | "blockSize" | "parallelization">,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: 256 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(
  password: string,
  parameters: ScryptParameters = PRODUCTION_SCRYPT_PARAMETERS,
) {
  validatePassword(password);
  const salt = randomBytes(24);
  const derivedKey = await deriveKey(password, salt, parameters.keyLength, parameters);
  return [
    "scrypt",
    parameters.cost,
    parameters.blockSize,
    parameters.parallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string) {
  if (!password || password.length > 256) return false;
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText] =
    encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !costText ||
    !blockSizeText ||
    !parallelizationText ||
    !saltText ||
    !hashText
  ) {
    throw new Error("ADMIN_PASSWORD_HASH has an invalid format.");
  }

  const expected = Buffer.from(hashText, "base64url");
  const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), expected.length, {
    cost: Number(costText),
    blockSize: Number(blockSizeText),
    parallelization: Number(parallelizationText),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateRandomPassword() {
  return randomBytes(24).toString("base64url");
}
