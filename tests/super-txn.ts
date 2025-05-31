import * as anchor from "@coral-xyz/anchor";
import { SuperTxn, IDL } from "./types/super_txn";
import * as superTxn from "super_txn";
import { createTestTransferInstruction, generateFundedKeypair } from "./utils";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import assert from "assert";
import * as crypto from "crypto";

describe("super_txn", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const programId = superTxn.PROGRAM_ID;
  const program = new anchor.Program(IDL as SuperTxn, programId);

  it("set msg buffer, extend txn, and create super txn, execute", async () => {
    const transactionIndex = 0;
    const bufferIndex = 0;
    const creator = await generateFundedKeypair(program.provider.connection);
    const testPayee = Keypair.generate();
    const testIx = createTestTransferInstruction(
      creator.publicKey,
      testPayee.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    const connection = program.provider.connection;
    let instructions = [];

    // Add 48 transfer instructions to the message.
    for (let i = 0; i <= 45; i++) {
      instructions.push(testIx);
    }

    const testTransferMessage = new TransactionMessage({
      payerKey: creator.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions: instructions,
    });

    // Serialize the message. Must be done with this util function
    const messageBuffer =
      superTxn.utils.transactionMessageToSuperTransactionMessageBytes({
        message: testTransferMessage,
        addressLookupTableAccounts: [],
      });

    const [transactionBuffer, _] = superTxn.getTransactionBufferPda({
      creator: creator.publicKey,
      bufferIndex,
    });

    const messageHash = crypto
      .createHash("sha256")
      .update(messageBuffer)
      .digest();

    // Slice the message buffer into two parts.
    const firstSlice = messageBuffer.slice(0, 700);
    // console.log('firstSlice.length', firstSlice.length)
    // console.log('messageBuffer.length', messageBuffer.length)
    const ix = superTxn.generated.createTxnBufferCreateInstruction(
      {
        transactionBuffer,
        creator: creator.publicKey,
        rentPayer: creator.publicKey,
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

    const message = new TransactionMessage({
      payerKey: creator.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);

    tx.sign([creator]);

    // Send first transaction.
    const signature = await connection.sendTransaction(tx);
    await connection.confirmTransaction(signature);
    // console.log(signature)

    const transactionBufferAccount = await connection.getAccountInfo(
      transactionBuffer
    );
    // console.log(transactionBufferAccount?.data.length)
    // Check buffer account exists.
    assert.notEqual(transactionBufferAccount, null);
    assert.ok(transactionBufferAccount?.data.length! > 0);

    // Need to add some deserialization to check if it actually worked.
    const transactionBufferInfo1 = await connection.getAccountInfo(
      transactionBuffer
    );
    const [txBufferDeser1] =
      superTxn.generated.TransactionBuffer.fromAccountInfo(
        transactionBufferInfo1!
      );

    // console.log(txBufferDeser1)
    // console.log(txBufferDeser1.finalBufferSize)
    // First chunk uploaded. Check that length is as expected.
    assert.equal(txBufferDeser1.buffer.length, 700);

    const secondSlice = messageBuffer.slice(700, messageBuffer.byteLength);
    // console.log(secondSlice.length)

    // Extned the buffer.
    const secondIx = superTxn.generated.createTxnBufferExtendInstruction(
      {
        transactionBuffer,
        creator: creator.publicKey,
      },
      {
        args: {
          buffer: secondSlice,
        } as superTxn.generated.TransactionBufferExtendArgs,
      } as superTxn.generated.TxnBufferExtendInstructionArgs
    );

    const secondMessage = new TransactionMessage({
      payerKey: creator.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions: [secondIx],
    }).compileToV0Message();

    const secondTx = new VersionedTransaction(secondMessage);

    secondTx.sign([creator]);

    // Send second transaction to extend.
    const secondSignature = await connection.sendTransaction(secondTx);

    // const simulation = await connection.simulateTransaction(secondTx);
    // console.log(simulation)
    await connection.confirmTransaction(secondSignature);

    // // Need to add some deserialization to check if it actually worked.
    const transactionBufferInfo2 = await connection.getAccountInfo(
      transactionBuffer
    );
    const [txBufferDeser2] =
      superTxn.generated.TransactionBuffer.fromAccountInfo(
        transactionBufferInfo2!
      );

    // Final chunk uploaded. Check that length is as expected.
    // console.log(txBufferDeser2.buffer.length)
    assert.equal(txBufferDeser2.buffer.length, messageBuffer.byteLength);

    // // Derive super transaction PDA.
    const [transactionPda] = superTxn.getTransactionPda({
      creator: creator.publicKey,
      index: transactionIndex,
    });

    // const transactionAccountInfo = await connection.getAccountInfo(transactionPda);

    // Create final instruction.
    const thirdIx =
      superTxn.generated.createSuperTransactionCreateFromBufferInstruction(
        {
          superTransactionCreateItemTransaction: transactionPda,
          superTransactionCreateItemCreator: creator.publicKey,
          superTransactionCreateItemRentPayer: creator.publicKey,
          superTransactionCreateItemSystemProgram: SystemProgram.programId,
          creator: creator.publicKey,
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
    const blockhash = await connection.getLatestBlockhash();

    const thirdMessage = new TransactionMessage({
      payerKey: creator.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [thirdIx],
    }).compileToV0Message();

    const thirdTx = new VersionedTransaction(thirdMessage);

    thirdTx.sign([creator]);

    // const simulation = await connection.simulateTransaction(thirdTx);
    // console.log(simulation)
    // Send final transaction.
    const thirdSignature = await connection.sendRawTransaction(
      thirdTx.serialize(),
      {
        skipPreflight: true,
      }
    );

    await connection.confirmTransaction(
      {
        signature: thirdSignature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      },
      "confirmed"
    );

    const transactionInfo =
      await superTxn.accounts.SuperTransaction.fromAccountAddress(
        connection,
        transactionPda
      );

    // Ensure final super transaction has 46 instructions
    assert.equal(transactionInfo.message.instructions.length, 46);

    const executeIx = await superTxn.instructions.superTransactionExecute({
      connection,
      creator: creator.publicKey,
      transactionIndex: 0,
      amountIn: 0,
      programId,
    });

    const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
      bytes:  8 * 32 * 1024,
    });
    const executeMessage = new TransactionMessage({
      payerKey: creator.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [requestHeapIx, executeIx.instruction],
    }).compileToV0Message();

    const executeTx = new VersionedTransaction(executeMessage);

    executeTx.sign([creator]);

    const simulationtwo = await connection.simulateTransaction(executeTx);
    console.log(simulationtwo)
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
  });

  // it("handles supersized txn", async () => {
  //   const transactionIndex = 0;
  //   const bufferIndex = 1;
  //   const CHUNK_SIZE = 700; // Safe chunk size for buffer extension
  //   const creator = await generateFundedKeypair(program.provider.connection);
    
  //   const connection = program.provider.connection;

  //   // Create dummy instruction with 200 bytes of random data
  //   function createLargeInstruction() {
  //     const randomData = crypto.randomBytes(210);
  //     return {
  //       programId: SystemProgram.programId,
  //       keys: [{ pubkey: creator.publicKey, isSigner: false, isWritable: true }],
  //       data: randomData,
  //     };
  //   }

  //   // Create 45 instructions to get close to but not exceed 10128 bytes
  //   const instructions = Array(45)
  //     .fill(null)
  //     .map(() => createLargeInstruction());

  //   const testTransferMessage = new TransactionMessage({
  //     payerKey: creator.publicKey,
  //     recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  //     instructions: instructions,
  //   });

  //   // Serialize the message
  //   const messageBuffer =
  //     superTxn.utils.transactionMessageToSuperTransactionMessageBytes({
  //       message: testTransferMessage,
  //       addressLookupTableAccounts: [],
  //     });

  //   console.log(`Total message buffer size: ${messageBuffer.length} bytes`);

  //   // Verify buffer size is within limits
  //   // if (messageBuffer.length > 10128) {
  //   //   throw new Error("Buffer size exceeds 10128 byte limit");
  //   // }
    
  //   const [transactionBuffer, _] = superTxn.getTransactionBufferPda({
  //     creator: creator.publicKey,
  //     bufferIndex,
  //   });

  //   const messageHash = crypto
  //     .createHash("sha256")
  //     .update(messageBuffer)
  //     .digest();

  //   // Calculate number of chunks needed
  //   const numChunks = Math.ceil(messageBuffer.length / CHUNK_SIZE);
  //   // console.log(`Uploading in ${numChunks} chunks`);

  //   // Initial buffer creation with first chunk
  //   const firstChunk = messageBuffer.slice(0, CHUNK_SIZE);
  //   const createIx =
  //     superTxn.generated.createTxnBufferCreateInstruction(
  //       {
  //         transactionBuffer,
  //         creator: creator.publicKey,
  //         rentPayer: creator.publicKey,
  //         systemProgram: SystemProgram.programId,
  //       },
  //       {
  //         args: {
  //           bufferIndex,
  //           finalBufferHash: Array.from(messageHash),
  //           finalBufferSize: messageBuffer.length,
  //           buffer: firstChunk,
  //         } as superTxn.generated.TransactionBufferCreateArgs,
  //       } as superTxn.generated.TxnBufferCreateInstructionArgs,
  //       programId
  //     );

  //   // Send initial chunk
  //   const createTx = new VersionedTransaction(
  //     new TransactionMessage({
  //       payerKey: creator.publicKey,
  //       recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  //       instructions: [createIx],
  //     }).compileToV0Message()
  //   );
  //   createTx.sign([creator]);
  //   const simulationcreateTx = await connection.simulateTransaction(createTx);
  //   console.log(simulationcreateTx)
  //   const signature = await connection.sendTransaction(createTx, {
  //     skipPreflight: true,
  //   });
  //   await connection.confirmTransaction(signature);

  //   // Extend buffer with remaining chunks
  //   for (let i = 1; i < numChunks; i++) {
  //     const start = i * CHUNK_SIZE;
  //     const end = Math.min(start + CHUNK_SIZE, messageBuffer.length);
  //     const chunk = messageBuffer.slice(start, end);

  //     const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
  //       bytes: 262144,
  //     });
  //     const extendIx =
  //       superTxn.generated.createTxnBufferExtendInstruction(
  //         {
  //           transactionBuffer,
  //           creator: creator.publicKey,
  //         },
  //         {
  //           args: {
  //             buffer: chunk,
  //           } as superTxn.generated.TransactionBufferExtendArgs,
  //         } as superTxn.generated.TxnBufferExtendInstructionArgs,
  //         programId
  //       );

  //     const extendTx = new VersionedTransaction(
  //       new TransactionMessage({
  //         payerKey: creator.publicKey,
  //         recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  //         instructions: [requestHeapIx, extendIx],
  //       }).compileToV0Message()
  //     );
  //     extendTx.sign([creator]);
  //     const simulationextendTx = await connection.simulateTransaction(extendTx);
  //     console.log(simulationextendTx)
  //     const sig = await connection.sendRawTransaction(extendTx.serialize(), {
  //       skipPreflight: true,
  //     });
  //     await connection.confirmTransaction(sig, "confirmed");
  //   }
  //   // console.log("Buffer upload complete");
  //   // Verify final buffer size
  //   const bufferAccount = await connection.getAccountInfo(transactionBuffer, "confirmed");
  //   const [bufferData] = superTxn.generated.TransactionBuffer.fromAccountInfo(
  //       bufferAccount!
  //     );
  //   assert.equal(bufferData.buffer.length, messageBuffer.length);

  //   // Create transaction from buffer
  //   const [transactionPda] = superTxn.getTransactionPda({
  //     creator: creator.publicKey,
  //     index: transactionIndex,
  //     programId,
  //   });

  //   const createFromBufferIx =
  //   superTxn.generated.createSuperTransactionCreateFromBufferInstruction(
  //       {
  //         superTransactionCreateItemTransaction: transactionPda,
  //         superTransactionCreateItemCreator: creator.publicKey,
  //         superTransactionCreateItemRentPayer: creator.publicKey,
  //         superTransactionCreateItemSystemProgram: SystemProgram.programId,
  //         creator: creator.publicKey,
  //         transactionBuffer: transactionBuffer,
  //       },
  //       {
  //         args: {
  //           transactionIndex: 0,
  //           ephemeralSigners: 0,
  //           transactionMessage: new Uint8Array(6).fill(0),
  //           memo: null,
  //         } as superTxn.generated.SuperTransactionCreateArgs,
  //       } as superTxn.generated.SuperTransactionCreateFromBufferInstructionArgs,
  //       programId
  //     );
  //   const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
  //     bytes: 262144,
  //   });
  //   const finalTx = new VersionedTransaction(
  //     new TransactionMessage({
  //       payerKey: creator.publicKey,
  //       recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  //       instructions: [requestHeapIx, createFromBufferIx],
  //     }).compileToV0Message()
  //   );
  //   finalTx.sign([creator]);
  //   const simulationFinalTx = await connection.simulateTransaction(finalTx);
  //   console.log(simulationFinalTx)
    
    // const finalSignature = await connection.sendRawTransaction(
    //   finalTx.serialize(),
    //   { skipPreflight: true }
    // );
    // await connection.confirmTransaction(finalSignature);

    // // Verify created transaction
    // const transactionInfo =
    //   await superTxn.accounts.SuperTransaction.fromAccountAddress(
    //     connection,
    //     transactionPda
    //   );
    // assert.equal(transactionInfo.message.instructions.length, 45);
  // });
});
