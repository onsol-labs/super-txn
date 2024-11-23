import { PublicKey } from "@solana/web3.js";
import {
  createSuperTransactionAccountsCloseInstruction,
  PROGRAM_ID,
} from "../generated";
import { getTransactionPda } from "../pda";

export function superTransactionAccountsClose({
  creator,
  transactionIndex,
  programId = PROGRAM_ID,
}: {
  creator: PublicKey;
  transactionIndex: number;
  programId?: PublicKey;
}) {
  const [transactionPda] = getTransactionPda({
    creator,
    index: transactionIndex,
    programId,
  });


  return createSuperTransactionAccountsCloseInstruction(
    {
      creator,
      transaction: transactionPda,
    },
    programId
  );
}
