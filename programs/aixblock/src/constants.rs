pub const ANCHOR_DISCRIMINATOR: u8 = 8;

pub const SEED_MINT_ACCOUNT: &[u8] = b"mint";
pub const MINT_DECIMALS: u8 = 6;

pub const MONTHLY_UNLOCK_SUPPLY: u32 = 10_000;

pub const FAIRNESS_THRESHOLD: u16 = 500;

pub const COOLDOWN_PERIOD: u32 = 2592000; // (30 * 24 * 60 * 60); 30 days

pub const CLAIM_WINDOW: u32 = 172800; // (2 * 24 * 60 * 60)

pub const TOKEN_CLAIM_AFTER: i32 = 2419200; // 28 days
pub const TOKEN_UNLOCK_AFTER: i32 = 2592000; // 30 days
