import {
  Commitment,
  Connection,
  Context,
  SignatureResult,
  SignatureStatus,
  TransactionSignature,
} from "@solana/web3.js";
import { setTimeout } from "timers/promises";

export const enum TransactionStatus {
  BLOCKHEIGHT_EXCEEDED = 0,
  PROCESSED = 1,
  TIMED_OUT = 2,
}

export async function awaitTransactionSignatureConfirmationBlockhashV2(
  txid: TransactionSignature,
  connection: Connection,
  commitment: Commitment = "confirmed",
  lastValidBlockHeight: number,
  timeout = 60000, // 60 second timeout
): Promise<{
  status: SignatureStatus | null;
  transactionStatus: TransactionStatus;
}> {
  let done = false;
  let status: SignatureStatus | null = null;

  const checkBlockHeight = async () => {
    try {
      return await connection.getBlockHeight(commitment);
    } catch (_e) {
      return -1;
    }
  };

  let subId: number | undefined;

  const confirmationPromise = new Promise<TransactionStatus>((resolve) => {
    try {
      subId = connection.onSignature(
        txid,
        (_result: SignatureResult, _context: Context) => {
          done = true;
          resolve(TransactionStatus.PROCESSED);
        },
        commitment,
      );
    } catch (err) {
      console.error("Error setting up onSignature listener:", err);
    }
  });

  const expiryPromise = (async () => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout && !done) {
      const currentBlockHeight = await checkBlockHeight();
      if (currentBlockHeight > lastValidBlockHeight) {
        return TransactionStatus.BLOCKHEIGHT_EXCEEDED;
      }
      await setTimeout(1000); // Check every second
    }
    return TransactionStatus.TIMED_OUT;
  })();

  const transactionStatus = await Promise.race([
    confirmationPromise,
    expiryPromise,
  ]);

  if (subId !== undefined) {
    connection.removeSignatureListener(subId);
  }

  // Fetch the latest status regardless of the outcome
  const signatureStatuses = await connection.getSignatureStatuses([txid]);
  status = signatureStatuses && signatureStatuses.value[0];

  return { status, transactionStatus };
}
