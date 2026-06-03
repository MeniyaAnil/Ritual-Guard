import { createPublicClient, defineChain, http } from "viem";

export const RITUAL_CHAIN_ID_DEC = 1979;
export const RITUAL_CHAIN_ID_HEX = "0x7bb";

export const ritualChain = defineChain({
  id: RITUAL_CHAIN_ID_DEC,
  name: "Ritual Testnet",
  nativeCurrency: {
    name: "RITUAL",
    symbol: "RITUAL",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.ritualfoundation.org"]
    }
  },
  blockExplorers: {
    default: {
      name: "Ritual Explorer",
      url: "https://explorer.ritualfoundation.org"
    }
  }
});

export const publicClient = createPublicClient({
  chain: ritualChain,
  transport: http()
});

export const addRitualChainParams = {
  chainId: RITUAL_CHAIN_ID_HEX,
  chainName: "Ritual Testnet",
  nativeCurrency: {
    name: "RITUAL",
    symbol: "RITUAL",
    decimals: 18
  },
  rpcUrls: ["https://rpc.ritualfoundation.org"],
  blockExplorerUrls: ["https://explorer.ritualfoundation.org"]
};
