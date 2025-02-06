use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    error::ErrorCode,
    state::{Contribution, State},
    FAIRNESS_THRESHOLD_POINTS, MONTHLY_UNLOCK_SUPPLY, TOKEN_CLAIM_AFTER_SECONDS,
};

#[derive(Accounts)]
#[instruction(gh_username: String)]
pub struct ClaimTokens<'info> {
    #[account(
        mut,
        constraint = signer.key() == contributor.contributor_address @ ErrorCode::Unauthorized
    )]
    pub signer: Signer<'info>,

    pub token_pool_mint: InterfaceAccount<'info, Mint>,

    #[account(
        has_one = token_pool_mint,
        seeds = [b"program_state"],
        bump = state.state_bump,
    )]
    pub state: Account<'info, State>,

    #[account(
        mut,
        seeds = [b"contributor", gh_username.as_bytes()],
        bump
    )]
    pub contributor: Account<'info, Contribution>,

    #[account(
        mut,
        token::mint = token_pool_mint,
        token::authority = token_pool_account,
        seeds = [b"token_pool"],
        bump = state.token_pool_account_bump
    )]
    pub token_pool_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_pool_mint,
        associated_token::authority = contributor.contributor_address
    )]
    pub contributor_pool_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> ClaimTokens<'info> {
    pub fn claim_contributor_tokens(&mut self) -> Result<()> {
        let contribution = &mut self.contributor;
        let now = Clock::get()?.unix_timestamp;

        require!(
            now >= contribution.claim_after && contribution.claim_after <= self.state.unlock_after,
            ErrorCode::EarlyTokenClaim
        );

        let cpi_program = self.token_program.to_account_info();

        let transfer_cpi_accounts = TransferChecked {
            from: self.token_pool_account.to_account_info(),
            mint: self.token_pool_mint.to_account_info(),
            to: self.contributor_pool_account.to_account_info(),
            authority: self.token_pool_account.to_account_info(),
        };

        let signer_seeds: &[&[&[u8]]] = &[&[b"token_pool", &[self.state.token_pool_account_bump]]];

        let cpi_context =
            CpiContext::new_with_signer(cpi_program, transfer_cpi_accounts, signer_seeds);

        let tokens_to_distribute =
            match self.state.global_contribution_points > FAIRNESS_THRESHOLD_POINTS as u64 {
                true => MONTHLY_UNLOCK_SUPPLY as u64,
                false => MONTHLY_UNLOCK_SUPPLY as u64 / 2,
            };

        let claimable_tokens = tokens_to_distribute
            .checked_mul(contribution.accumulated_points)
            .unwrap()
            .checked_div(self.state.global_contribution_points)
            .unwrap();

        contribution.claim_after = self
            .state
            .unlock_after
            .checked_add(TOKEN_CLAIM_AFTER_SECONDS as i64)
            .unwrap();

        contribution.accumulated_points = 0;

        transfer_checked(cpi_context, claimable_tokens, self.token_pool_mint.decimals)?;
        Ok(())
    }
}
