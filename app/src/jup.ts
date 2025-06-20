import "dotenv/config";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { JitoBundleSimulationResponse } from "./utils/jitoHandler";
import { JupiterSwapRoute } from "./types/jup.types";
import * as anchor from "@coral-xyz/anchor";
import { SuperTxn, IDL } from "./types/super_txn";
import * as superTxn from "super_txn";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as crypto from "crypto";
import { JitoHandler } from "./utils/jitoHandler";
import logger from "./types/logger";
import { fetchLookupTables, initializeLookupTableCacher } from "./utils/lookuptableCacher";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

let rpcUrl = process.env.RPC_URL || "";
const keypair = Keypair.fromSecretKey(
  bs58.decode(process.env.KEY || "")
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

logger.info({ arbor: feePayer.toString() });
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const WIF_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
const ME_MINT = "MEFNBXixkEbait3xn9bkm8WsJzXtVsaJEn4c8Sam21u"
const ARC_MINT = "5XyKkFaJpAmsH4Tf2EFj3S61W3hC5cJhxNZQQ5h1pump"
const JITO_MINT = "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL"
const KMNO_MINT = "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS"
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
const RAY_MINT = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"

const SPUR_API_BASE = "https://api.spur.gold/quote";

export type SpurSwapParams = {
  amount_in: string;
  mint_in: string;
  mint_out: string;
  payer_pk: string;
  encoded_bytes_limit?: string;
};

export type SpurQuoteResponse = {
  quotes: Array<{
    alts: string[];
    instructions: Array<{
      accounts: Array<{
        is_signer: boolean;
        is_writable: boolean;
        pubkey: string;
      }>;
      data: number[];
      program_id: string;
    }>;
    min_amount_out: string;
    swaps: Array<any>;
  }>;
};

const getCoinQuote = async (
  inputMint: string,
  outputMint: string,
  amount: string,
  swapMode: string = "ExactIn",
  excludeWhirlPool: boolean
) => {
  const url = new URL("https://lite-api.jup.ag/swap/v1/quote");
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("swapMode", swapMode);
  url.searchParams.set("onlyDirectRoutes", "true");
  // url.searchParams.set("autoSlippage", "true");
  url.searchParams.set("slippageBps", "1");
  if (excludeWhirlPool) {
    url.searchParams.set("excludeDexes", "Whirlpool");
  } else {
    url.searchParams.set("excludeDexes", "Obric V2,SolFi,Stabble Stable Swap");
  }

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

async function createTokenConversionRoute(
  tokens: string[],
  initialAmount: string | number
) {
  const routes: any[] = [];
  let currentAmount = initialAmount.toString();
  let excludeWhirlPool = false

  for (let i = 0; i < tokens.length; i++) {
    const fromToken = tokens[i];
    const toToken = tokens[(i + 1) % tokens.length];

    try {
      const conversion = await getCoinQuote(fromToken, toToken, currentAmount, "ExactIn", excludeWhirlPool);
      routes.push(conversion);
      logger.info(`${conversion.routePlan[0].swapInfo.label} ${fromToken.slice(0, 6)} to ${toToken.slice(0, 6)} ${conversion.outAmount}`);
      if (conversion.routePlan[0].swapInfo.label === "Whirlpool") {
        excludeWhirlPool = true
      }
      // Update current amount for next iteration
      currentAmount = conversion.outAmount;
    } catch (error) {
      console.error(`Error converting from ${fromToken} to ${toToken}:`, error);
      throw error;
    }
  }

  return { routes, currentAmount };
}

(async () => {
  // initial 0.1 sol for quote
  const initial = 0.5 * LAMPORTS_PER_SOL;
  const jitoTipAmount = 0.00002 * LAMPORTS_PER_SOL;
  const jitoTipAmount2 = 0.0001 * LAMPORTS_PER_SOL;
  const amountIn = initial + jitoTipAmount2;
  let bufferIndex = 0;
  const cacher = await initializeLookupTableCacher();


  while (true) {
    logger.info(`---- start again ----`)
    const tokenSets = [
      // [SOL_MINT, USDC_MINT, WIF_MINT, USDC_MINT],
      // [SOL_MINT, USDC_MINT, ME_MINT, USDC_MINT],
      // [SOL_MINT, USDC_MINT, BONK_MINT, USDC_MINT],
      [SOL_MINT, USDC_MINT],
      [SOL_MINT, USDT_MINT],
      [SOL_MINT, USDC_MINT, USDT_MINT],
      [SOL_MINT, USDT_MINT, USDC_MINT],
      [SOL_MINT, USDT_MINT, SOL_MINT, USDC_MINT],
      // [SOL_MINT, JUP_MINT],
      // [SOL_MINT, WIF_MINT],
      // [SOL_MINT, JUP_MINT, USDC_MINT],
      // [SOL_MINT, BONK_MINT, USDC_MINT, ME_MINT, USDC_MINT],
      // [SOL_MINT, BONK_MINT, USDC_MINT],
      // [SOL_MINT, ME_MINT, USDC_MINT],
    ];

    // Randomly select a token configuration
    const tokens = tokenSets[Math.floor(Math.random() * tokenSets.length)];

    let { routes, currentAmount } = await createTokenConversionRoute(
      tokens,
      initial
    );


    // when outAmount more than initial
    if (Number(currentAmount) > amountIn) {
      try {
        let mainInstructions = [];

        const addressLookupTableAccountKeys: PublicKey[] = [];
        for (const route of routes) {
          const instructions: any = await getTransaction(route, feePayer);
          const {
            setupInstructions,
            swapInstruction: swapInstructionPayload,
            cleanupInstruction,
            addressLookupTableAddresses,
          } = instructions;
          addressLookupTableAccountKeys.push(addressLookupTableAddresses.map((keys: string) => new PublicKey(keys)))

          if (setupInstructions) {
            mainInstructions.push(
              ...setupInstructions.map(deserializeInstruction)
            );
          }

          mainInstructions.push(deserializeInstruction(swapInstructionPayload));

          if (cleanupInstruction) {
            mainInstructions.push(deserializeInstruction(cleanupInstruction));
          }
        }

        const addressLookupTableAccounts = await fetchLookupTables(
          cacher,
          connection,
          addressLookupTableAccountKeys.flat()
        );

        logger.info(`totalInstructions: ${mainInstructions.length}`)
        logger.info(`addressLookupTableAccounts: ${addressLookupTableAccounts.length}`)
        let rawUnserializedTxns = [];
        const latestBlockHash = await connection.getLatestBlockhash("finalized");

        const mainTransferMessage = new TransactionMessage({
          payerKey: feePayer,
          recentBlockhash: PublicKey.default.toString(),
          instructions: mainInstructions,
        });
        const messageBuffer =
          superTxn.utils.transactionMessageToSuperTransactionMessageBytes({
            message: mainTransferMessage,
            addressLookupTableAccounts,
          });

        const CHUNK_SIZE = 700; // Safe chunk size for buffer extension
        const firstSlice = messageBuffer.slice(0, CHUNK_SIZE);
        logger.info(`messageBuffer: ${messageBuffer.length}`)
        const [transactionBuffer, _] = superTxn.getTransactionBufferPda({
          creator: feePayer,
          bufferIndex,
        });

        const messageHash = crypto
          .createHash("sha256")
          .update(messageBuffer)
          .digest();

        const createBufferIx = superTxn.generated.createTxnBufferCreateInstruction(
          {
            transactionBuffer,
            creator: feePayer,
            rentPayer: feePayer,
            systemProgram: SystemProgram.programId,
          },
          {
            args: {
              bufferIndex: bufferIndex,
              finalBufferHash: Array.from(messageHash),
              finalBufferSize: messageBuffer.length,
              buffer: firstSlice,
            } as superTxn.generated.TransactionBufferCreateArgs,
          } as superTxn.generated.TxnBufferCreateInstructionArgs
        );

        const jitoHandler = new JitoHandler({
          baseUrl: process.env.JITO_URL || undefined,
        });
        const jitoTip = SystemProgram.transfer({
          fromPubkey: feePayer,
          lamports: jitoTipAmount,
          toPubkey: jitoHandler.getRandomTipAccount(),
        });
        const message = new TransactionMessage({
          payerKey: feePayer,
          recentBlockhash: latestBlockHash.blockhash,
          instructions: [createBufferIx, jitoTip],
        }).compileToV0Message();

        const firstTxn = new VersionedTransaction(message);

        firstTxn.sign([keypair]);
        rawUnserializedTxns.push(firstTxn);

        const numChunks = Math.ceil(messageBuffer.length / CHUNK_SIZE);
        for (let i = 1; i < numChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, messageBuffer.length);
          const chunk = messageBuffer.slice(start, end);

          const extendIx =
            superTxn.generated.createTxnBufferExtendInstruction(
              {
                transactionBuffer,
                creator: feePayer,
              },
              {
                args: {
                  buffer: chunk,
                } as superTxn.generated.TransactionBufferExtendArgs,
              } as superTxn.generated.TxnBufferExtendInstructionArgs,
              programId
            );

          const extendTx = new VersionedTransaction(
            new TransactionMessage({
              payerKey: feePayer,
              recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
              instructions: [extendIx],
            }).compileToV0Message()
          );
          extendTx.sign([keypair]);

          rawUnserializedTxns.push(extendTx);
        }

        const [transactionPda] = superTxn.getTransactionPda({
          creator: feePayer,
          index: 0,
        });

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

        const computeBudgetIxn0 = ComputeBudgetProgram.setComputeUnitLimit({
          units: 500_000,
        });
        const thirdMessage = new TransactionMessage({
          payerKey: feePayer,
          recentBlockhash: latestBlockHash.blockhash,
          instructions: [computeBudgetIxn0, thirdIx],
        }).compileToV0Message();

        const thirdTx = new VersionedTransaction(thirdMessage);

        thirdTx.sign([keypair]);
        rawUnserializedTxns.push(thirdTx);

        const executeIx =
          await superTxn.instructions.bundledSuperTransactionExecute({
            connection,
            creator: feePayer,
            transactionMessage: mainTransferMessage,
            addressLookupTableAccounts,
            amountIn,
            transactionIndex: 0,
            programId,
          });
        const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
          bytes: 262144,
        });
        const computePrioIxn = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 10000,
        });
        const computeBudgetIxnX = ComputeBudgetProgram.setComputeUnitLimit({
          units: 1400_000,
        });
        // console.log(addressLookupTableAccounts)
        logger.info(`real addressLookupTableAccounts: ${executeIx.lookupTableAccounts.length}`)
        const executeMessage = new TransactionMessage({
          payerKey: feePayer,
          recentBlockhash: latestBlockHash.blockhash,
          instructions: [
            computePrioIxn,
            computeBudgetIxnX,
            requestHeapIx,
            executeIx.instruction,
          ],
        }).compileToV0Message(addressLookupTableAccounts);

        const executeTx = new VersionedTransaction(executeMessage);
        // logger.info(`txn size ${executeTx.message.}`)
        executeTx.sign([keypair]);
        rawUnserializedTxns.push(executeTx);
        const serializedTxns = rawUnserializedTxns.map((versionedTransaction) => versionedTransaction.serialize());
        // const signatures = rawUnserializedTxns.map((versionedTransaction) => versionedTransaction.signatures[0])
        // console.log("signatures", signatures.map((signature) => bs58.encode(signature)))

        // --- Helper function for simulation + send ---
        async function simulateAndContinueIfValid(
          jitoHandler: JitoHandler,
          txns: Uint8Array[],
          includeAccounts?: Array<PublicKey>
        ): Promise<{ simulation: JitoBundleSimulationResponse | null, bundleId?: string, totalComputeUnits?: number }> {
          const simulation = await jitoHandler.simulateBundle(txns, includeAccounts);
          if (simulation.value.summary === "succeeded") {
            const totalComputeUnits = simulation.value.transactionResults.reduce(
              (acc, tx) => acc + tx.unitsConsumed, 0
            );
            console.log(`totalComputeUnits: ${totalComputeUnits}`);
            let bundleId: string | undefined = undefined;
            bundleId = await jitoHandler.sendBundle(txns);
            return { simulation, totalComputeUnits, bundleId };
          } else {
            console.log("ignored due to:", simulation.value.summary.failed.error.TransactionFailure[1]);
            return { simulation };
          }
        }
        // --- End helper ---

        // Use the helper to simulate and send bundle
        const simulationResult = await simulateAndContinueIfValid(jitoHandler, serializedTxns, [feePayer]);
        if (!simulationResult.totalComputeUnits) {
          // Already logged reason for ignoring
          await new Promise((resolve) => setTimeout(resolve, 4000))
          continue;
        }

        // // --- Helper: Rebuild transactions with measured compute units ---
        // async function rerunWithActualComputeUnits(
        //   unitsConsumedArr: number[],
        //   buildTxFns: ((units: number) => VersionedTransaction)[],
        //   jitoHandler: JitoHandler,
        // ) {
        //   const versionedTransactions =  buildTxFns.map((fn, i) => fn(unitsConsumedArr[i]))

        //   // Rebuild each transaction with the actual units consumed
        //   const rebuiltTxns: Uint8Array[] = versionedTransactions.map((versionedTransaction) => versionedTransaction.serialize());
        //   const signatures = versionedTransactions.map((versionedTransaction) => versionedTransaction.signatures[0])
        //   const jitoTxsignature = signatures[signatures.length-1];
        //   const jitoTxsignatureBase58 = bs58.encode(jitoTxsignature);
        //   // console.log("signatures", signatures.map((signature) => bs58.encode(signature)))
        //   console.log("jitoTxsignatureBase58", jitoTxsignatureBase58)
        //   // Re-simulate
        //   // const simulation = await jitoHandler.simulateBundle(rebuiltTxns);
        //   // if (simulation.value.summary === "succeeded") {
        //     // console.log("[RERUN] simulation:", simulation.value.transactionResults)
        //     // const totalComputeUnits = simulation.value.transactionResults.reduce(
        //     //   (acc, tx) => acc + tx.unitsConsumed, 0
        //     // );
        //     // console.log(`[RERUN] totalComputeUnits: ${totalComputeUnits}`);
        //     const bundleId = await jitoHandler.sendBundle(rebuiltTxns);
        //     logger.info(`[RERUN] Bundle sent: https://explorer.jito.wtf/error/${bundleId}`);
        //     const confirmRpc = await awaitTransactionSignatureConfirmationBlockhashV2(jitoTxsignatureBase58, connection, "confirmed", latestBlockHash.lastValidBlockHeight)
        //     // console.log("confirmRpc", confirmRpc)
        //     // const confirmJito = await jitoHandler.confirmInflightBundle(bundleId);
        //     // logger.info(`Bundle confirmation result:`);
        //     // logger.info({
        //     //   confirmJito
        //     // })
        //     const bundleDetails = await jitoHandler.getCustomBundleIdData(bundleId, jitoTxsignatureBase58);
        //     logger.info(`Bundle details:`);
        //     logger.info({
        //       bundleDetails
        //     })

        //     return { bundleId };
        //   // } else {
        //   //   console.log("[RERUN] ignored due to:", simulation.value.summary.failed.error.TransactionFailure);
        //   //   await new Promise((resolve) => setTimeout(resolve, 4000))
        //   //   return {};
        //   // }
        // }
        // // --- End helper ---

        // // --- Store instructions and params for each transaction ---
        // // 1. TxnBufferCreate
        // const txnBufferCreateInstructions = [createBufferIx, jitoTip];
        // // 2. TxnBufferExtend (for each chunk > 1)
        // const txnBufferExtendInstructionsArr = [];
        // for (let i = 1; i < numChunks; i++) {
        //   const start = i * CHUNK_SIZE;
        //   const end = Math.min(start + CHUNK_SIZE, messageBuffer.length);
        //   const chunk = messageBuffer.slice(start, end);
        //   const extendIx = superTxn.generated.createTxnBufferExtendInstruction(
        //     {
        //       transactionBuffer,
        //       creator: feePayer,
        //     },
        //     {
        //       args: {
        //         buffer: chunk,
        //       } as superTxn.generated.TransactionBufferExtendArgs,
        //     } as superTxn.generated.TxnBufferExtendInstructionArgs,
        //     programId
        //   );
        //   txnBufferExtendInstructionsArr.push([extendIx]);
        // }
        // // 3. SuperTransactionCreateFromBuffer
        // const superTransactionCreateFromBufferInstructions = [thirdIx];

        // // --- Build dynamic buildTxFns array ---
        // const buildTxFns = [];
        // // First: TxnBufferCreate
        // buildTxFns.push((units: number) => {
        //   const computeBudgetIxn = ComputeBudgetProgram.setComputeUnitLimit({
        //     units: Math.ceil(units * 1.1),
        //   });
        //   computeBudgetIxn.keys.push({
        //     pubkey: new PublicKey("jitodontfront111111111111111111111111111911"),
        //     isSigner: false,
        //     isWritable: false,
        //   })
        //   const msg = new TransactionMessage({
        //     payerKey: feePayer,
        //     recentBlockhash: latestBlockHash.blockhash,
        //     instructions: [computeBudgetIxn, ...txnBufferCreateInstructions],
        //   }).compileToV0Message();
        //   const createTx = new VersionedTransaction(msg);
        //   createTx.sign([keypair]);
        //   return createTx;
        // });
        // // Middle: TxnBufferExtend for each chunk
        // txnBufferExtendInstructionsArr.forEach((extendIxs) => {
        //   buildTxFns.push((units: number) => {
        //     const computeBudgetIxn = ComputeBudgetProgram.setComputeUnitLimit({
        //       units: Math.ceil(units * 1.1),
        //     });
        //     const msg = new TransactionMessage({
        //       payerKey: feePayer,
        //       recentBlockhash: latestBlockHash.blockhash,
        //       instructions: [computeBudgetIxn, ...extendIxs],
        //     }).compileToV0Message();
        //     const extendTx = new VersionedTransaction(msg);
        //     extendTx.sign([keypair]);
        //     return extendTx;
        //   });
        // });
        // // Next: SuperTransactionCreateFromBuffer
        // buildTxFns.push((units: number) => {
        //   const computeBudgetIxn = ComputeBudgetProgram.setComputeUnitLimit({
        //     units: Math.ceil(units * 1.1),
        //   });
        //   const msg = new TransactionMessage({
        //     payerKey: feePayer,
        //     recentBlockhash: latestBlockHash.blockhash,
        //     instructions: [computeBudgetIxn, ...superTransactionCreateFromBufferInstructions],
        //   }).compileToV0Message();
        //   const createTx = new VersionedTransaction(msg);
        //   createTx.sign([keypair]);
        //   return createTx;
        // });
        // // Last: SuperTransactionExecute
        // buildTxFns.push((units: number) => {
        //   console.log("SuperTransaction Execute units", units)
        //   const computePrioIxn = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 11000 });
        //   const computeBudgetIxLast = ComputeBudgetProgram.setComputeUnitLimit({
        //     units: Math.ceil(units * 1.1),
        //   });
        //   const msg = new TransactionMessage({
        //     payerKey: feePayer,
        //     recentBlockhash: latestBlockHash.blockhash,
        //     instructions: [computeBudgetIxLast, computePrioIxn, requestHeapIx, executeIx.instruction],
        //   }).compileToV0Message(addressLookupTableAccounts);
        //   const executeTx = new VersionedTransaction(msg);
        //   executeTx.sign([keypair]);
        //   return executeTx;
        // });

        // Rerun with actual compute units + 10%
        // const simulationResults = simulationResult.simulation?.value.transactionResults;
        // if (simulationResults && simulationResults.length === buildTxFns.length) {
        //   await rerunWithActualComputeUnits(
        //     simulationResults.map(tx => tx.unitsConsumed),
        //     buildTxFns,
        //     jitoHandler
        //   );
        // } else {
        //   logger.error('Simulation results do not match transaction count for rebuild.');
        // }


      } catch (e) {
        logger.info(e)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
})();

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
