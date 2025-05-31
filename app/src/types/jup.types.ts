// Detailed type definition for Jupiter Swap Route

export interface SwapInfo {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  }
  
  export interface RoutePlanItem {
    swapInfo: SwapInfo;
    percent: number;
  }
  
  export interface JupiterSwapRoute {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: 'ExactIn' | 'ExactOut';
    slippageBps: number;
    platformFee: null | number;
    priceImpactPct: string;
    routePlan: RoutePlanItem[];
    scoreReport: null | any; // Replace 'any' with a more specific type if scoreReport structure is known
    contextSlot: number;
    timeTaken: number;
  }