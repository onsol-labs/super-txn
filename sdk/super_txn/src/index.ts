// import { PublicKey } from "@solana/web3";

export * as generated from "./generated/index";
export { PROGRAM_ID, PROGRAM_ADDRESS } from "./generated/index";
/** Program accounts */
export * as accounts from "./accounts";
/** Error parsing utils for the multisig program. */
export * as errors from "./errors";
/** PDA utils. */
export * from "./pda";
/** RPC functions for interaction with the multisig program. */
export * as rpc from "./rpc";
/** Transactions for the multisig program. */
export * as transactions from "./transactions";
/** Instructions for the multisig program. */
export * as instructions from "./instructions/index";
/** Additional types */
export * as types from "./types";
/** Utils for the multisig program. */
export * as utils from "./utils";


// export async function createSuperTransaction(
//     {}: {
//         payerKey?: PublicKey,
//         signer: PublicKey,
//         index: number, // can be 0
//     }
// ) {

// }