import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as instructions from "../instructions";

/**
 * Returns unsigned `VersionedTransaction` that needs to be
 * signed by `member` and `feePayer` before sending it.
 */
export async function superTransactionExecute({
  connection,
  blockhash,
  feePayer,
  creator,
  transactionIndex,
  member,
  programId,
}: {
  connection: Connection;
  blockhash: string;
  feePayer: PublicKey;
  creator: PublicKey;
  transactionIndex: number;
  member: PublicKey;
  programId?: PublicKey;
}): Promise<VersionedTransaction> {
  const { instruction, lookupTableAccounts } =
    await instructions.superTransactionExecute({
      connection,
      creator,
      transactionIndex,
      programId,
    });

  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message(lookupTableAccounts);

  return new VersionedTransaction(message);
}
