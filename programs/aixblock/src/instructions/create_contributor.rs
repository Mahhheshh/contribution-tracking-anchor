use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{Contribution, State, ANCHOR_DISCRIMINATOR, CLAIM_WINDOW_SECONDS};

#[derive(Accounts)]
#[instruction(gh_username: String)]
pub struct InitializeContributor<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub token_pool_mint: InterfaceAccount<'info, Mint>,

    #[account(
        has_one = token_pool_mint,
        seeds = [b"program_state"],
        bump = state.state_bump
    )]
    pub state: Account<'info, State>,

    #[account(
        init,
        payer = signer,
        seeds = [b"contributor", gh_username.as_bytes()],
        space = ANCHOR_DISCRIMINATOR as usize + Contribution::INIT_SPACE,
        bump
    )]
    pub contributor: Account<'info, Contribution>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = token_pool_mint,
        associated_token::authority = signer,
    )]
    pub contributor_pool_account: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeContributor<'info> {
    pub fn create_contributor_account(&mut self, bumps: &InitializeContributorBumps) -> Result<()> {
        self.contributor.set_inner(Contribution {
            contributor_address: self.signer.key(),

            token_pool_account: self.contributor_pool_account.key(),
            accumulated_points: 0,
            claim_after: self.state.unlock_after - CLAIM_WINDOW_SECONDS as i64,            
            bump: bumps.contributor,
        });

        Ok(())
    }
}
