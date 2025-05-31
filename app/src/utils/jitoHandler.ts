import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SignatureStatus,
  TransactionConfirmationStatus,
  TransactionError,
} from "@solana/web3.js";
import logger from "../types/logger";
import { setTimeout } from "timers/promises";
import base58 from "bs58";
export const enum TransactionStatus {
  BLOCKHEIGHT_EXCEEDED = 0,
  PROCESSED = 1,
  TIMED_OUT = 2,
}

export type JitoRegion = "london" | "mainnet" | "amsterdam" | "frankfurt" | "ny" | "tokyo";

interface JsonRpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any[];
}

interface BundleStatus {
  status: string;
  landed_slot?: number;
}

interface BundleTransaction {
  bundle_id: string;
  transactions: string[]; // base-58 encoded signatures
  slot: number; // u64
  confirmationStatus: TransactionConfirmationStatus;
  err: TransactionError | null;
}

// Result type
interface BundleStatusResult {
  context: Context;
  value: BundleTransaction[];
}

interface JsonRpcResponseSimulate<T> {
  jsonrpc: string;
  value: T;
  context: Context;
  error: any;
}
interface JsonRpcResponse<T> {
  jsonrpc: string;
  result: T;
  context: Context;
  error: any;
}

// Context type
interface Context {
  apiVersion: string;
  slot: number;
}

// Bundle status type
type BundleStatusInflight =
  | "Invalid" // BundleId not in system (5 minute look back)
  | "Pending" // Not failed, not landed, not invalid
  | "Failed" // All regions marked as failed and not forwarded
  | "Landed"; // Landed on-chain

// Individual bundle status info
interface BundleStatusInfo {
  bundle_id: string;
  status: BundleStatusInflight;
  landed_slot: number | null;
}

// Result type
interface InflightBundleResult {
  context: Context;
  value: BundleStatusInfo[];
}

interface TipFeeResponse {
  time: string;
  landed_tips_25th_percentile: number;
  landed_tips_50th_percentile: number;
  landed_tips_75th_percentile: number;
  landed_tips_95th_percentile: number;
  landed_tips_99th_percentile: number;
  ema_landed_tips_50th_percentile: number;
}

type JitoBundleSimulation = {
  summary: 'succeeded' | {
    failed: {
      error: {
        TransactionFailure: [number[], string];
      };
      tx_signature: string;
    };
  };
  transactionResults: Array<{
    err: null | unknown;
    logs: string[];
    postExecutionAccounts: null | unknown;
    preExecutionAccounts: null | unknown;
    returnData: null | unknown;
    unitsConsumed: number;
  }>;
};

// Complete response type
type InflightBundleStatusResponse =
  JsonRpcResponse<InflightBundleResult> | null;
type BundleStatusResponse = JsonRpcResponse<BundleStatusResult> | null;

export type JitoBundleSimulationResponse = JsonRpcResponseSimulate<JitoBundleSimulation> | null;


type SendBundleResponse = JsonRpcResponse<string> | null;

// Type for the custom bundle ID API response
/**
 * Represents the response structure for a custom Jito bundle ID query.
 * Each object in the array provides detailed information about a bundle.
 */
export interface JitoBundleIdData {
  /** The unique identifier for the bundle */
  bundleId: string;
  /** The Solana slot in which the bundle landed */
  slot: number;
  /** The validator that processed the bundle */
  validator: string;
  /** Array of tipper account addresses for this bundle */
  tippers: string[];
  /** Total tip paid by the bundle, in lamports */
  landedTipLamports: number;
  /** Compute units consumed by the bundle */
  landedCu: number;
  /** Block index of the bundle within the slot */
  blockIndex: number;
  /** Timestamp when the bundle landed (ISO 8601 string) */
  timestamp: string;
  /** Array of transaction signatures included in the bundle */
  txSignatures: string[];
}

interface JitoBundleTransactionData {
  /** The unique identifier for the bundle */
  bundleId: string;
  
}

export class JitoHandler {
  private baseUrl: string;
  private endpoints: Record<JitoRegion, string>;
  jitoTipAmount: number = 100_000;

  constructor({
    region = "mainnet",
    bundle = true,
    uuid,
    baseUrl,
  }: {
    region?: JitoRegion;
    bundle?: boolean;
    uuid?: string;
    baseUrl?: string;
  }) {
    this.endpoints = {
      mainnet: "https://mainnet.block-engine.jito.wtf/api/v1",
      london: "https://london.mainnet.block-engine.jito.wtf/api/v1",
      amsterdam: "https://block-engine.mainnet.amsterdam.jito.wtf/api/v1",
      frankfurt: "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1",
      ny: "https://ny.mainnet.block-engine.jito.wtf/api/v1",
      tokyo: "https://tokyo.mainnet.block-engine.jito.wtf/api/v1",
    };

    let endpoint = bundle
      ? this.endpoints[region] + "/bundles"
      : this.endpoints[region] + "/transactions";
    this.baseUrl = baseUrl ? baseUrl : endpoint + (uuid ? `?uuid=${uuid}` : "");
  }

