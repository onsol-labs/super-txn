import {
  Connection,
  PublicKey,
  SendOptions,
  Signer,
  TransactionSignature,
} from "@solana/web3.js";
import * as transactions from "../transactions";
import { translateAndThrowAnchorError } from "../errors";

/**
 *  Execute the multisig transaction.
 *  The transaction must be `ExecuteReady`.
 */
export async function superTransactionExecute({
  connection,
  feePayer,
  creator,
  transactionIndex,
  member,
  signers,
  sendOptions,
  programId,
}: {
  connection: Connection;
  feePayer: Signer;
  creator: PublicKey;
  transactionIndex: number;
  member: PublicKey;
  signers?: Signer[];
  sendOptions?: SendOptions;
  programId?: PublicKey;
}): Promise<TransactionSignature> {
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const tx = await transactions.superTransactionExecute({
    connection,
    blockhash,
    feePayer: feePayer.publicKey,
    creator,
    transactionIndex,
    member,
    programId,
  });

  tx.sign([feePayer, ...(signers ?? [])]);

  try {
    return await connection.sendTransaction(tx, sendOptions);
  } catch (err) {
    translateAndThrowAnchorError(err);
  }
}
