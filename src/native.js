import { encodeAbiParameters, parseAbiParameters } from "viem";

export const ENABLE_RITUAL_NATIVE = import.meta.env.VITE_ENABLE_RITUAL_NATIVE === "true";
export const RITUAL_EXECUTOR_ADDRESS = import.meta.env.VITE_RITUAL_EXECUTOR_ADDRESS || "";
export const CONVO_PLATFORM = import.meta.env.VITE_CONVO_PLATFORM || "gcs";
export const CONVO_PATH = import.meta.env.VITE_CONVO_PATH || "convos/ritual-guard-session.jsonl";
export const CONVO_KEY_REF = import.meta.env.VITE_CONVO_KEY_REF || "GCS_CREDS";

export function canUseRitualNative() {
  return ENABLE_RITUAL_NATIVE && RITUAL_EXECUTOR_ADDRESS.startsWith("0x");
}

export function makePrompt(report) {
  const facts = {
    inputType: report.inputType,
    input: report.input,
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    facts: report.facts,
    checks: report.checks
  };

  return [
    { role: "system", content: "You are Ritual Guard, a normal-user crypto safety assistant. Explain wallet, contract, or transaction risk in plain English. Do not give financial advice. Return short JSON only with keys: verdict, risk_score, reason, action." },
    { role: "user", content: "Explain this Ritual Chain safety scan to a normal user. Use only these facts, do not invent data: " + JSON.stringify(facts) }
  ];
}

export function encodeLlmInput(report) {
  const messagesJson = JSON.stringify(makePrompt(report));
  return encodeAbiParameters(
    parseAbiParameters("address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)"),
    [
      RITUAL_EXECUTOR_ADDRESS, [], 30n, [], "0x",
      messagesJson, "zai-org/GLM-4.7-FP8", 0n, "", false,
      -1n, "", "", 1n, false, 0n, "", "0x", -1n, "", "",
      false, 350n, "0x", "0x", -1n, 1000n, "", false,
      [CONVO_PLATFORM, CONVO_PATH, CONVO_KEY_REF]
    ]
  );
}
