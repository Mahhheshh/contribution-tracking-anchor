use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: You do not have permission to perform this action")]
    Unauthorized,
    #[msg("Early Claim: Cannot claim tokens before the unlock period has elapsed")]
    EarlyTokenClaim,
    #[msg("Early Reset: Cannot perform reset operation before the required time period")]
    EarlyReset,
    #[msg("Early Token Unlock!")]
    EarlyUnlock
}
