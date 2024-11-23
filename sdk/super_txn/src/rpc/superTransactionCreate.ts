import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SendOptions,
  Signer,
  TransactionMessage,
  TransactionSignature,
} from "@solana/web3.js";
import * as transactions from "../transactions";
import { translateAndThrowAnchorError } from "../errors";

/** Create a new super transaction. */
export async function superTransactionCreate({
  connection,
  feePayer,
  transactionIndex,
  creator,
  rentPayer,
  ephemeralSigners,
  transactionMessage,
  addressLookupTableAccounts,
  memo,
  signers,
  sendOptions,
  programId,
}: {
  connection: Connection;
  feePayer: Signer;
  transactionIndex: number;
  /** Member of the multisig that is creating the transaction. */
  creator: PublicKey;
  /** Payer for the transaction account rent. If not provided, `creator` is used. */
  rentPayer?: PublicKey;
  /** Number of ephemeral signing PDAs required by the transaction. */
  ephemeralSigners: number;
  /** Transaction message to wrap into a multisig transaction. */
  transactionMessage: TransactionMessage;
  /** `AddressLookupTableAccount`s referenced in `transaction_message`. */
  addressLookupTableAccounts?: AddressLookupTableAccount[];
  memo?: string;
  signers?: Signer[];
  sendOptions?: SendOptions;
  programId?: PublicKey;
}): Promise<TransactionSignature> {
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const tx = transactions.superTransactionCreate({
    blockhash,
    feePayer: feePayer.publicKey,
    creator,
    transactionIndex,
    rentPayer,
    ephemeralSigners,
    transactionMessage,
    addressLookupTableAccounts,
    memo,
    programId,
  });

  tx.sign([feePayer, ...(signers ?? [])]);

  try {
    return await connection.sendTransaction(tx, sendOptions);
  } catch (err) {
    translateAndThrowAnchorError(err);
  }
}
