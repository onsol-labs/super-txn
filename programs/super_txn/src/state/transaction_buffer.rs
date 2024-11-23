use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::errors::SuperTxnError;

// Maximum PDA allocation size in an inner ix is 10240 bytes.
// 10240 - account contents = 10128 bytes
pub const MAX_BUFFER_SIZE: usize = 10128 ;

#[account]
#[derive(Default, Debug)]
pub struct TransactionBuffer {
    /// txn buffer creator
    pub creator: Pubkey,
    /// Index to seed address derivation
    pub buffer_index: u8,
    /// Hash of the final assembled transaction message.
    pub final_buffer_hash: [u8; 32],
    /// The size of the final assembled transaction message.
    pub final_buffer_size: u16,
    /// The buffer of the transaction message.
    pub buffer: Vec<u8>,
}

impl TransactionBuffer {
    pub fn size(final_message_buffer_size: u16) -> Result<usize> {
        // Make sure final size is not greater than MAX_BUFFER_SIZE bytes.
        if (final_message_buffer_size as usize) > MAX_BUFFER_SIZE {
            return err!(SuperTxnError::FinalBufferSizeExceeded);
        }
        Ok(
            8 + // discriminator
            32 +  // creator
            1 +   // buffer_index
            32 +  // transaction_message_hash
            2 +  // final_buffer_size
            4 + // vec length bytes
            final_message_buffer_size as usize, // buffer
        )
    }

    pub fn validate_hash(&self) -> Result<()> {
        let message_buffer_hash = hash(&self.buffer);
        require!(
            message_buffer_hash.to_bytes() == self.final_buffer_hash,
            SuperTxnError::FinalBufferHashMismatch
        );
        Ok(())
    }
    pub fn validate_size(&self) -> Result<()> {
        require_eq!(
            self.buffer.len(),
            self.final_buffer_size as usize,
            SuperTxnError::FinalBufferSizeMismatch
        );
        Ok(())
    }

    pub fn invariant(&self) -> Result<()> {
        require!(
            self.final_buffer_size as usize <= MAX_BUFFER_SIZE,
            SuperTxnError::FinalBufferSizeExceeded
        );
        require!(
            self.buffer.len() <= MAX_BUFFER_SIZE,
            SuperTxnError::FinalBufferSizeExceeded
        );
        require!(
            self.buffer.len() <= self.final_buffer_size as usize,
            SuperTxnError::FinalBufferSizeMismatch
        );

        Ok(())
    }
}
