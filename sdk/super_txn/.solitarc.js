const path = require("path");

const PROGRAM_NAME = "super_txn";

const programDir = path.join(__dirname, "..", "..", "programs", PROGRAM_NAME);
const idlDir = path.join(__dirname, "idl");
const sdkDir = path.join(__dirname, "src", "generated");
const binaryInstallDir = path.join(__dirname, "..", "..", ".crates");

const ignoredTypes = new Set([
  // Exclude the types that use `SmallVec` because anchor doesn't have it in the IDL.
  "TransactionMessage",
  "CompiledInstruction",
  "MessageAddressTableLookup",
]);

module.exports = {
  idlGenerator: "anchor",
  programName: PROGRAM_NAME,
  programId: "superB6bzm82y1To5rRaMr7KmqkLNVnCUGwUBemtJV3",
  idlDir,
  sdkDir,
  binaryInstallDir,
  programDir,
  idlHook: (idl) => {
    return {
      ...idl,
      types: idl.types.filter((type) => {
        return !ignoredTypes.has(type.name);
      }),
    };
  },
};
