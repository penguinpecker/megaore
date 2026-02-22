var module = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/tasks/fulfill-randomness.ts
  var fulfill_randomness_exports = {};
  __export(fulfill_randomness_exports, {
    main: () => main
  });

  // src/lib/constants.ts
  var MEGAETH_MAINNET = {
    id: 4326,
    name: "MegaETH",
    testnet: false,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      public: { http: ["https://mainnet.megaeth.com/rpc"] },
      default: { http: ["https://mainnet.megaeth.com/rpc"] }
    }
  };
  var CONTRACT_ADDRESS = "0x23D682B07fFADf6F772E6A2310bD882E5B23982f";
  var WALLET_NAMES = {
    FULFILLER: "fulfiller"
  };
  var CONTRACT_FUNCTIONS = {
    FULFILL_RANDOMNESS: "function fulfillRandomness(uint256 requestId, bytes32 randomness, uint64 drandRound, bytes calldata signature)"
  };

  // src/lib/drand.ts
  var DRAND_CHAIN_INFO = {
    hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    publicKey: "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
    genesisTime: 1692803367,
    period: 3
    // seconds between rounds
  };
  var DRAND_API_URL = `https://api.drand.sh/${DRAND_CHAIN_INFO.hash}`;
  async function fetchLatestRandomness(fetchFn) {
    const response = await fetchFn(
      `${DRAND_API_URL}/public/latest`
    );
    if (!response) {
      throw new Error("Failed to fetch randomness from drand");
    }
    return response;
  }
  function toBytes32(hex) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    return "0x" + clean.padStart(64, "0");
  }
  function toBytes(hex) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    return "0x" + clean;
  }

  // src/tasks/fulfill-randomness.ts
  async function main(context, event) {
    const { fetch, evm, logEvent } = context;
    const requestId = event?.topics[1] ? BigInt(event.topics[1]) : 0n;
    await logEvent({
      code: "VRF_REQUEST_DETECTED",
      message: `Randomness requested for requestId: ${requestId}`
    });
    const drand = await fetchLatestRandomness(fetch);
    await logEvent({
      code: "DRAND_FETCHED",
      message: `Fetched drand round ${drand.round}, randomness: ${drand.randomness.slice(0, 16)}...`
    });
    const wallet = await evm.wallet({
      name: WALLET_NAMES.FULFILLER,
      sponsorGas: false
    });
    const result = await wallet.writeContract(
      MEGAETH_MAINNET,
      CONTRACT_ADDRESS,
      CONTRACT_FUNCTIONS.FULFILL_RANDOMNESS,
      [
        requestId.toString(),
        toBytes32(drand.randomness),
        drand.round,
        toBytes(drand.signature)
      ]
    );
    await logEvent({
      code: "RANDOMNESS_FULFILLED",
      message: `Fulfilled requestId ${requestId} in tx ${result.hash}`
    });
    return {
      success: true,
      requestId: requestId.toString(),
      transactionHash: result.hash,
      drand: {
        round: String(drand.round),
        randomness: toBytes32(drand.randomness),
        chainHash: DRAND_CHAIN_INFO.hash
      }
    };
  }
  return __toCommonJS(fulfill_randomness_exports);
})();
