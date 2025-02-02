use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Category {
    Development,
    Marketing,
    Design,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ContributionLog {
    pub timestamp: i64,
    pub category: String,
    pub point: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Contribution {    
    pub contributor_address: Pubkey,

    pub token_pool_account: Pubkey,
    
    pub accumulated_points: u64,

    pub claim_after: i64,

    // pub logs: Vec<ContributionLog>

    pub bump: u8,
}