use anchor_lang::{prelude::*, system_program};
use constants::*;
use errors::SuperTxnError;
use state::{SuperTransaction, TransactionBuffer, TransactionMessage};
use utils::{close, derive_ephemeral_signers, ExecutableTransactionMessage};
pub mod allocator;
pub mod constants;
pub mod errors;
pub mod state;
pub mod utils;

declare_id!("superB6bzm82y1To5rRaMr7KmqkLNVnCUGwUBemtJV3");

#[program]
pub mod super_txn {
    use super::*;

    /// Create a transaction buffer account.
    pub fn txn_buffer_create(
        ctx: Context<TransactionBufferCreate>,
        args: TransactionBufferCreateArgs,
    ) -> Result<()> {
        TransactionBufferCreate::transaction_buffer_create(ctx, args)
    }

    /// Close a transaction buffer account.
    pub fn txn_buffer_close(_ctx: Context<TransactionBufferClose>) -> Result<()> {
        Ok(())
    }

    /// Extend a transaction buffer account.
    pub fn txn_buffer_extend(
        ctx: Context<TransactionBufferExtend>,
        args: TransactionBufferExtendArgs,
    ) -> Result<()> {
        TransactionBufferExtend::transaction_buffer_extend(ctx, args)
    }
    /// Create a new super transaction.
    pub fn super_transaction_create(
        ctx: Context<SuperTransactionCreate>,
        args: SuperTransactionCreateArgs,
    ) -> Result<()> {
        SuperTransactionCreate::super_transaction_create(ctx, args)
    }

    /// Create a new super transaction from a completed transaction buffer.
    /// Finalized buffer hash must match `final_buffer_hash`
    pub fn super_transaction_create_from_buffer<'info>(
        ctx: Context<'_, '_, 'info, 'info, SuperTransactionCreateFromBuffer<'info>>,
        args: SuperTransactionCreateArgs,
    ) -> Result<()> {
        SuperTransactionCreateFromBuffer::super_transaction_create_from_buffer(ctx, args)
    }

    /// Execute a super transaction.
    /// The transaction must be `Approved`.
    pub fn super_transaction_execute(ctx: Context<SuperTransactionExecute>) -> Result<()> {
        SuperTransactionExecute::super_transaction_execute(ctx)
    }

    /// Closes a `SuperTransaction`
    pub fn super_transaction_accounts_close(
        _ctx: Context<SuperTransactionAccountsClose>,
    ) -> Result<()> {
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransactionBufferCreateArgs {
    /// Index of the buffer account to seed the account derivation
    pub buffer_index: u8,
    /// Hash of the final assembled transaction message.
    pub final_buffer_hash: [u8; 32],
    /// Final size of the buffer.
    pub final_buffer_size: u16,
    /// Initial slice of the buffer.
    pub buffer: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: TransactionBufferCreateArgs)]
pub struct TransactionBufferCreate<'info> {
    #[account(
        init,
        payer = rent_payer,
        space = TransactionBuffer::size(args.final_buffer_size)?,
        seeds = [
            SEED_PREFIX,
            SEED_TRANSACTION_BUFFER,
            creator.key().as_ref(),
            &args.buffer_index.to_le_bytes(),
        ],
        bump
    )]
    pub transaction_buffer: Account<'info, TransactionBuffer>,

    /// The member of the multisig that is creating the transaction.
    pub creator: Signer<'info>,

    /// The payer for the transaction account rent.
    #[account(mut)]
    pub rent_payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl TransactionBufferCreate<'_> {
    /// Create a new super transaction buffer.
    pub fn transaction_buffer_create(
        ctx: Context<Self>,
        args: TransactionBufferCreateArgs,
    ) -> Result<()> {
        // Mutable Accounts
        let transaction_buffer = &mut ctx.accounts.transaction_buffer;

        // Readonly Accounts
        let creator = &mut ctx.accounts.creator;

        // Get the buffer index.
        let buffer_index = args.buffer_index;

        transaction_buffer.creator = creator.key();
        transaction_buffer.buffer_index = buffer_index;
        transaction_buffer.final_buffer_hash = args.final_buffer_hash;
        transaction_buffer.final_buffer_size = args.final_buffer_size;
        transaction_buffer.buffer = args.buffer;

        // Invariant function on the transaction buffer
        transaction_buffer.invariant()?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransactionBufferClose<'info> {
    #[account(
        mut,
        // Rent gets returned to the creator
        close = creator,
        // Only the creator can close the buffer
        constraint = transaction_buffer.creator == creator.key() @ SuperTxnError::Unauthorized,
        // Account can be closed anytime by the creator, regardless of the
        // current multisig transaction index
        seeds = [
            SEED_PREFIX,
            SEED_TRANSACTION_BUFFER,
            creator.key().as_ref(),
            &transaction_buffer.buffer_index.to_le_bytes()
        ],
        bump
    )]
    pub transaction_buffer: Account<'info, TransactionBuffer>,

    /// The member of the multisig that created the TransactionBuffer.
    pub creator: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransactionBufferExtendArgs {
    // Buffer to extend the TransactionBuffer with.
    pub buffer: Vec<u8>,
}
#[derive(Accounts)]
#[instruction(args: TransactionBufferExtendArgs)]
pub struct TransactionBufferExtend<'info> {
    /// CHECK: checked below but silently fails
    #[account(mut)]
    pub transaction_buffer: AccountInfo<'info>,
    pub creator: Signer<'info>,
}

