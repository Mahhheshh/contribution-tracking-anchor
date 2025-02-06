use anchor_lang::prelude::*;

use crate::ANCHOR_DISCRIMINATOR;
#[account]
pub struct Contribution {
    pub contributor_address: Pubkey,

    pub token_pool_account: Pubkey,

    pub accumulated_points: u64,

    pub claim_after: i64,

    pub bump: u8,
}

impl Contribution {
    pub const INIT_SPACE: usize = ANCHOR_DISCRIMINATOR + 32 + 32 + 8 + 8 + 1;
}
