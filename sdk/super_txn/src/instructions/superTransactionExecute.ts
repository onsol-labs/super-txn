import {
  AccountMeta,
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import { getTransactionPda } from "../pda";
import {
  createSuperTransactionExecuteInstruction,
  PROGRAM_ID,
  SuperTransaction,
} from "../generated";
import {
  accountsForTransactionExecute,
  bundledMessageToSuperTransactionMessage,
  transactionMessageToSuperTransactionMessage,
} from "../utils";

export async function superTransactionExecute({
  connection,
  creator,
  transactionIndex,
  programId = PROGRAM_ID,
}: {
  connection: Connection;
  creator: PublicKey;
  transactionIndex: number;
  programId?: PublicKey;
}): Promise<{
  instruction: TransactionInstruction;
  lookupTableAccounts: AddressLookupTableAccount[];
}> {
  const [transactionPda] = getTransactionPda({
    creator,
    index: transactionIndex,
    programId,
  });

  // Initialize with default values
  let accountMetas: AccountMeta[] = [];
  let lookupTableAccounts: AddressLookupTableAccount[] = [];

  try {
    // Fetch transaction account
    const transactionAccount = await SuperTransaction.fromAccountAddress(
      connection,
      transactionPda
    );

    // Destructure the result from accountsForTransactionExecute
    const result = await accountsForTransactionExecute({
      connection,
      message: transactionAccount.message,
      ephemeralSignerBumps: [...transactionAccount.ephemeralSignerBumps],
      creator,
      transactionPda,
      programId,
    });

    accountMetas = result.accountMetas;
    lookupTableAccounts = result.lookupTableAccounts;
  } catch {
    // fail silently
  }

  return {
    instruction: createSuperTransactionExecuteInstruction(
      {
        creator,
        transaction: transactionPda,
        anchorRemainingAccounts: accountMetas,
      },
      programId
    ),
    lookupTableAccounts,
  };
}

export async function bundledSuperTransactionExecute({
  connection,
  creator,
  transactionMessage,
  transactionIndex,
  addressLookupTableAccounts,
  programId = PROGRAM_ID,
}: {
  connection: Connection;
  creator: PublicKey;
  transactionMessage: TransactionMessage;
  addressLookupTableAccounts: AddressLookupTableAccount[];
  transactionIndex: number;
  programId?: PublicKey;
}): Promise<{
  instruction: TransactionInstruction;
  lookupTableAccounts: AddressLookupTableAccount[];
}> {
  const [transactionPda] = getTransactionPda({
    creator,
    index: transactionIndex,
    programId,
  });

  // Initialize with default values
  let accountMetas: AccountMeta[] = [];
  let lookupTableAccounts: AddressLookupTableAccount[] = [];

  // Fetch transaction account
  const superTransactionMessage = transactionMessageToSuperTransactionMessage({
    message: transactionMessage,
    addressLookupTableAccounts,
  });
  // Destructure the result from accountsForTransactionExecute
  const result = await accountsForTransactionExecute({
    connection,
    message: superTransactionMessage,
    ephemeralSignerBumps: [],
    creator,
    transactionPda,
    programId,
  });

  accountMetas = result.accountMetas;
  lookupTableAccounts = result.lookupTableAccounts;

  return {
    instruction: createSuperTransactionExecuteInstruction(
      {
        creator,
        transaction: transactionPda,
        anchorRemainingAccounts: accountMetas,
      },
      programId
    ),
    lookupTableAccounts,
  };
}
