use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::State;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub token_pool_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        seeds = [b"program_state"],
        space = State::INIT_SPACE,
        bump,
    )]
    pub program_state: Account<'info, State>,

    #[account(
        init,
        payer = signer,
        token::mint = token_pool_mint,
        seeds = [b"ecosystem_reserve"],
        token::authority = community_reserve_account,
        bump
    )]
    pub community_reserve_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Initialize<'info> {
    pub fn init_state(&mut self, bumps: &InitializeBumps) -> Result<()> {
        self.program_state.set_inner(State {
            admin: self.signer.key(),

            token_pool_mint: self.token_pool_mint.key(),
            token_pool_account: Pubkey::default(),
            community_reserve_account: self.community_reserve_account.key(),

            global_contribution_points: 0,
            unlock_after: 0,

            community_reserve_account_bump: bumps.community_reserve_account,
            token_pool_account_bump: 0,
            state_bump: bumps.program_state,
        });

        Ok(())
    }
}
