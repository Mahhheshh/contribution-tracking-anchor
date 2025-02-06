use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Contribution {    
    pub contributor_address: Pubkey,

    pub token_pool_account: Pubkey,
    
    pub accumulated_points: u64,

    pub claim_after: i64,

    pub bump: u8,
}