  getTipAccounts(): PublicKey[] {
    return [
      new PublicKey("3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"),
      new PublicKey("Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"),
      new PublicKey("DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh"),
      new PublicKey("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5"),
      new PublicKey("HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe"),
      new PublicKey("ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49"),
      new PublicKey("ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt"),
      new PublicKey("DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL"),
    ];
  }

  getRandomTipAccount(): PublicKey {
    const tipAccounts = this.getTipAccounts();
    const randomIndex = Math.floor(Math.random() * tipAccounts.length);
    return tipAccounts[randomIndex];
  }

  getPriorityLevelMaxFee(priorityLevel: "Fast" | "Turbo" | "Ultra") {
    switch (priorityLevel) {
      case "Fast":
        return 100_000;
      case "Turbo":
        return 1_000_000;
      case "Ultra":
        return 10_000_000;
      default:
        return 100_000;
    }
  }
  calculateTipFee = (
    tipData: TipFeeResponse,
    priorityLevel: "Fast" | "Turbo" | "Ultra" = "Fast",
    maxFee?: number,
  ): number => {
    // Calculate fee based on priority level
    const calculatedFee = (() => {
      switch (priorityLevel) {
        case "Fast":
          return tipData.landed_tips_50th_percentile * 2;
        case "Turbo":
          return tipData.landed_tips_75th_percentile;
        case "Ultra":
          return tipData.landed_tips_95th_percentile;
        default:
          return tipData.landed_tips_50th_percentile * 2;
      }
    })();

    // Apply max fee cap if provided
    return maxFee ? Math.min(calculatedFee, maxFee) : calculatedFee;
  };

  // NOTE: THIS IS IN HTTP, NOT HTTPS
  async getJitoTipFees(): Promise<TipFeeResponse[]> {
    try {
      const response = await fetch(
        "http://bundles-api-rest.jito.wtf/api/v1/bundles/tip_floor",
      );
      const data: any = await response.json();

      // Convert all tip values to lamports
      return data.map((item: TipFeeResponse) => ({
        ...item,
        landed_tips_25th_percentile:
          item.landed_tips_25th_percentile * LAMPORTS_PER_SOL,
        landed_tips_50th_percentile:
          item.landed_tips_50th_percentile * LAMPORTS_PER_SOL,
        landed_tips_75th_percentile:
          item.landed_tips_75th_percentile * LAMPORTS_PER_SOL,
        landed_tips_95th_percentile:
          item.landed_tips_95th_percentile * LAMPORTS_PER_SOL,
        landed_tips_99th_percentile:
          item.landed_tips_99th_percentile * LAMPORTS_PER_SOL,
        ema_landed_tips_50th_percentile:
          item.ema_landed_tips_50th_percentile * LAMPORTS_PER_SOL,
      }));
    } catch (error) {
      console.error("Error fetching Jito tip fees:", error);
      throw error;
    }
  }
  async sendBundle(serializedTxs: (Uint8Array | number[])[]): Promise<string> {
    // Base64 encode each Uint8Array param
    const encodedTxs = serializedTxs.map((tx) => Buffer.from(tx).toString('base64'));
    const rpcParams = [encodedTxs, { encoding: "base64" }];
    return (await this.sendTx({
      params: rpcParams,
      method: "sendBundle",
    })) as unknown as string;
  }

  async sendTransaction(serializedTx: Uint8Array | number[]): Promise<string> {
    // Base64 encode the Uint8Array param
    const encodedTx = Buffer.from(serializedTx).toString('base64');
    const rpcParams = [encodedTx, { encoding: "base64" }];
    return (await this.sendTx({
      params: rpcParams,
      method: "sendTransaction",
    })) as unknown as string;
  }

  async getInFlightBundleStatuses(
    params: any[],
  ): Promise<InflightBundleResult> {
    return (await this.sendTx({
      method: "getInflightBundleStatuses",
      params,
    })) as unknown as InflightBundleResult;
  }

  async simulateBundle(
    params: Uint8Array[],
    includeAccounts?: Array<PublicKey>
  ): Promise<JitoBundleSimulationResponse> {
    // Base64 encode each Uint8Array param
    const encodedTransactions = params.map((tx) => Buffer.from(tx).toString('base64'));
    const config = {
      encoding: "base64",
      skipSigVerify: true,
      replaceRecentBlockhash: true,
      preExecutionAccountsConfigs: params.map(() => ({ addresses: includeAccounts
        ? includeAccounts.map((account) => account.toBase58())
        : []})),
      postExecutionAccountsConfigs: params.map((_, index) => ({
        addresses: includeAccounts
            ? includeAccounts.map((account) => account.toBase58())
            : []
      })),
     }

    return (await this.sendTx({
      method: "simulateBundle",
      params:[{ encodedTransactions }, config],
    })) as unknown as JitoBundleSimulationResponse;
  }

  async getBundleStatuses(params: any[]): Promise<BundleStatusResult> {
    return (await this.sendTx({
      method: "getBundleStatuses",
      params,
    })) as unknown as BundleStatusResult;
  }

