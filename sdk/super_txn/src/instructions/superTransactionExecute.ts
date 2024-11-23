import {
  AccountMeta,
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { getTransactionPda } from "../pda";
import {
  createSuperTransactionExecuteInstruction,
  PROGRAM_ID,
  SuperTransaction,
} from "../generated";
import { accountsForTransactionExecute } from "../utils";

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
  creator,
  transactionIndex,
  fromPubkey,
toPubkey,
  programId = PROGRAM_ID,
}: {
  connection: Connection;
  creator: PublicKey;
  transactionIndex: number;
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
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

    accountMetas = [
      {pubkey: fromPubkey, isSigner: true, isWritable: true},
      {pubkey: toPubkey, isSigner: false, isWritable: true},
      {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
    ];
    // lookupTableAccounts = result.lookupTableAccounts;


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