import * as anchor from "@coral-xyz/anchor";
import { SuperTxn, IDL } from "./types/super_txn";
import * as superTxn from "super_txn";
import "dotenv/config";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as crypto from "crypto";
import { JitoHandler } from "./jitoHandler";

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
  let keypair = Keypair.fromSecretKey(
    Uint8Array.from(bs58.decode(process.env.KEY || ""))
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
  const dev = new PublicKey("");
  // you could insert any instructions here.
  const testIx = createTestTransferInstruction(
    feePayer,
    dev,
    0.00001 * LAMPORTS_PER_SOL
  );

  let instructions = [];
  let bufferIndex = 0;
  // Add 45 transfer instructions to the message.
  for (let i = 0; i <= 45; i++) {
    instructions.push(testIx);
  }

  const testTransferMessage = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: PublicKey.default.toString(),
    instructions: instructions,
  });

  // Serialize the message. Must be done with this util function
  const messageBuffer =
    superTxn.utils.transactionMessageToSuperTransactionMessageBytes({
      message: testTransferMessage,
      // add luts
      addressLookupTableAccounts: [],
    });

  const [transactionBuffer, _] = superTxn.getTransactionBufferPda({
    creator: feePayer,
    bufferIndex,
  });

  const messageHash = crypto
    .createHash("sha256")
    .update(messageBuffer)
    .digest();

  // Slice the message buffer into two parts.
  const firstSlice = messageBuffer.slice(0, 700);
  console.log("firstSlice.length", firstSlice.length);
  console.log("messageBuffer.length", messageBuffer.length);
  const ix = superTxn.generated.createTxnBufferCreateInstruction(
    {
      transactionBuffer,
      creator: feePayer,
      rentPayer: feePayer,
      systemProgram: SystemProgram.programId,
    },
    {
      args: {
        bufferIndex: bufferIndex,
        // Must be a SHA256 hash of the message buffer.
        finalBufferHash: Array.from(messageHash),
        finalBufferSize: messageBuffer.length,
        buffer: firstSlice,
      } as superTxn.generated.TransactionBufferCreateArgs,
    } as superTxn.generated.TxnBufferCreateInstructionArgs
  );

  // const jitoHandler = new JitoHandler();
  // const jitoTip = createTestTransferInstruction(
  //   feePayer,
  //   jitoHandler.getRandomTipAccount(),
  //   0.00001 * LAMPORTS_PER_SOL
  // );
  // const message = new TransactionMessage({
  //   payerKey: feePayer,
  //   recentBlockhash: (await connection.getLatestBlockhash("finalized"))
  //     .blockhash,
  //   instructions: [ix],
  // }).compileToV0Message();

  // const firstTxn = new VersionedTransaction(message);

  // firstTxn.sign([keypair]);
  // const sig = await connection.sendRawTransaction(firstTxn.serialize());
  // await connection.confirmTransaction(sig, "confirmed");

  // const CHUNK_SIZE = 700; // Safe chunk size for buffer extension
  // const numChunks = Math.ceil(messageBuffer.length / CHUNK_SIZE);
  // for (let i = 1; i < numChunks; i++) {
  //   const start = i * CHUNK_SIZE;
  //   const end = Math.min(start + CHUNK_SIZE, messageBuffer.length);
  //   const chunk = messageBuffer.slice(start, end);

  //   const extendIx =
  //     superTxn.generated.createTxnBufferExtendInstruction(
  //       {
  //         transactionBuffer,
  //         creator: feePayer,
  //       },
  //       {
  //         args: {
  //           buffer: chunk,
  //         } as superTxn.generated.TransactionBufferExtendArgs,
  //       } as superTxn.generated.TxnBufferExtendInstructionArgs,
  //       programId
  //     );

  //   const extendTx = new VersionedTransaction(
  //     new TransactionMessage({
  //       payerKey: feePayer,
  //       recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  //       instructions: [extendIx],
  //     }).compileToV0Message()
  //   );
  //   extendTx.sign([keypair]);
  //   const sig = await connection.sendRawTransaction(extendTx.serialize());
  //   await connection.confirmTransaction(sig, "confirmed");
  // }

  const [transactionPda] = superTxn.getTransactionPda({
    creator: feePayer,
    index: bufferIndex,
    programId,
  });

  // //   Create final instruction.
  const thirdIx =
    superTxn.generated.createSuperTransactionCreateFromBufferInstruction(
      {
        superTransactionCreateItemTransaction: transactionPda,
        superTransactionCreateItemCreator: feePayer,
        superTransactionCreateItemRentPayer: feePayer,
        superTransactionCreateItemSystemProgram: SystemProgram.programId,
        creator: feePayer,
        transactionBuffer: transactionBuffer,
      },
      {
        args: {
          transactionIndex: 0,
          ephemeralSigners: 0,
          transactionMessage: new Uint8Array(6).fill(0),
          memo: null,
        } as superTxn.generated.SuperTransactionCreateArgs,
      } as superTxn.generated.SuperTransactionCreateFromBufferInstructionArgs
    );

  // Add third instruction to the message.
  const blockhash = await connection.getLatestBlockhash("finalized");

  const thirdMessage = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash.blockhash,
    instructions: [thirdIx],
  }).compileToV0Message();

  const thirdTx = new VersionedTransaction(thirdMessage);

  thirdTx.sign([keypair]);

  // const simulation = await connection.simulateTransaction(thirdTx);
  // console.log(simulation);
  //   Send final transaction.
  // const thirdSignature = await connection.sendRawTransaction(
  //   thirdTx.serialize(),
  //   {
  //     skipPreflight: true,
  //   }
  // );

  // await connection.confirmTransaction(
  //   {
  //     signature: thirdSignature,
  //     blockhash: blockhash.blockhash,
  //     lastValidBlockHeight: blockhash.lastValidBlockHeight,
  //   },
  //   "confirmed"
  // );

  //   const transactionInfo =
  //     await superTxn.accounts.SuperTransaction.fromAccountAddress(
  //       connection,
  //       transactionPda
  //     );
  //   console.log(transactionInfo)

  const executeIx = await superTxn.instructions.superTransactionExecute({
    connection,
    creator: feePayer,
    // fromPubkey: feePayer,
    // toPubkey: dev,
    transactionIndex: 0,
    programId,
  });

  const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
    bytes: 262144,
  });
  const computeBudgetIxn = ComputeBudgetProgram.setComputeUnitLimit({
    units: 500_000,
  });
  const executeMessage = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash.blockhash,
    instructions: [requestHeapIx, executeIx.instruction],
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
