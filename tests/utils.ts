import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
  } from "@solana/web3.js";
  import * as superTxn from "../sdk/super_txn/src";

export async function generateFundedKeypair(connection: Connection) {
    const keypair = Keypair.generate();
  
    const tx = await connection.requestAirdrop(
      keypair.publicKey,
      1000 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(tx);
  
    return keypair;
  }


export function createLocalhostConnection() {
    return new Connection("http://127.0.0.1:8899", "confirmed");
  }
  
  export const getLogs = async (connection: Connection, signature: string): Promise<string[]> => {
    const tx = await connection.getTransaction(
      signature,
      { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
    )
    return tx!.meta!.logMessages || []
  }


export function createTestTransferInstruction(
    authority: PublicKey,
    recipient: PublicKey,
    amount = 1000000
  ) {
    return SystemProgram.transfer({
      fromPubkey: authority,
      lamports: amount,
      toPubkey: recipient,
    });
  }
  /** Returns true if the given unix epoch is within a couple of seconds of now. */
export function isCloseToNow(
    unixEpoch: number | bigint,
    timeWindow: number = 2000
  ) {
    const timestamp = Number(unixEpoch) * 1000;
    return Math.abs(timestamp - Date.now()) < timeWindow;
  }
  
  /** Returns an array of numbers from min to max (inclusive) with the given step. */
  export function range(min: number, max: number, step: number = 1) {
    const result = [];
    for (let i = min; i <= max; i += step) {
      result.push(i);
    }
    return result;
  }
  
  export function comparePubkeys(a: PublicKey, b: PublicKey) {
    return a.toBuffer().compare(b.toBuffer());
  }


export async function processBufferInChunks(
    member: Keypair,
    creator: PublicKey,
    bufferAccount: PublicKey,
    buffer: Uint8Array,
    connection: Connection,
    programId: PublicKey,
    chunkSize: number = 700,
    startIndex: number = 0
  ) {
    const processChunk = async (startIndex: number) => {
      if (startIndex >= buffer.length) {
        return;
      }
  
      const chunk = buffer.slice(startIndex, startIndex + chunkSize);
  
      const ix = superTxn.generated.createTxnBufferExtendInstruction(
        {
          creator,
          transactionBuffer: bufferAccount,
        },
        {
          args: {
            buffer: chunk,
          },
        },
        programId
      );
  
      const message = new TransactionMessage({
        payerKey: member.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [ix],
      }).compileToV0Message();
  
      const tx = new VersionedTransaction(message);
  
      tx.sign([member]);
  
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });
  
      await connection.confirmTransaction(signature);
  
      // Move to next chunk
      await processChunk(startIndex + chunkSize);
    };
  
    await processChunk(startIndex);
  }