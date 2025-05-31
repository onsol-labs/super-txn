import {
    AddressLookupTableAccount,
    PublicKey,
    Connection
} from '@solana/web3.js';
import fs from 'fs/promises';
import path from 'path';

interface SerializableLookupTableAccount {
    publicKey: string;
    addresses: string[]; // Convert PublicKey to base58 string
  }
  
  interface LookupTableCache {
    [key: string]: {
      account: SerializableLookupTableAccount;
      timestamp: number;
    };
  }
  

class AddressLookupTableCacher {
    private cache: LookupTableCache = {};
    private cacheFilePath: string;
    private maxCacheAge: number; // in milliseconds

    constructor(
        cacheDir: string = './lookup_table_cache',
        maxCacheAge: number = 24 * 60 * 60 * 1000 // 24 hours default
    ) {
        this.cacheFilePath = path.join(cacheDir, 'lookup_tables.json');
        this.maxCacheAge = maxCacheAge;

        // Ensure cache directory exists
        fs.mkdir(cacheDir, { recursive: true }).catch(console.error);
    }

    // Load cache from file on initialization
    async init() {
        try {
            const cacheData = await fs.readFile(this.cacheFilePath, 'utf-8');
            this.cache = JSON.parse(cacheData);
        } catch (error) {
            // If file doesn't exist or is invalid, start with empty cache
            this.cache = {};
        }
    }

  // Modify serialization and deserialization methods
  private serializeAccount(account: AddressLookupTableAccount): SerializableLookupTableAccount {
    return {
      publicKey: account.key.toBase58(),
      addresses: account.state.addresses.map(addr => addr.toBase58())
    };
  }

  private deserializeAccount(serializedAccount: SerializableLookupTableAccount): AddressLookupTableAccount {
    return new AddressLookupTableAccount({
      key: new PublicKey(serializedAccount.publicKey),
      state: {
        deactivationSlot: BigInt(0), // You may need to handle this appropriately
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: null,
        addresses: serializedAccount.addresses.map(addr => new PublicKey(addr))
      }
    });
  }

  // Update getAddressLookupTableAccounts to use serialization
  async getAddressLookupTableAccounts(
    keys: PublicKey[], 
    fetchFunction: (keys: PublicKey[]) => Promise<AddressLookupTableAccount[]>
  ): Promise<AddressLookupTableAccount[]> {
    const missingKeys: PublicKey[] = [];
    const cachedAccounts: AddressLookupTableAccount[] = [];

    // Check cache and identify missing keys
    keys.forEach(key => {
      const cacheEntry = this.cache[key.toBase58()];
      if (cacheEntry) {
        cachedAccounts.push(this.deserializeAccount(cacheEntry.account));
      } else {
        missingKeys.push(key);
      }
    });

    // Fetch missing lookup tables
    let fetchedAccounts: AddressLookupTableAccount[] = [];
    if (missingKeys.length > 0) {
      fetchedAccounts = await fetchFunction(missingKeys);

      // Cache newly fetched lookup tables
      fetchedAccounts.forEach((account, index) => {
        const key = missingKeys[index].toBase58();
        this.cache[key] = {
          account: this.serializeAccount(account),
          timestamp: Date.now()
        };
      });

      // Save updated cache
      await this.saveCache();
    }

    // Combine cached and fetched accounts
    return [...cachedAccounts, ...fetchedAccounts];
  }

  // Add a custom JSON replacer to handle BigInt
  private getJsonReplacer() {
    return (key: string, value: any) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };
  }

  // Modify saveCache to use custom replacer
  private async saveCache() {
    try {
      await fs.writeFile(
        this.cacheFilePath, 
        JSON.stringify(this.cache, this.getJsonReplacer(), 2)
      );
    } catch (error) {
      console.error('Failed to save lookup table cache:', error);
    }
  }

    // Clear entire cache or specific entries
    async clearCache(keys?: PublicKey[]) {
        if (keys) {
            keys.forEach(key => delete this.cache[key.toBase58()]);
        } else {
            this.cache = {};
        }
        await this.saveCache();
    }
}

// Example usage
export async function initializeLookupTableCacher() {
    const cacher = new AddressLookupTableCacher();
    await cacher.init();
    return cacher;
}

// Example of how to use in a Solana transaction
export async function fetchLookupTables(
    cacher: AddressLookupTableCacher,
    connection: Connection,
    lookupTableKeys: PublicKey[]
) {
    return await cacher.getAddressLookupTableAccounts(
        lookupTableKeys,
        async (missingKeys) => {
            return await getAddressLookupTableAccounts(missingKeys, connection)
        }
    );
}

const getAddressLookupTableAccounts = async (
    keys: PublicKey[],
    connection: Connection,
): Promise<AddressLookupTableAccount[]> => {
    const addressLookupTableAccountInfos =
        await connection.getMultipleAccountsInfo(
            keys.map((key) => key)
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
