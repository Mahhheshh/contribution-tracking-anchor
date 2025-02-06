pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("BBg71ps7vWHZePiWWp7YJ2dUGAQuSFZn5vG8Mh1ogSyc");

#[program]
pub mod aixblock {
    use super::*;

    pub fn initialize_program_state(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.init_state(&ctx.bumps)?;
        Ok(())
    }

    pub fn unlock_tokens(ctx: Context<Unlock>) -> Result<()> {
        ctx.accounts.unlock_tokens(&ctx.bumps)?;
        Ok(())
    } 

    pub fn reset_program_state(ctx: Context<ResetState>) -> Result<()> {
        ctx.accounts.reset()?;
        Ok(())
    }

    pub fn create_contributor_account(ctx: Context<InitializeContributor>, _gh_username: String) -> Result<()> {
        ctx.accounts.create_contributor_account(&ctx.bumps)?;
        Ok(())
    }

    pub fn log_contributor_points(ctx: Context<LogContribution>, _gh_username: String, points: u64) -> Result<()> {
        ctx.accounts.log_contributor_points(points)?;
        Ok(())
    }

    pub fn claim_contributor_tokens(ctx: Context<ClaimTokens>, _gh_username: String) -> Result<()> {
        ctx.accounts.claim_contributor_tokens()?;
        Ok(())
    }

}
