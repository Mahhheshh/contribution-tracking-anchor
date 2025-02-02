use anchor_lang::prelude::*;

use crate::{
    error::ErrorCode,
    state::{Contribution, State},
};

#[derive(Accounts)]
#[instruction(gh_username: String)]
pub struct LogContribution<'info> {
    #[account(
        mut,
        constraint = authority.key() == state.admin @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"program_state"],
        bump = state.state_bump,
    )]
    pub state: Account<'info, State>,

    #[account(
        mut,
        seeds = [b"contributor", gh_username.as_bytes()],
        bump = contributor.bump
    )]
    pub contributor: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,
}

impl<'info> LogContribution<'info> {
    pub fn log_contributor_points(&mut self, points: u64) -> Result<()> {
        let state = &mut self.state;
        let contributor = &mut self.contributor;

        // reset last months points,
        if contributor.claim_after > state.unlock_after {
            // which also means they can only claim once a month
            contributor.accumulated_points = 0;
        } else {
            contributor.accumulated_points =
                contributor.accumulated_points.checked_add(points).unwrap();
            state.global_contribution_points = state
                .global_contribution_points
                .checked_add(points)
                .unwrap();
        }
        Ok(())
    }
}
