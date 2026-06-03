import { erc20Abi, formatEther, isAddress } from "viem";
import { publicClient } from "./chain";

/*
  Score meaning for normal users:
  - 0 means no warning found by this scanner.
  - 100 means strongest warning.
  - The app starts at 0 and adds points for warning signals.
  - It is not a profit/loss or safety percentage. It is a risk score.
*/

function add(checks, severity, title, text, action, points) {
  checks.push({ severity, title, text, action, points });
  return points;
}

function verdict(score) {
  if (score >= 75) return { label: "Danger", className: "danger", emoji: "🚨" };
  if (score >= 50) return { label: "High Risk", className: "warning", emoji: "⚠️" };
  if (score >= 25) return { label: "Review Needed", className: "caution", emoji: "👀" };
  return { label: "Looks Okay", className: "safe", emoji: "✅" };
}

function isTxHash(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

async function scanAddress(value, requestedType, checks) {
  let score = 0;

  if (!isAddress(value)) {
    score += add(
      checks,
      "danger",
      "Invalid address",
      "This is not a valid EVM address.",
      "Check the address and paste the full 0x address again.",
      50
    );
    return { score, facts: {} };
  }

  const [balance, txCount, bytecode] = await Promise.all([
    publicClient.getBalance({ address: value }),
    publicClient.getTransactionCount({ address: value }),
    publicClient.getBytecode({ address: value })
  ]);

  const isContract = Boolean(bytecode && bytecode !== "0x");
  const facts = {
    typeDetected: isContract ? "Contract" : "Wallet",
    balance: `${formatEther(balance)} RITUAL`,
    txCount,
    hasContractCode: isContract ? "Yes" : "No"
  };

  if (requestedType === "wallet" && isContract) {
    score += add(
      checks,
      "warning",
      "This is a contract, not a normal wallet",
      "The address has contract code. Some contracts can execute custom logic when users interact with them.",
      "Only send funds if you trust the contract and understand what it does.",
      34
    );
  } else if (requestedType === "contract" && !isContract) {
    score += add(
      checks,
      "caution",
      "No contract code found",
      "This looks like a normal wallet address, not a deployed contract.",
      "If someone gave this as a contract address, verify it again.",
      28
    );
  } else if (isContract) {
    score += add(
      checks,
      "caution",
      "Contract code detected",
      "This is a deployed contract address on Ritual testnet.",
      "Review contract source or project links before trusting it.",
      20
    );
  } else {
    score += add(
      checks,
      "safe",
      "Normal wallet detected",
      "No contract code was found at this address on Ritual RPC.",
      "Still check who owns it before sending funds.",
      6
    );
  }

  if (txCount === 0) {
    score += add(
      checks,
      "caution",
      "Fresh address",
      "This address has no transaction history on Ritual RPC.",
      "Be careful with brand-new wallets or contracts.",
      16
    );
  }

  if (isContract) {
    try {
      const [name, symbol, decimals, supply] = await Promise.all([
        publicClient.readContract({ address: value, abi: erc20Abi, functionName: "name" }),
        publicClient.readContract({ address: value, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address: value, abi: erc20Abi, functionName: "decimals" }),
        publicClient.readContract({ address: value, abi: erc20Abi, functionName: "totalSupply" })
      ]);

      facts.tokenName = name;
      facts.tokenSymbol = symbol;
      facts.decimals = Number(decimals);
      facts.totalSupplyRaw = supply.toString();

      score += add(
        checks,
        "safe",
        "Token-style metadata found",
        `This contract responds like an ERC-20 token: ${name} (${symbol}).`,
        "Metadata is useful, but it does not prove the token is safe.",
        6
      );
    } catch {
      add(
        checks,
        "caution",
        "Not a standard token",
        "This contract does not respond cleanly to standard ERC-20 metadata calls.",
        "Treat it as a general contract and verify source before interacting.",
        0
      );
    }
  }

  return { score, facts };
}

async function scanTxHash(value, checks) {
  let score = 0;

  if (!isTxHash(value)) {
    score += add(
      checks,
      "danger",
      "Invalid transaction hash",
      "This does not look like a valid transaction hash.",
      "Paste the exact 0x transaction hash from wallet or explorer.",
      50
    );
    return { score, facts: {} };
  }

  let tx = null;
  let receipt = null;

  try {
    tx = await publicClient.getTransaction({ hash: value });
  } catch {}

  try {
    receipt = await publicClient.getTransactionReceipt({ hash: value });
  } catch {}

  if (!tx && !receipt) {
    score += add(
      checks,
      "caution",
      "Transaction not found",
      "The hash format is valid, but Ritual RPC did not return this transaction.",
      "Check if it is from another chain or still pending.",
      36
    );
    return { score, facts: { found: "No" } };
  }

  const facts = {
    found: "Yes",
    status: receipt?.status || "unknown",
    to: tx?.to || "Contract deployment",
    value: tx ? `${formatEther(tx.value)} RITUAL` : "unknown",
    blockNumber: receipt?.blockNumber ? receipt.blockNumber.toString() : "unknown"
  };

  if (receipt?.status === "reverted") {
    score += add(
      checks,
      "warning",
      "Transaction failed",
      "This transaction reverted onchain. Repeating it may fail again or waste gas.",
      "Do not retry until you understand the contract/action.",
      34
    );
  } else {
    score += add(
      checks,
      "safe",
      "Transaction found",
      "The transaction was found on Ritual RPC.",
      "Check the receiver and value before repeating any similar action.",
      8
    );
  }

  if (tx?.to === null) {
    score += add(
      checks,
      "caution",
      "Contract deployment transaction",
      "This transaction created a contract instead of sending to a normal address.",
      "Review the deployed contract before interacting with it.",
      24
    );
  }

  return { score, facts };
}

export async function scanTarget(type, value) {
  const checks = [];
  let result;

  if (type === "wallet" || type === "contract") {
    result = await scanAddress(value, type, checks);
  } else if (type === "tx") {
    result = await scanTxHash(value, checks);
  } else {
    result = { score: 50, facts: {} };
    add(checks, "warning", "Unsupported scan type", "This scan type is not supported.", "Choose wallet, contract, or transaction hash.", 50);
  }

  const score = Math.min(100, result.score);
  const v = verdict(score);

  return {
    inputType: type,
    input: value,
    riskScore: score,
    riskLevel: v.label,
    riskClass: v.className,
    emoji: v.emoji,
    summary: buildSummary(type, score, checks),
    facts: result.facts,
    checks,
    generatedAt: new Date().toISOString()
  };
}

function buildSummary(type, score, checks) {
  const label = {
    wallet: "wallet",
    contract: "contract",
    tx: "transaction"
  }[type];

  const issue = checks.find((c) => ["danger", "warning", "caution"].includes(c.severity));

  if (issue) {
    return `This ${label} has a ${score}/100 risk score. Main point: ${issue.title}.`;
  }

  return `This ${label} has a ${score}/100 risk score. No major warning was found by the current scan.`;
}
