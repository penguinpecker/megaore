// Run from your megaore-v2 (or megaore) hardhat project directory:
// 1. Copy BatchResolver.sol to contracts/BatchResolver.sol
// 2. Run: npx hardhat compile
// 3. Run: npx hardhat run scripts/verify-batch-resolver.js --network megaeth

async function main() {
  const BATCH_RESOLVER = "0x9C9D2515825bcd7e132aC0E3d8bB9aD5974a4e13";
  const GRID_ADDRESS = "0x23D682B07fFADf6F772E6A2310bD882E5B23982f";

  console.log("Verifying BatchResolver at", BATCH_RESOLVER);
  console.log("Constructor arg (grid):", GRID_ADDRESS);

  try {
    await hre.run("verify:verify", {
      address: BATCH_RESOLVER,
      constructorArguments: [GRID_ADDRESS],
      contract: "contracts/BatchResolver.sol:BatchResolver",
    });
    console.log("✅ BatchResolver verified!");
  } catch (e) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ Already verified!");
    } else {
      console.error("❌ Verification failed:", e.message);
    }
  }
}

main().catch(console.error);
