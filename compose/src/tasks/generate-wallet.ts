import { TaskContext } from "compose";
import { MEGAETH_MAINNET, WALLET_NAMES } from "../lib/constants.ts";

export async function main(context: TaskContext) {
  const { evm, logEvent } = context;

  const fulfiller = await evm.wallet({
    name: WALLET_NAMES.FULFILLER,
    sponsorGas: false,
  });

  const fulfillerAddress = await fulfiller.getAddress(MEGAETH_MAINNET);

  await logEvent({
    code: "WALLET_GENERATED",
    message: `Fulfiller: ${fulfillerAddress}`,
  });

  return {
    fulfiller: fulfillerAddress,
    note: "Use the fulfiller address when deploying OreGrid or call setFulfiller()",
  };
}
