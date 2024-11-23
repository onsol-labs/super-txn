import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./generated";
import { toU8Bytes, toUtfBytes } from "./utils";

const SEED_PREFIX = toUtfBytes("super_txn");
const SEED_TRANSACTION = toUtfBytes("transaction");
const SEED_EPHEMERAL_SIGNER = toUtfBytes("ephemeral_signer");
const SEED_TRANSACTION_BUFFER = toUtfBytes("transaction_buffer");

export function getEphemeralSignerPda({
  transactionPda,
  ephemeralSignerIndex,
  programId = PROGRAM_ID,
}: {
  transactionPda: PublicKey;
  ephemeralSignerIndex: number;
  programId?: PublicKey;
}): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEED_PREFIX,
      transactionPda.toBytes(),
      SEED_EPHEMERAL_SIGNER,
      toU8Bytes(ephemeralSignerIndex),
    ],
    programId
  );
}

export function getTransactionBufferPda({
    creator,
    bufferIndex,
    programId = PROGRAM_ID,
  }: {
    creator: PublicKey;
    bufferIndex: number;
    programId?: PublicKey;
  }): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        SEED_PREFIX,
        SEED_TRANSACTION_BUFFER,
        creator.toBytes(),
        toU8Bytes(bufferIndex),
      ],
      programId
    );
  }

export function getTransactionPda({
  creator,
  index,
  programId = PROGRAM_ID,
}: {
  creator: PublicKey;
  /** Transaction index. */
  index: number;
  programId?: PublicKey;
}): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_TRANSACTION, creator.toBytes(), toU8Bytes(index)],
    programId
  );
}