import {
  createSuperTransactionCreateInstruction,
  PROGRAM_ID,
} from "../generated";
import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionMessage,
} from "@solana/web3.js";
import { getTransactionPda } from "../pda";
import { transactionMessageToSuperTransactionMessageBytes } from "../utils";

export function superTransactionCreate({
  creator,
  rentPayer,
  transactionIndex,
  ephemeralSigners,
  transactionMessage,
  addressLookupTableAccounts,
  memo,
  programId = PROGRAM_ID,
}: {
  creator: PublicKey;
  rentPayer?: PublicKey;
  transactionIndex: number;
  /** Number of additional signing PDAs required by the transaction. */
  ephemeralSigners: number;
  /** Transaction message to wrap into a multisig transaction. */
  transactionMessage: TransactionMessage;
  /** `AddressLookupTableAccount`s referenced in `transaction_message`. */
  addressLookupTableAccounts?: AddressLookupTableAccount[];
  memo?: string;
  programId?: PublicKey;
}) {

  const [transactionPda] = getTransactionPda({
    creator,
    index: transactionIndex,
    programId,
  });

  const transactionMessageBytes =
    transactionMessageToSuperTransactionMessageBytes({
      message: transactionMessage,
      addressLookupTableAccounts,
    });

  return createSuperTransactionCreateInstruction(
    {
      transaction: transactionPda,
      creator,
      rentPayer: rentPayer ?? creator,
    },
    {
      args: {
        transactionIndex,
        ephemeralSigners,
        transactionMessage: transactionMessageBytes,
        memo: memo ?? null,
      },
    },
    programId
  );
}
