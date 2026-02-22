export type DrandResponse = {
  round: number;
  randomness: string; // hex - sha256(signature)
  signature: string; // hex - BLS12-381 signature (96 bytes)
  previous_signature: string;
};

export const DRAND_CHAIN_INFO = {
  hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  genesisTime: 1692803367,
  period: 3, // seconds between rounds
};

export const DRAND_API_URL = `https://api.drand.sh/${DRAND_CHAIN_INFO.hash}`;

export async function fetchLatestRandomness(
  fetchFn: <T>(url: string) => Promise<T | undefined>
): Promise<DrandResponse> {
  const response = await fetchFn<DrandResponse>(
    `${DRAND_API_URL}/public/latest`
  );
  if (!response) {
    throw new Error("Failed to fetch randomness from drand");
  }
  return response;
}

/**
 * Convert hex string to bytes32 (0x-prefixed, 32 bytes)
 */
export function toBytes32(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.padStart(64, "0");
}

/**
 * Convert hex string to bytes (0x-prefixed)
 */
export function toBytes(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean;
}