impl TransactionBufferExtend<'_> {
    fn validate(&self, args: &TransactionBufferExtendArgs) -> Result<()> {
        let txn_buffer_account_data = self.transaction_buffer.try_borrow_data()?;
        let transaction_buffer =
            TransactionBuffer::try_deserialize(&mut txn_buffer_account_data.as_ref())?;
        let current_buffer_size = transaction_buffer.buffer.len() as u16;
        let remaining_space = transaction_buffer
            .final_buffer_size
            .checked_sub(current_buffer_size)
            .unwrap();

        // Check if the new data exceeds the remaining space
        let new_data_size = args.buffer.len() as u16;
        require!(
            new_data_size <= remaining_space,
            SuperTxnError::FinalBufferSizeExceeded
        );

        require_eq!(
            transaction_buffer.creator,
            self.creator.key(),
            SuperTxnError::Unauthorized
        );

        Ok(())
    }
    pub fn transaction_buffer_extend(
        ctx: Context<Self>,
        args: TransactionBufferExtendArgs,
    ) -> Result<()> {
        let transaction_buffer_account_info = &ctx.accounts.transaction_buffer;
        if transaction_buffer_account_info.data_is_empty() {
            msg!("Warning: Transaction buffer is empty, fail silently for jito bundles");
            return Ok(());
        }
        // if below code fails, then txn is not clean.

        // Log any validation issues but continue
        let _ = ctx.accounts.validate(&args);

        // Get mutable reference to account data
        let mut txn_buffer_account_data = transaction_buffer_account_info.try_borrow_mut_data()?;
        let mut transaction_buffer =
            TransactionBuffer::try_deserialize(&mut txn_buffer_account_data.as_ref())?;
        let buffer_slice_extension = args.buffer;

        // Extend the buffer, log if it panics
        transaction_buffer
            .buffer
            .extend_from_slice(&buffer_slice_extension);

        transaction_buffer.invariant()?;

        // Serialize the modified transaction buffer back to account data
        transaction_buffer.try_serialize(&mut *txn_buffer_account_data)?;

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SuperTransactionCreateArgs {
    /// Index of this transaction belongs to.
    pub transaction_index: u8,
    /// Number of ephemeral signing PDAs required by the transaction.
    pub ephemeral_signers: u8,
    pub transaction_message: Vec<u8>,
    pub memo: Option<String>,
}

#[derive(Accounts)]
#[instruction(args: SuperTransactionCreateArgs)]
pub struct SuperTransactionCreate<'info> {
    #[account(
        init,
        payer = rent_payer,
        space = SuperTransaction::size(args.ephemeral_signers, &args.transaction_message)?,
        seeds = [
            SEED_PREFIX,
            SEED_TRANSACTION,
            creator.key().as_ref(),
            &args.transaction_index.to_le_bytes(),
        ],
        bump
    )]
    pub transaction: Account<'info, SuperTransaction>,

    /// The member of the multisig that is creating the transaction.
    pub creator: Signer<'info>,

    /// The payer for the transaction account rent.
    #[account(mut)]
    pub rent_payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> SuperTransactionCreate<'info> {
    /// Create a new super transaction.
    pub fn super_transaction_create(
        ctx: Context<Self>,
        args: SuperTransactionCreateArgs,
    ) -> Result<()> {
        let transaction = &mut ctx.accounts.transaction;
        let creator = &mut ctx.accounts.creator;

        let transaction_message =
            TransactionMessage::deserialize(&mut args.transaction_message.as_slice())?;

        let transaction_key = transaction.key();

        let ephemeral_signer_bumps: Vec<u8> = (0..args.ephemeral_signers)
            .map(|ephemeral_signer_index| {
                let ephemeral_signer_seeds = &[
                    SEED_PREFIX,
                    transaction_key.as_ref(),
                    SEED_EPHEMERAL_SIGNER,
                    &ephemeral_signer_index.to_le_bytes(),
                ];

                let (_, bump) =
                    Pubkey::find_program_address(ephemeral_signer_seeds, ctx.program_id);
                bump
            })
            .collect();

        // Initialize the transaction fields.
        transaction.creator = creator.key();
        // transaction.index = transaction_index;
        transaction.ephemeral_signer_bumps = ephemeral_signer_bumps;
        transaction.message = transaction_message.try_into()?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SuperTransactionCreateFromBuffer<'info> {
    // The context needed for the SuperTransactionCreate instruction
    pub super_transaction_create: SuperTransactionCreate<'info>,

    /// CHECK: checked below.
    #[account(mut)]
    pub transaction_buffer: AccountInfo<'info>,

    // Anchor doesn't allow us to use the creator inside of
    // super_transaction_create, so we just re-pass it here with the same constraint
    #[account(
        mut,
        address = super_transaction_create.creator.key(),
    )]
    pub creator: Signer<'info>,
}