  /**
   * Fetch custom bundle data from Jito bundles API
   * @param bundleId the bundle id to query
   * @returns parsed JSON response from the API
   */
  /**
   * Fetch detailed information about a specific bundle from the Jito bundles API.
   *
   * Example usage:
   *   const bundleData = await jitoHandler.getCustomBundleIdData('your_bundle_id');
   *
   * @param bundleId - The unique bundle ID to query.
   * @returns Promise resolving to an array of JitoBundleIdData objects, each describing bundle details.
   * @throws If the API request fails or returns a non-OK status.
   */
  async getCustomBundleIdData(bundleId: string, transactionId?: string): Promise<JitoBundleIdData[] | null> {
    const url = `https://bundles.jito.wtf/api/v1/bundles/bundle/${bundleId}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      if(transactionId){
        await setTimeout(2000);
        const newBundleId = await this.getCustomBundleTransactionData(transactionId);
        if(newBundleId){
          return this.getCustomBundleIdData(newBundleId[0].bundleId);
        }
      }
      return null;
    }
    return await resp.json() as JitoBundleIdData[];
  }
  async getCustomBundleTransactionData(transactionId: string): Promise<JitoBundleTransactionData[] | null> {
    const url = `https://bundles.jito.wtf/api/v1/bundles/transaction/${transactionId}`;
    const resp = await fetch(url);
    // console.log("getCustomBundleTransactionData",resp)
    if (!resp.ok) {
      return null;
    }
    return await resp.json() as JitoBundleTransactionData[];
  }

  async confirmInflightBundle(
    bundleId: string,
    timeoutMs = 20000,
  ): Promise<{
    status: SignatureStatus | null;
    transactionStatus: TransactionStatus;
    bundleError?: {
      error: string;
      errorDetails: string;
    };
  }> {
    const start = Date.now();

    let status: SignatureStatus = {
      slot: 0,
      confirmations: 0,
      err: null,
    };

    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.getInFlightBundleStatuses([[bundleId]]);
        if (result && result.value && result.value.length > 0) {
          const bundleStatus = result.value[0] as BundleStatus;

          logger.info(
            `Bundle status: ${bundleStatus.status}, Landed slot: ${bundleStatus.landed_slot}`,
          );

          // Fetch bundle error details
          let bundleError;
          try {
            const errorResponse = await fetch(`https://bundles.jito.wtf/api/v1/bundles/get_bundle_error/${bundleId}`);
            const errorData: any = await errorResponse.json();
            console.log(errorData)

            if (errorData && errorData.length > 0) {
              bundleError = {
                error: errorData[0].error,
                errorDetails: errorData[0].errorDetails
              };
              return {
                status: null,
                transactionStatus: TransactionStatus.TIMED_OUT,
                bundleError,
              };
            }
          } catch (errorFetchError) {
            logger.error('Failed to fetch bundle error details:', errorFetchError);
          }
          if (bundleStatus.status === "Landed") {
            // If the bundle has landed, get more detailed status
            const detailedStatus = await this.getBundleStatuses([[bundleId]]);
            if (
              detailedStatus &&
              detailedStatus.value &&
              detailedStatus.value.length > 0
            ) {
              const bundleStatus = detailedStatus.value[0] as BundleTransaction;
              status.slot = bundleStatus.slot;
              status.confirmations = 1;
              status.err = bundleStatus.err;

              return {
                status: status,
                transactionStatus: TransactionStatus.PROCESSED,
              };
            } else {
              logger.info("No detailed status returned for landed bundle.");
              return {
                status: status,
                transactionStatus: TransactionStatus.TIMED_OUT,
              };
            }
          }
        } else {
          logger.info(
            "No status returned for the bundle. It may be invalid or very old.",
          );
        }
      } catch (error) {
        console.error("Error checking bundle status:", error);
      }

      // Wait for a short time before checking again
      await setTimeout(2000);
    }

    // If we've reached this point, the bundle hasn't reached a final state within the timeout
    logger.info(
      `Bundle ${bundleId} has not reached a final state within ${timeoutMs}ms`,
    );
    return {
      status: status,
      transactionStatus: TransactionStatus.TIMED_OUT,
    };
  }

  async sendTx({
    method,
    params,
  }: {
    method: string;
    params?: any;
  }): Promise<BundleStatusResult | InflightBundleResult | string> {
    let payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: params || [],
    };
    // console.log("payload", payload)
    const response = await fetch(`${this.baseUrl}`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    // @ts-ignore
    const json:
      | InflightBundleStatusResponse
      | BundleStatusResponse
      | SendBundleResponse = await response.json();
    // if (json.result) {
    //   console.log("SendBundle Response", json.result);
    // }
    // console.log("SendBundle Response", json)
    if (!json) {
      throw new Error("No response from Jito");
    }
    if (json.error) {
      throw new Error(json.error.message);
    }
    // logger.info("SendBundle Response", json);
    return json.result;
  }
}