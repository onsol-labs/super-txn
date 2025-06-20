/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as beet from '@metaplex-foundation/beet'
import * as web3 from '@solana/web3.js'

/**
 * @category Instructions
 * @category SuperTransactionAccountsClose
 * @category generated
 */
export const superTransactionAccountsCloseStruct = new beet.BeetArgsStruct<{
  instructionDiscriminator: number[] /* size: 8 */
}>(
  [['instructionDiscriminator', beet.uniformFixedSizeArray(beet.u8, 8)]],
  'SuperTransactionAccountsCloseInstructionArgs'
)
/**
 * Accounts required by the _superTransactionAccountsClose_ instruction
 *
 * @property [_writable_] transaction
 * @property [_writable_, **signer**] creator
 * @category Instructions
 * @category SuperTransactionAccountsClose
 * @category generated
 */
export type SuperTransactionAccountsCloseInstructionAccounts = {
  transaction: web3.PublicKey
  creator: web3.PublicKey
  systemProgram?: web3.PublicKey
  anchorRemainingAccounts?: web3.AccountMeta[]
}

export const superTransactionAccountsCloseInstructionDiscriminator = [
  104, 101, 208, 179, 32, 131, 192, 155,
]

/**
 * Creates a _SuperTransactionAccountsClose_ instruction.
 *
 * @param accounts that will be accessed while the instruction is processed
 * @category Instructions
 * @category SuperTransactionAccountsClose
 * @category generated
 */
export function createSuperTransactionAccountsCloseInstruction(
  accounts: SuperTransactionAccountsCloseInstructionAccounts,
  programId = new web3.PublicKey('superB6bzm82y1To5rRaMr7KmqkLNVnCUGwUBemtJV3')
) {
  const [data] = superTransactionAccountsCloseStruct.serialize({
    instructionDiscriminator:
      superTransactionAccountsCloseInstructionDiscriminator,
  })
  const keys: web3.AccountMeta[] = [
    {
      pubkey: accounts.transaction,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.creator,
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
