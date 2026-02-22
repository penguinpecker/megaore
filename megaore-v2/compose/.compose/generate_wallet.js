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

  // src/tasks/generate-wallet.ts
  var generate_wallet_exports = {};
  __export(generate_wallet_exports, {
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
  var WALLET_NAMES = {
    FULFILLER: "fulfiller"
  };

  // src/tasks/generate-wallet.ts
  async function main(context) {
    const { evm, logEvent } = context;
    const fulfiller = await evm.wallet({
      name: WALLET_NAMES.FULFILLER,
      sponsorGas: false
    });
    const fulfillerAddress = await fulfiller.getAddress(MEGAETH_MAINNET);
    await logEvent({
      code: "WALLET_GENERATED",
      message: `Fulfiller: ${fulfillerAddress}`
    });
    return {
      fulfiller: fulfillerAddress,
      note: "Use the fulfiller address when deploying OreGrid or call setFulfiller()"
    };
  }
  return __toCommonJS(generate_wallet_exports);
})();
