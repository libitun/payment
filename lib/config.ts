// ─────────────────────────────────────────────────────────────────────────────
// SolEstate — Single Source of Truth for On-Chain Configuration
//
// ⚡ After each `anchor deploy`, update PROGRAM_ID here.
// ⚡ After each `node anchor/scripts/seed-v*.js`, update MINTS here.
// All other files import from this file — never hardcode elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

/** Currently deployed Solana program address */
export const PROGRAM_ID = "49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7"

/** Solana RPC endpoint */
export const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec"

/** Commitment level */
export const COMMITMENT = "confirmed" as const

/**
 * On-chain property IDs and their token mints.
 * These are fetched dynamically during transactions, but listed here for reference.
 * Last updated: seed-v3 deployment.
 */
export const PROPERTY_MINTS: Record<string, string> = {
  "nyc-penthouse-001-v3":      "5VrAqKk1L46wxxWEE4AEfNYZcBvitWnHJRxbPVshdKYu",
  "miami-villa-002-v3":        "2iEwrc1zaocZJQudCx3kNWtZG8f8tJZqwCprXfiba95o",
  "dubai-tower-003-v3":        "HotTD9XK2vfZoVePeGY1piw593MtXpyGzXGsys7UvJr2",
  "london-flat-004-v3":        "BdYjMXyZj22L587GUHj4giJFznv4YSqt6Q5uiaScTuj1",
  "singapore-condo-005-v3":    "AmpGg552Zubx21wjBrcw6FjAAo2QJTg2NjsKLa6XoycD",
  "tokyo-apt-006-v3":          "HKfJwqtZzrCgGJCzTtFbHVhsMYexD1G1K6mqz4Asvdfn",
  "barcelona-penthouse-007-v3":"CE6cit8w5pLeeQ7NuaNRVVrhkyQd2LWN4m7cj25Zypx7",
}
