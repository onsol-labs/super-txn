# Super Transaction Program

Program that enables the creation and execution of transactions larger than 1232 through a buffer-based approach. This program provides functionality for creating, managing, and executing transactions with support for ephemeral signers and address lookup tables.

Hefty amount of code has been lifted from [Squads V4](https://github.com/Squads-Protocol/v4)

Tests were performed using SystemProgram transfers, but theoretically, your limit is 63 instructions/cpi_calls.

The instructions silently fail so that jito bundles go through.

Excuse me for the untidy code, this was written this morning.

## Overview

The Super Transaction program allows users to:
- Create and manage transaction buffers for larger transactions
- Create super transactions either directly or from completed buffers
- Execute transactions with support for ephemeral signers
- Handle complex transactions that require multiple signers or lookup tables (Versioned Transactions)
- A handful of edits have been done to make jito bundles go land.

## Program Instructions

1. `txn_buffer_create`: Creates a new transaction buffer account
2. `txn_buffer_close`: Closes a transaction buffer and reclaims rent
3. `txn_buffer_extend`: Extends an existing transaction buffer with additional data
4. `super_transaction_create`: Creates a new super transaction directly
5. `super_transaction_create_from_buffer`: Creates a super transaction from a completed buffer
6. `super_transaction_execute`: Executes an approved super transaction
7. `super_transaction_accounts_close`: Closes super transaction accounts

## Account Structures

### TransactionBuffer
- Stores transaction data during buffer
- Maintains size limits and hash validation
- Tracked by creator and buffer index

### SuperTransaction
- Contains executable transaction message
- Manages ephemeral signer information
- Handles execution authorization

## Program ID
```
mainnet: None
localnet: C5tcDT7wb5PGNy6owoze5KofLN4XQw4CmFAGuba7a5My
```

## Compiling and testing

You can compile the code with Anchor v0.29.0.
```bash
anchor build
```

To run the tests, first install the node modules for the repository.
```bash
yarn
```
or 
```bash
npm install
```
And run these tests with this command:
```bash
anchor test
```

```bash
cd sdk/super_txn && yarn build
```
## Usage Notes

- Transaction buffers must be properly sized before creation
- Final buffer hash must match for transaction creation from buffer
- Proper account ordering is required in remaining accounts for execution
- Only transaction creator can perform operations
- Ephemeral signers are automatically derived and managed

## Note
Audit on this program has not been done. Code is provided as is, please do not expect any support.

## License

Follows the license of Squads V4 and it is the AGPL-3.0 license, see [LICENSE](./LICENSE).

# super-txns
