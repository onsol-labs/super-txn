import {
  Connection,
  PublicKey,
  SendOptions,
  Signer,
  TransactionSignature,
} from "@solana/web3.js";
import * as transactions from "../transactions/index";
import { translateAndThrowAnchorError } from "../errors";

/**
 * Close the Proposal and ConfigTransaction accounts associated with a config transaction.
 */
export async function superTransactionAccountsClose({
  connection,
  feePayer,
  creator,
  transactionIndex,
  sendOptions,
  programId,
}: {
  connection: Connection;
  feePayer: Signer;
  creator: PublicKey;
  transactionIndex: number;
  sendOptions?: SendOptions;
  programId?: PublicKey;
}): Promise<TransactionSignature> {
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const tx = transactions.superTransactionAccountsClose({
    blockhash,
    feePayer: feePayer.publicKey,
    creator,
    transactionIndex,
    programId,
  });

  tx.sign([feePayer]);

  try {
    return await connection.sendTransaction(tx, sendOptions);
  } catch (err) {
    translateAndThrowAnchorError(err);
  }
}
