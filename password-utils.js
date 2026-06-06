
const HASH_CONFIG = {
  algorithm: "PBKDF2",
  hash: "SHA-256",
  iterations: 100000, // NIST recommends 100k+ iterations
  saltLength: 16, // bytes
};


async function generateSalt() {
  const saltBuffer = crypto.getRandomValues(new Uint8Array(HASH_CONFIG.saltLength));
  return btoa(String.fromCharCode(...saltBuffer));
}


async function hashPassword(password, salt = null) {
  if (!salt) {
    salt = await generateSalt();
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));

  try {
    const importedKey = await crypto.subtle.importKey(
      "raw",
      data,
      { name: HASH_CONFIG.algorithm },
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: HASH_CONFIG.algorithm,
        salt: saltBuffer,
        iterations: HASH_CONFIG.iterations,
        hash: HASH_CONFIG.hash,
      },
      importedKey,
      256 // 256 bits = 32 bytes
    );

    const hashBuffer = new Uint8Array(derivedBits);
    const hash = btoa(String.fromCharCode(...hashBuffer));

    return { hash, salt };
  } catch (error) {
    throw new Error("Password hashing failed: " + error.message);
  }
}


async function verifyPassword(password, storedHash, salt) {
  try {
    const { hash } = await hashPassword(password, salt);
    return hash === storedHash;
  } catch {
    return false;
  }
}


async function securePasswordStore(password) {
  const { hash, salt } = await hashPassword(password);
  return JSON.stringify({ hash, salt, version: 1 });
}


async function verifyStoredPassword(password, stored) {
  try {
    const passwordData = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!passwordData.hash || !passwordData.salt) {
      return false;
    }
    return await verifyPassword(password, passwordData.hash, passwordData.salt);
  } catch {
    return false;
  }
}
