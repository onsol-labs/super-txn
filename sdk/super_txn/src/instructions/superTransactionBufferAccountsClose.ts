import { PublicKey } from "@solana/web3.js";
import { createTxnBufferCloseInstruction, PROGRAM_ID } from "../generated";
import { getTransactionBufferPda } from "../pda";

export function transactionBufferClose({
  creator,
  bufferIndex,
  programId = PROGRAM_ID,
}: {
  creator: PublicKey;
  bufferIndex: number;
  programId?: PublicKey;
}) {
  const [transactionBuffer] = getTransactionBufferPda({
    creator,
    bufferIndex,
    programId,
  });

  return createTxnBufferCloseInstruction(
    {
      creator,
      transactionBuffer,
    },
    programId
  );
}
