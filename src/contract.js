export const GUARD_CONTRACT_ADDRESS = import.meta.env.VITE_GUARD_CONTRACT_ADDRESS || "";

export const GUARD_ABI = [
  {
    type: "function",
    name: "saveManualReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "inputType", type: "string" },
      { name: "inputHash", type: "bytes32" },
      { name: "reportHash", type: "bytes32" },
      { name: "riskScore", type: "uint8" },
      { name: "riskLevel", type: "string" },
      { name: "summary", type: "string" }
    ],
    outputs: [{ name: "reportId", type: "uint256" }]
  },
  {
    type: "function",
    name: "saveAiReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "llmInput", type: "bytes" },
      { name: "inputType", type: "string" },
      { name: "target", type: "string" },
      { name: "frontendRiskScore", type: "uint8" },
      { name: "frontendRiskLevel", type: "string" },
      { name: "factsHash", type: "bytes32" }
    ],
    outputs: [{ name: "reportId", type: "uint256" }]
  }
];
