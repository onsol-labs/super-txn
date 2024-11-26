import "dotenv/config";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  AccountMeta,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { JupiterSwapRoute, RoutePlanItem } from "./jup.types";
import { parseErrorForTransaction } from "@mercurial-finance/optimist";
import * as anchor from "@coral-xyz/anchor";
import { SuperTxn, IDL } from "./types/super_txn";
import * as superTxn from "super_txn";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as crypto from "crypto";
import { JitoHandler } from "./jitoHandler";

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

console.log({ arbor: feePayer.toString() });
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

const getCoinQuote = async (
  inputMint: string,
  outputMint: string,
  amount: string,
  swapMode: string = "ExactOut"
) => {
  const url = new URL("https://quote-api.jup.ag/v6/quote");
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("swapMode", swapMode);
  url.searchParams.set("onlyDirectRoutes", "true");
  url.searchParams.set("slippageBps", "100");
  url.searchParams.set("excludeDexes", "Whirlpool,Raydium CLMM");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return (await response.json()) as JupiterSwapRoute;
};

const getTransaction = async (
  quoteResponse: JupiterSwapRoute,
  publicKey: PublicKey
) => {
  const url = new URL("https://quote-api.jup.ag/v6/swap-instructions");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: publicKey.toString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

(async () => {
  // initial 0.1 sol for quote
  const initial = 0.01 * LAMPORTS_PER_SOL;
  // 23_363_040
  // const jitoTipAmount = 0.0001 * LAMPORTS_PER_SOL;
  // 100_067_429
  let bufferIndex = 0;

  //   while (true) {
  // let routes = [];
  // const solToUsdc = await getCoinQuote(
  //   SOL_MINT,
  //   USDC_MINT,
  //   initial.toString(),
  //   "ExactIn"
  // );
  // // console.log({solToUsdc})

  // routes.push(solToUsdc);
  // const usdcToBonk = await getCoinQuote(
  //   USDC_MINT,
  //   BONK_MINT,
  //   solToUsdc.outAmount,
  //   "ExactIn"
  // );
  // routes.push(usdcToBonk);
  // console.log(solToUsdc.outAmount);
  // const bonkToUsdc = await getCoinQuote(
  //   BONK_MINT,
  //   USDC_MINT,
  //   usdcToBonk.outAmount,
  //   "ExactIn"
  // );
  // // // console.log({solToUsdc})

  // // console.log(bonkToUsdc.outAmount);
  // routes.push(bonkToUsdc);
  // const usdcToSol = await getCoinQuote(
  //   USDC_MINT,
  //   SOL_MINT,
  //   // solToUsdc.outAmount,
  //   bonkToUsdc.outAmount,
  //   "ExactIn"
  // );
  // // console.log({ solToUsdc });
  // console.log({ usdcToSol });
  // routes.push(usdcToSol);

  // // when outAmount more than initial
  // if (Number(usdcToSol.outAmount) > initial) {
  //   let mainInstructions = [];

  //   const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
  //   await Promise.all(
  //     routes.map(async (route) => {
  //       const instructions: any = await getTransaction(route, feePayer);
  //       // console.log({ instructions });
  //       const {
  //         setupInstructions, // Setup missing ATA for the users.
  //         swapInstruction: swapInstructionPayload, // The actual swap instruction.
  //         cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
  //         addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
  //       } = instructions;

  //       addressLookupTableAccounts.push(
  //         ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
  //       );
  //       if (setupInstructions) {
  //         mainInstructions.push(
  //           ...setupInstructions.map(deserializeInstruction)
  //         );
  //       }
  //       mainInstructions.push(deserializeInstruction(swapInstructionPayload));
  //       if (cleanupInstruction) {
  //         mainInstructions.push(deserializeInstruction(cleanupInstruction));
  //       }
  //     })
  //   );
  //   // console.log({mainInstructions})
  //   // console.log({ addressLookupTableAccounts });
  //   let serializedTxns = [];
  //   // const simulationOne = await connection.simulateTransaction(transaction);
  //   // console.log(simulationOne);
  //   // Add third instruction to the message.
    const blockhash = await connection.getLatestBlockhash("finalized");

  //   const mainTransferMessage = new TransactionMessage({
  //     payerKey: feePayer,
  //     recentBlockhash: PublicKey.default.toString(),
  //     instructions: mainInstructions,
  //   });
  //   const messageBuffer =
  //     superTxn.utils.transactionMessageToSuperTransactionMessageBytes({
  //       message: mainTransferMessage,
  //       addressLookupTableAccounts,
  //     });

  //   const firstSlice = messageBuffer.slice(0, 700);
  //   console.log("firstSlice.length", firstSlice.length);
  //   console.log("messageBuffer.length", messageBuffer.length);
    const [transactionBuffer, _] = superTxn.getTransactionBufferPda({
      creator: feePayer,
      bufferIndex,
    });

  //   const messageHash = crypto
  //     .createHash("sha256")
  //     .update(messageBuffer)
  //     .digest();

  //   const ix = superTxn.generated.createTxnBufferCreateInstruction(
  //     {
  //       transactionBuffer,
  //       creator: feePayer,
  //       rentPayer: feePayer,
  //       systemProgram: SystemProgram.programId,
  //     },
  //     {
  //       args: {
  //         bufferIndex: bufferIndex,
  //         // Must be a SHA256 hash of the message buffer.
  //         finalBufferHash: Array.from(messageHash),
  //         finalBufferSize: messageBuffer.length,
  //         buffer: firstSlice,
  //       } as superTxn.generated.TransactionBufferCreateArgs,
  //     } as superTxn.generated.TxnBufferCreateInstructionArgs
  //   );

  //   // const jitoHandler = new JitoHandler();
  //   // const jitoTip = SystemProgram.transfer({
  //   //   fromPubkey: feePayer,
  //   //   lamports: jitoTipAmount, // 0.0001 * LAMPORTS_PER_SOL,
  //   //   toPubkey: jitoHandler.getRandomTipAccount(),
  //   // });
  //   const computeBudgetPriceIxn1 = ComputeBudgetProgram.setComputeUnitPrice({
  //     microLamports: 500_000,
  //   });
  //   const message = new TransactionMessage({
  //     payerKey: feePayer,
  //     recentBlockhash: blockhash.blockhash,
  //     // instructions: [ix, jitoTip],
  //     instructions: [computeBudgetPriceIxn1, ix],
  //   }).compileToV0Message();

  //   const firstTxn = new VersionedTransaction(message);

  //   firstTxn.sign([keypair]);
  //   // serializedTxns.push(firstTxn.serialize());
  //     // const simulation = await connection.simulateTransaction(firstTxn, {
  //     //   replaceRecentBlockhash: true
  //     // });
  //     // console.log(simulation);
  //   // Send first transaction.
  //   const signature = await connection.sendTransaction(firstTxn);
  //   await connection.confirmTransaction(signature);
  //   console.log(signature)

  //   const secondSlice = messageBuffer.slice(700, messageBuffer.byteLength);
  //   console.log(secondSlice.length, "secondSlice.length");
  //   if (secondSlice.length != 0) {
  //     // Extned the buffer.
  //     const secondIx = superTxn.generated.createTxnBufferExtendInstruction(
  //       {
  //         transactionBuffer,
  //         creator: feePayer,
  //       },
  //       {
  //         args: {
  //           buffer: secondSlice,
  //         } as superTxn.generated.TransactionBufferExtendArgs,
  //       } as superTxn.generated.TxnBufferExtendInstructionArgs
  //     );

  //     const secondMessage = new TransactionMessage({
  //       payerKey: feePayer,
  //       recentBlockhash: blockhash.blockhash,
  //       instructions: [computeBudgetPriceIxn1, secondIx],
  //     }).compileToV0Message();

  //     const secondTx = new VersionedTransaction(secondMessage);

  //     secondTx.sign([keypair]);
  //     const signature = await connection.sendTransaction(secondTx);
  //     await connection.confirmTransaction(signature);
  //     console.log(signature)
  //     // serializedTxns.push(secondTx.serialize());
  //     // console.log("secondTx ok");
  //   }
    // Send second transaction to extend.
    //   const secondSignature = await connection.sendTransaction(secondTx);

    // const simulation = await connection.simulateTransaction(secondTx);
    // console.log(simulation)
    //   await connection.confirmTransaction(secondSignature);

    // Final chunk uploaded. Check that length is as expected.
    //   console.log(txBufferDeser2.buffer.length)

    // // Derive super transaction PDA.
    // const [transactionPda] = superTxn.getTransactionPda({
    //   creator: feePayer,
    //   index: 0,
    // });

    //   const transactionAccountInfo = await connection.getAccountInfo(transactionPda);

    //   Create final instruction.
    // const [transactionPda] = superTxn.getTransactionPda({
    //   creator: feePayer,
    //   index: 0,
    // });
    // const thirdIx =
    //   superTxn.generated.createSuperTransactionCreateFromBufferInstruction(
    //     {
    //       superTransactionCreateItemTransaction: transactionPda,
    //       superTransactionCreateItemCreator: feePayer,
    //       superTransactionCreateItemRentPayer: feePayer,
    //       superTransactionCreateItemSystemProgram: SystemProgram.programId,
    //       creator: feePayer,
    //       transactionBuffer: transactionBuffer,
    //     },
    //     {
    //       args: {
    //         transactionIndex: 0,
    //         ephemeralSigners: 0,
    //         transactionMessage: new Uint8Array(6).fill(0),
    //         memo: null,
    //       } as superTxn.generated.SuperTransactionCreateArgs,
    //     } as superTxn.generated.SuperTransactionCreateFromBufferInstructionArgs
    //   );

    // const thirdMessage = new TransactionMessage({
    //   payerKey: feePayer,
    //   recentBlockhash: blockhash.blockhash,
    //   instructions: [thirdIx],
    // }).compileToV0Message();

    // const thirdTx = new VersionedTransaction(thirdMessage);

    // thirdTx.sign([keypair]);
    // // serializedTxns.push(thirdTx.serialize());

    // // const simulation = await connection.simulateTransaction(thirdTx);
    // // console.log(simulation);
    // //   Send final transaction.
    //   const thirdSignature = await connection.sendRawTransaction(
    //     thirdTx.serialize(),
    //     {
    //       skipPreflight: true,
    //     }
    //   );

    //   await connection.confirmTransaction(
    //     {
    //       signature: thirdSignature,
    //       blockhash: blockhash.blockhash,
    //       lastValidBlockHeight: blockhash.lastValidBlockHeight,
    //     },
    //     "confirmed"
    //   );

    //   const transactionInfo =
    //     await superTxn.accounts.SuperTransaction.fromAccountAddress(
    //       connection,
    //       transactionPda
    //     );
    //   console.log(transactionInfo)
    // console.log(accountMetas)



    const executeIx =
    await superTxn.instructions.superTransactionExecute({
      connection,
      creator: feePayer,
      transactionIndex: 0,
      programId,
    });
    const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
      bytes: 262144,
    });
    const computeBudgetIxn = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_000_000,
    });
    const computeBudgetPriceIxn = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 500_000,
    });
    const executeMessage = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash.blockhash,
      instructions: [
        computeBudgetPriceIxn,
        computeBudgetIxn,
        requestHeapIx,
        executeIx.instruction,
      ],
    }).compileToV0Message(executeIx.lookupTableAccounts);

    const executeTx = new VersionedTransaction(executeMessage);
    executeTx.sign([keypair]);
    const latestBlockHash = await connection.getLatestBlockhash("finalized");

    const simulation = await connection.simulateTransaction(executeTx);
    console.log(simulation);
      // const executeSignature = await connection.sendRawTransaction(
      //   executeTx.serialize(),
      //   {
      //     skipPreflight: true,
      //   }
      // );

      // await connection.confirmTransaction(
      //   {
      //     signature: executeSignature,
      //     blockhash: latestBlockHash.blockhash,
      //     lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      //   },
      //   "confirmed"
      // );
  // }
})();

const getAccountMetas = (instructions: any): AccountMeta[] => {
  // console.log(instructions)
  return instructions
    .map((instruction) =>
      instruction.keys.map((key: any) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      }))
    )
    .flat();
};

const deserializeInstruction = (instruction: any) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
};

const getAddressLookupTableAccounts = async (
  keys: string[]
): Promise<AddressLookupTableAccount[]> => {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
};
