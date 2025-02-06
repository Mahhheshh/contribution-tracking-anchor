use anchor_lang::prelude::*;
use anchor_spl::token_interface::{mint_to, Mint, MintTo, TokenAccount, TokenInterface};

use crate::{error::ErrorCode, State, MONTHLY_UNLOCK_SUPPLY, TOKEN_UNLOCK_AFTER_SECONDS};

#[derive(Accounts)]
pub struct Unlock<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub token_pool_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        has_one = admin,
        has_one = token_pool_mint,
        seeds = [b"program_state"],
        bump = state.state_bump
    )]
    pub state: Account<'info, State>,

    #[account(
        init_if_needed,
        payer = admin,
        token::mint = token_pool_mint,
        token::authority = token_pool_account,
        seeds = [b"token_pool"],
        bump
    )]
    pub token_pool_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Unlock<'info> {
    pub fn unlock_tokens(&mut self, bumps: &UnlockBumps) -> Result<()> {
        let state = &mut self.state;

        if state.token_pool_account_bump == 0 {
            state.token_pool_account_bump = bumps.token_pool_account;
            state.token_pool_account = self.token_pool_account.key();
        }

        let now = Clock::get()?.unix_timestamp;
        require!(now >= state.unlock_after, ErrorCode::EarlyUnlock);

        mint_to(
            CpiContext::new(
                self.token_program.to_account_info(),
                MintTo {
                    mint: self.token_pool_mint.to_account_info(),
                    to: self.token_pool_account.to_account_info(),
                    authority: self.admin.to_account_info(),
                },
            ),
            MONTHLY_UNLOCK_SUPPLY as u64,
        )?;
        state.unlock_after = now + TOKEN_UNLOCK_AFTER_SECONDS as i64;

        Ok(())
    }
}
