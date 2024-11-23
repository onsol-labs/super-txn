import {
    LAMPORTS_PER_SOL,
    PublicKey,
    SignatureStatus,
    TransactionConfirmationStatus,
    TransactionError,
  } from "@solana/web3.js";
  import bs58 from "bs58";
  
  export const enum TransactionStatus {
    BLOCKHEIGHT_EXCEEDED = 0,
    PROCESSED = 1,
    TIMED_OUT = 2,
  }
  
  export type JitoRegion = "mainnet" | "amsterdam" | "frankfurt" | "ny" | "tokyo";
  
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
  
  // Context type
  interface Context {
    slot: number;
  }
  
  interface JsonRpcResponse<T> {
    jsonrpc: string;
    result: T;
    id: number;
    error: any;
  }
  
  // Context type
  interface Context {
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
  
  // Complete response type
  type InflightBundleStatusResponse =
    JsonRpcResponse<InflightBundleResult> | null;
  type BundleStatusResponse = JsonRpcResponse<BundleStatusResult> | null;
  
  type SendBundleResponse = JsonRpcResponse<string> | null;
  
  export class JitoHandler {
    private baseUrl: string;
    private endpoints: Record<JitoRegion, string>;
    jitoTipAmount: number = 100_000;
  
    constructor(
      region: JitoRegion = "mainnet",
      bundle: boolean = true,
      baseUrl?: string,
    ) {
      this.endpoints = {
        mainnet: "https://mainnet.block-engine.jito.wtf/api/v1",
        amsterdam: "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1",
        frankfurt: "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1",
        ny: "https://ny.mainnet.block-engine.jito.wtf/api/v1",
        tokyo: "https://tokyo.mainnet.block-engine.jito.wtf/api/v1",
      };
  
      let endpoint = bundle
        ? this.endpoints[region] + "/bundles"
        : this.endpoints[region] + "/transactions";
      this.baseUrl = baseUrl ? baseUrl : endpoint;
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
      const params = [serializedTxs.map((t) => bs58.encode(t))];
      return (await this.sendTx({
        params,
        method: "sendBundle",
      })) as unknown as string;
    }
  
    async sendTransaction(serializedTx: Uint8Array | number[]): Promise<string> {
      const params = [bs58.encode(serializedTx)];
      return (await this.sendTx({
        params,
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
  
    async getBundleStatuses(params: any[]): Promise<BundleStatusResult> {
      return (await this.sendTx({
        method: "getBundleStatuses",
        params,
      })) as unknown as BundleStatusResult;
    }
  
    async confirmInflightBundle(
      bundleId: string,
      timeoutMs = 60000,
    ): Promise<{
      status: SignatureStatus | null;
      transactionStatus: TransactionStatus;
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
  
            console.log(
              `Bundle status: ${bundleStatus.status}, Landed slot: ${bundleStatus.landed_slot}`,
            );
  
            if (bundleStatus.status === "Failed") {
              return {
                status: null,
                transactionStatus: TransactionStatus.TIMED_OUT,
              };
            } else if (bundleStatus.status === "Landed") {
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
                console.log("No detailed status returned for landed bundle.");
                return {
                  status: status,
                  transactionStatus: TransactionStatus.TIMED_OUT,
                };
              }
            }
          } else {
            console.log(
              "No status returned for the bundle. It may be invalid or very old.",
            );
          }
        } catch (error) {
          console.error("Error checking bundle status:", error);
        }
  
        // Wait for a short time before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
  
      // If we've reached this point, the bundle hasn't reached a final state within the timeout
      console.log(
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
  
      const response = await fetch(`${this.baseUrl}`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
  
      const json:
        | InflightBundleStatusResponse
        | BundleStatusResponse
        | SendBundleResponse = await response.json();
      if (!json) {
        throw new Error("No response from Jito");
      }
      if (json.error) {
        throw new Error(json.error.message);
      }
      // console.log("SendBundle Response", json);
      return json.result;
    }
  }