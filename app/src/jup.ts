import "dotenv/config";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { JupiterSwapRoute } from "./jup.types";
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
const WIF_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const getCoinQuote = async (
  inputMint: string,
  outputMint: string,
  amount: string,
  swapMode: string = "ExactIn"
) => {
  const url = new URL(`${process.env.JUP_URL || "https://quote-api.jup.ag/v6"}/quote`);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("swapMode", swapMode);
  url.searchParams.set("onlyDirectRoutes", "true");
  url.searchParams.set("slippageBps", "50");
  url.searchParams.set("excludeDexes", "Whirlpool");

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
  const url = new URL(`${process.env.JUP_URL || "https://quote-api.jup.ag/v6"}/swap-instructions`);

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

  for (let i = 0; i < tokens.length; i++) {
    const fromToken = tokens[i];
    const toToken = tokens[(i + 1) % tokens.length];

    try {
      const conversion = await getCoinQuote(fromToken, toToken, currentAmount);

      routes.push(conversion);
      console.log(`${fromToken} to ${toToken}`, conversion.outAmount);

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
  const initial = 1 * LAMPORTS_PER_SOL;
  const jitoTipAmount = 0.0002 * LAMPORTS_PER_SOL;
  let bufferIndex = 0;

  // while (true) {
    // const tokens = [SOL_MINT, USDC_MINT, WIF_MINT, USDC_MINT];
    const tokens = [SOL_MINT, USDC_MINT, WIF_MINT, USDC_MINT, BONK_MINT, USDC_MINT];
    // const tokens = [SOL_MINT, USDC_MINT, CHILLGUY_MINT, USDC_MINT];
    // const tokens = [SOL_MINT, FOMO_MINT];
    // const tokens = [SOL_MINT, USDC_MINT, WIF_MINT, USDC_MINT];
    // const tokens = [SOL_MINT, BONK_MINT, USDC_MINT, JLP_MINT, USDC_MINT];
    // const tokens = [SOL_MINT, BONK_MINT, USDC_MINT];
    // const tokens = [SOL_MINT, FOMO_MINT, SOL_MINT, USDC_MINT];

    let { routes, currentAmount } = await createTokenConversionRoute(
      tokens,
      initial
    );

    // when outAmount more than initial
    if (Number(currentAmount) > initial + jitoTipAmount) {
      let mainInstructions = [];

      const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
      const addressLookupTableAccountKeys: string[] = [];
      for (const route of routes) {
        const instructions: any = await getTransaction(route, feePayer);
        const {
          setupInstructions, 
          swapInstruction: swapInstructionPayload,
          cleanupInstruction, 
          addressLookupTableAddresses, 
        } = instructions;
        addressLookupTableAccountKeys.push(addressLookupTableAddresses)

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

      addressLookupTableAccounts.push(
        ...(await getAddressLookupTableAccounts(addressLookupTableAccountKeys.flat()))
      );

      console.log('totalInstructions: ', mainInstructions.length)
      let serializedTxns = [];
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

      const firstSlice = messageBuffer.slice(0, 700);
      console.log("messageBuffer.length", messageBuffer.length);
      const [transactionBuffer, _] = superTxn.getTransactionBufferPda({
        creator: feePayer,
        bufferIndex,
      });

      const messageHash = crypto
        .createHash("sha256")
        .update(messageBuffer)
        .digest();

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
            finalBufferHash: Array.from(messageHash),
            finalBufferSize: messageBuffer.length,
            buffer: firstSlice,
          } as superTxn.generated.TransactionBufferCreateArgs,
        } as superTxn.generated.TxnBufferCreateInstructionArgs
      );

      const jitoHandler = new JitoHandler();
      const jitoTip = SystemProgram.transfer({
        fromPubkey: feePayer,
        lamports: jitoTipAmount,
        toPubkey: jitoHandler.getRandomTipAccount(),
      });
      const message = new TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: latestBlockHash.blockhash,
        instructions: [ix, jitoTip],
      }).compileToV0Message();

      const firstTxn = new VersionedTransaction(message);

      firstTxn.sign([keypair]);
      serializedTxns.push(firstTxn.serialize());

      const secondSlice = messageBuffer.slice(700, messageBuffer.byteLength);
      if (secondSlice.length != 0) {
        const secondIx = superTxn.generated.createTxnBufferExtendInstruction(
          {
            transactionBuffer,
            creator: feePayer,
          },
          {
            args: {
              buffer: secondSlice,
            } as superTxn.generated.TransactionBufferExtendArgs,
          } as superTxn.generated.TxnBufferExtendInstructionArgs
        );

        const secondMessage = new TransactionMessage({
          payerKey: feePayer,
          recentBlockhash: latestBlockHash.blockhash,
          instructions: [secondIx],
        }).compileToV0Message();

        const secondTx = new VersionedTransaction(secondMessage);

        secondTx.sign([keypair]);
        serializedTxns.push(secondTx.serialize());
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

      const thirdMessage = new TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: latestBlockHash.blockhash,
        instructions: [thirdIx],
      }).compileToV0Message();

      const thirdTx = new VersionedTransaction(thirdMessage);

      thirdTx.sign([keypair]);
      serializedTxns.push(thirdTx.serialize());

      const executeIx =
        await superTxn.instructions.bundledSuperTransactionExecute({
          connection,
          creator: feePayer,
          transactionMessage: mainTransferMessage,
          addressLookupTableAccounts,
          transactionIndex: 0,
          programId,
        });
      const requestHeapIx = ComputeBudgetProgram.requestHeapFrame({
        bytes: 262144,
      });
      const computeBudgetIxn = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      });
      const executeMessage = new TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: latestBlockHash.blockhash,
        instructions: [
          computeBudgetIxn,
          requestHeapIx,
          executeIx.instruction,
        ],
      }).compileToV0Message(addressLookupTableAccounts);

      const executeTx = new VersionedTransaction(executeMessage);
      executeTx.sign([keypair]);

      serializedTxns.push(executeTx.serialize());
      const jitoBundle = await jitoHandler.sendBundle(serializedTxns);
      console.log(`https://explorer.jito.wtf/error/${jitoBundle}`);

      const confirmJito = await jitoHandler.confirmInflightBundle(jitoBundle);
      console.log(confirmJito);
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  // }
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