impl<'info> SuperTransactionCreateFromBuffer<'info> {
    pub fn validate(&self, args: &SuperTransactionCreateArgs) -> Result<TransactionBuffer> {
        let txn_buffer_account_data = self.transaction_buffer.try_borrow_data()?;
        let transaction_buffer =
            TransactionBuffer::try_deserialize(&mut txn_buffer_account_data.as_ref())?;

        // Check that the transaction message is "empty"
        require!(
            args.transaction_message == vec![0, 0, 0, 0, 0, 0],
            SuperTxnError::InvalidInstructionArgs
        );

        // Validate that the final hash matches the buffer
        transaction_buffer.validate_hash()?;

        // Validate that the final size is correct
        transaction_buffer.validate_size()?;
        require_eq!(
            transaction_buffer.creator,
            self.creator.key(),
            SuperTxnError::Unauthorized
        );
        Ok(transaction_buffer)
    }

    pub fn super_transaction_create_from_buffer(
        ctx: Context<'_, '_, 'info, 'info, Self>,
        args: SuperTransactionCreateArgs,
    ) -> Result<()> {
        let transaction_buffer_account_info = &ctx.accounts.transaction_buffer;
        if transaction_buffer_account_info.data_is_empty() {
            msg!("Warning: Transaction buffer is empty, fail silently for jito bundles");
            return Ok(());
        }
        // Account infos necessary for reallocation
        let super_transaction_account_info = &ctx
            .accounts
            .super_transaction_create
            .transaction
            .to_account_info();
        let rent_payer_account_info = &ctx
            .accounts
            .super_transaction_create
            .rent_payer
            .to_account_info();

        let system_program = &ctx
            .accounts
            .super_transaction_create
            .system_program
            .to_account_info();

        // Read-only accounts
        let transaction_buffer = ctx.accounts.validate(&args)?;

        // Calculate the new required length of the super transaction account,
        // since it was initialized with an empty transaction message
        let new_len =
            SuperTransaction::size(args.ephemeral_signers, transaction_buffer.buffer.as_slice())?;
        // Calculate the rent exemption for new length
        let rent_exempt_lamports = Rent::get().unwrap().minimum_balance(new_len).max(1);

        // Check the difference between the rent exemption and the current lamports
        let top_up_lamports =
            rent_exempt_lamports.saturating_sub(super_transaction_account_info.lamports());

        // System Transfer the remaining difference to the super transaction account
        let transfer_context = CpiContext::new(
            system_program.to_account_info(),
            system_program::Transfer {
                from: rent_payer_account_info.clone(),
                to: super_transaction_account_info.clone(),
            },
        );
        system_program::transfer(transfer_context, top_up_lamports)?;
        // Reallocate the super transaction account to the new length of the
        // actual transaction message
        AccountInfo::realloc(&super_transaction_account_info, new_len, true)?;

        // Create the args for the super transaction create instruction
        let create_args = SuperTransactionCreateArgs {
            ephemeral_signers: args.ephemeral_signers,
            transaction_message: transaction_buffer.buffer.clone(),
            transaction_index: args.transaction_index,
            memo: args.memo,
        };

        // Create the context for the super transaction create instruction
        let context = Context::new(
            ctx.program_id,
            &mut ctx.accounts.super_transaction_create,
            ctx.remaining_accounts,
            ctx.bumps.super_transaction_create,
        );

        // Call the super transaction create instruction
        SuperTransactionCreate::super_transaction_create(context, create_args)?;

        close(
            ctx.accounts.transaction_buffer.to_account_info(),
            ctx.accounts.creator.to_account_info(),
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SuperTransactionExecute<'info> {
    /// The transaction to execute.
    /// CHECK: checked below
    #[account(mut)]
    pub transaction: AccountInfo<'info>,
    #[account(mut)]
    pub creator: Signer<'info>,
    // `remaining_accounts` must include the following accounts in the exact order:
    // 1. AddressLookupTable accounts in the order they appear in `message.address_table_lookups`.
    // 2. Accounts in the order they appear in `message.account_keys`.
    // 3. Accounts in the order they appear in `message.address_table_lookups`.
}

impl SuperTransactionExecute<'_> {
    /// Execute the super transaction.
    pub fn super_transaction_execute(ctx: Context<Self>) -> Result<()> {
        let transaction_account_info = &ctx.accounts.transaction;
        if transaction_account_info.data_is_empty() {
            msg!("Warning: SuperTransaction is empty, fail silently for jito bundles");
            return Ok(());
        }
        {
            let transaction_account_data = transaction_account_info.try_borrow_mut_data()?;
            let mut transaction =
                SuperTransaction::try_deserialize(&mut transaction_account_data.as_ref())?;
            require_eq!(
                transaction.creator,
                ctx.accounts.creator.key(),
                SuperTxnError::Unauthorized
            );

            // NOTE: After `take()` is called, the SuperTransaction is reduced to
            // its default empty value, which means it should no longer be referenced or
            // used after this point to avoid faulty behavior.
            // Instead only make use of the returned `transaction` value.
            let transaction = transaction.take();

            let transaction_key = ctx.accounts.transaction.key();
            let creator = &ctx.accounts.creator;
            let creator_key = creator.key();
            let transaction_message = transaction.message;
            // let num_lookups = transaction_message.address_table_lookups.len();

            let message_account_infos = ctx
                .remaining_accounts;
            // let address_lookup_table_account_infos = ctx
            //     .remaining_accounts
            //     .get(..num_lookups)
            //     .ok_or(SuperTxnError::InvalidNumberOfAccounts)?;

            let (ephemeral_signer_keys, ephemeral_signer_seeds) =
                derive_ephemeral_signers(transaction_key, &transaction.ephemeral_signer_bumps);

            let executable_message = ExecutableTransactionMessage::new_validated(
                transaction_message,
                message_account_infos,
                &creator_key,
                &ephemeral_signer_keys,
            )?;

            // Execute the transaction message instructions one-by-one.
            // NOTE: `execute_message()` calls `self.to_instructions_and_accounts()`
            // which in turn calls `take()` on
            // `self.message.instructions`, therefore after this point no more
            // references or usages of `self.message` should be made to avoid
            // faulty behavior.
            executable_message.execute_message(&ephemeral_signer_seeds)?;
        }
        close(
            ctx.accounts.transaction.to_account_info(),
            ctx.accounts.creator.to_account_info(),
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SuperTransactionAccountsClose<'info> {
    #[account(
        mut,
        has_one = creator,
        close = creator
    )]
    pub transaction: Account<'info, SuperTransaction>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}
