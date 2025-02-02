use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct State {
    pub admin: Pubkey,

    pub token_pool_mint: Pubkey,

    pub token_pool_account: Pubkey,
    pub ecosystem_reserve_account: Pubkey,

    pub global_contribution_points: u64,
    
    pub unlock_after: i64,
    // pub reset_after: i64,

    pub token_pool_account_bump: u8,
    pub ecosystem_reserve_account_bump: u8,
    pub state_bump: u8,
}