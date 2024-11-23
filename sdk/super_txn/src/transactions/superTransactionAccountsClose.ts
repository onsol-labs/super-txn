import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as instructions from "../instructions/index";

export function superTransactionAccountsClose({
  blockhash,
  feePayer,
  creator,
  transactionIndex,
  programId,
}: {
  blockhash: string;
  feePayer: PublicKey;
  creator: PublicKey;
  transactionIndex: number;
  programId?: PublicKey;
}): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions: [
      instructions.superTransactionAccountsClose({
        creator,
        transactionIndex,
        programId,
      }),
    ],
  }).compileToV0Message();

  return new VersionedTransaction(message);
}
