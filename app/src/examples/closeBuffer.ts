import * as anchor from "@coral-xyz/anchor";
import { SuperTxn, IDL } from "../types/super_txn";
import * as superTxn from "super_txn";
import "dotenv/config";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

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

(async () => {
  let rpcUrl = process.env.RPC_URL || "";
  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.KEY) || "")
  );
  const programId = superTxn.PROGRAM_ID;
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(rpcUrl),
    new NodeWallet(keypair),
    {
      commitment: "confirmed",
    }
  );
  const program = new anchor.Program(IDL as SuperTxn, programId, provider);
  const connection = program.provider.connection;
  const feePayer = program.provider.publicKey;
  const closeBuffer = await superTxn.instructions.transactionBufferClose({
    creator: feePayer,
    bufferIndex: 0,
    programId,
  });

  const blockhash = await connection.getLatestBlockhash("finalized");

  const executeMessage = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash.blockhash,
    instructions: [closeBuffer],
  }).compileToV0Message();

  const executeTx = new VersionedTransaction(executeMessage);

  executeTx.sign([keypair]);

  // const simulationtwo = await connection.simulateTransaction(executeTx);
  // console.log(simulationtwo);
  // Send final transaction.
  const executeSignature = await connection.sendRawTransaction(
    executeTx.serialize(),
    {
      skipPreflight: true,
    }
  );

  await connection.confirmTransaction(
    {
      signature: executeSignature,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    },
    "confirmed"
  );
})();
