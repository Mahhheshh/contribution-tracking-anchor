use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::state::State;

use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct ResetState<'info> {
    #[account(
        mut,
        constraint = signer.key() == program_state.admin @ ErrorCode::Unauthorized
    )]
    pub signer: Signer<'info>,

    pub token_pool_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"program_state"],
        bump = program_state.state_bump
    )]
    pub program_state: Account<'info, State>,

    #[account(
        mut,
        token::mint = token_pool_mint,
        token::authority = token_pool_account,
        seeds = [b"token_pool"],
        bump = program_state.token_pool_account_bump
    )]
    pub token_pool_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = token_pool_mint,
        seeds = [b"ecosystem_reserve"],
        token::authority = ecosystem_reserve_account,
        bump
    )]
    pub ecosystem_reserve_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> ResetState<'info> {
    pub fn reset(&mut self) -> Result<()> {
        let state = &mut self.program_state;
        let now = Clock::get()?.unix_timestamp;

        require!(now > state.unlock_after, ErrorCode::EarlyReset);

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
            from: self.token_pool_account.to_account_info(),
            mint: self.token_pool_mint.to_account_info(),
            to: self.ecosystem_reserve_account.to_account_info(),
            authority: self.token_pool_account.to_account_info(),
        };

        let seeds: &[&[&[u8]]] = &[&[b"token_pool", &[state.token_pool_account_bump]]];

        state.global_contribution_points = 0;

        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds);

        transfer_checked(
            cpi_context,
            self.token_pool_account.amount,
            self.token_pool_mint.decimals,
        )?;
        Ok(())
    }
}
