import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as instructions from "../instructions/index";

/**
 * Returns unsigned `VersionedTransaction` that needs to be
 * signed by `creator`, `rentPayer` and `feePayer` before sending it.
 */
export function superTransactionCreate({
  blockhash,
  feePayer,
  transactionIndex,
  creator,
  rentPayer,
  ephemeralSigners,
  transactionMessage,
  addressLookupTableAccounts,
  memo,
  programId,
}: {
  blockhash: string;
  feePayer: PublicKey;
  transactionIndex: number;
  /** Member of the multisig that is creating the transaction. */
  creator: PublicKey;
  /** Payer for the transaction account rent. If not provided, `creator` is used. */
  rentPayer?: PublicKey;
  /** Number of additional signing PDAs required by the transaction. */
  ephemeralSigners: number;
  /** Transaction message to wrap into a multisig transaction. */
  transactionMessage: TransactionMessage;
  /** `AddressLookupTableAccount`s referenced in `transaction_message`. */
  addressLookupTableAccounts?: AddressLookupTableAccount[];
  memo?: string;
  programId?: PublicKey;
}): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions: [
      instructions.superTransactionCreate({
        transactionIndex,
        creator,
        rentPayer,
        ephemeralSigners,
        transactionMessage,
        addressLookupTableAccounts,
        memo,
        programId,
      }),
    ],
  }).compileToV0Message();

  return new VersionedTransaction(message);
}
