use anchor_lang::prelude::*;

use crate::ANCHOR_DISCRIMINATOR;

#[account]
pub struct State {
    pub admin: Pubkey,

    pub token_pool_mint: Pubkey,

    pub token_pool_account: Pubkey,
    pub community_reserve_account: Pubkey,

    pub global_contribution_points: u64,
    pub unlock_after: i64,

    pub token_pool_account_bump: u8,
    pub community_reserve_account_bump: u8,
    pub state_bump: u8,
}

impl State {
    pub const INIT_SPACE: usize = 
    ANCHOR_DISCRIMINATOR 
    +
    32 // 4 pubkeys
    + 
    32 
    + 
    32 
    + 
    32 
    + 
    8 // u64 and i64
    + 
    8 
    + 
    1  // bumps
    + 
    1 
    + 
    1;
}
