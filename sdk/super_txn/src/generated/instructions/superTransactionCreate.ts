/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as beet from '@metaplex-foundation/beet'
import * as web3 from '@solana/web3.js'
import {
  SuperTransactionCreateArgs,
  superTransactionCreateArgsBeet,
} from '../types/SuperTransactionCreateArgs'

/**
 * @category Instructions
 * @category SuperTransactionCreate
 * @category generated
 */
export type SuperTransactionCreateInstructionArgs = {
  args: SuperTransactionCreateArgs
}
/**
 * @category Instructions
 * @category SuperTransactionCreate
 * @category generated
 */
export const superTransactionCreateStruct = new beet.FixableBeetArgsStruct<
  SuperTransactionCreateInstructionArgs & {
    instructionDiscriminator: number[] /* size: 8 */
  }
>(
  [
    ['instructionDiscriminator', beet.uniformFixedSizeArray(beet.u8, 8)],
    ['args', superTransactionCreateArgsBeet],
  ],
  'SuperTransactionCreateInstructionArgs'
)
/**
 * Accounts required by the _superTransactionCreate_ instruction
 *
 * @property [_writable_] transaction
 * @property [**signer**] creator
 * @property [_writable_, **signer**] rentPayer
 * @category Instructions
 * @category SuperTransactionCreate
 * @category generated
 */
export type SuperTransactionCreateInstructionAccounts = {
  transaction: web3.PublicKey
  creator: web3.PublicKey
  rentPayer: web3.PublicKey
  systemProgram?: web3.PublicKey
  anchorRemainingAccounts?: web3.AccountMeta[]
}

export const superTransactionCreateInstructionDiscriminator = [
  118, 33, 24, 167, 204, 225, 101, 166,
]

/**
 * Creates a _SuperTransactionCreate_ instruction.
 *
 * @param accounts that will be accessed while the instruction is processed
 * @param args to provide as instruction data to the program
 *
 * @category Instructions
 * @category SuperTransactionCreate
 * @category generated
 */
export function createSuperTransactionCreateInstruction(
  accounts: SuperTransactionCreateInstructionAccounts,
  args: SuperTransactionCreateInstructionArgs,
  programId = new web3.PublicKey('superB6bzm82y1To5rRaMr7KmqkLNVnCUGwUBemtJV3')
) {
  const [data] = superTransactionCreateStruct.serialize({
    instructionDiscriminator: superTransactionCreateInstructionDiscriminator,
    ...args,
  })
  const keys: web3.AccountMeta[] = [
    {
      pubkey: accounts.transaction,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.creator,
      isWritable: false,
      isSigner: true,
    },
    {
      pubkey: accounts.rentPayer,
      isWritable: true,
      isSigner: true,
    },
    {
      pubkey: accounts.systemProgram ?? web3.SystemProgram.programId,
      isWritable: false,
      isSigner: false,
    },
  ]

  if (accounts.anchorRemainingAccounts != null) {
    for (const acc of accounts.anchorRemainingAccounts) {
      keys.push(acc)
    }
  }

  const ix = new web3.TransactionInstruction({
    programId,
    keys,
    data,
  })
  return ix
}
