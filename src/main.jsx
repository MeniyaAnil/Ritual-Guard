import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createWalletClient, custom, keccak256, toBytes } from "viem";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  Network,
  Save,
  Search,
  Shield,
  Wallet
} from "lucide-react";
import { addRitualChainParams, publicClient, RITUAL_CHAIN_ID_HEX, ritualChain } from "./chain";
import { GUARD_ABI, GUARD_CONTRACT_ADDRESS } from "./contract";
import { scanTarget } from "./scanner";
import { canUseRitualNative, encodeLlmInput } from "./native";
import "./styles.css";

function short(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function hash(text) {
  return keccak256(toBytes(text));
}

function proofKey(report, account) {
  return `ritual_guard_proof_${account || "unknown"}_${hash(`${report.inputType}:${report.input.toLowerCase()}`)}`;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <button className="modal-x" onClick={onClose}>×</button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [walletMenu, setWalletMenu] = useState(false);
  const [networkModal, setNetworkModal] = useState(false);

  const [type, setType] = useState("wallet");
  const [input, setInput] = useState("");
  const [report, setReport] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const menuRef = useRef(null);

  const isRitual = chainId?.toLowerCase() === RITUAL_CHAIN_ID_HEX;
  const nativeReady = canUseRitualNative();

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setWalletMenu(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    window.ethereum.request({ method: "eth_chainId" }).then(setChainId).catch(() => {});
    window.ethereum.request({ method: "eth_accounts" }).then((accs) => setAccount(accs?.[0] || "")).catch(() => {});

    const onAccounts = (accs) => {
      setAccount(accs?.[0] || "");
      setWalletMenu(false);
    };

    const onChain = (id) => {
      setChainId(id);
      if (id?.toLowerCase() !== RITUAL_CHAIN_ID_HEX) setNetworkModal(true);
    };

    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChain);

    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged", onChain);
    };
  }, []);

  useEffect(() => {
    if (!report) return;
    const saved = localStorage.getItem(proofKey(report, account));
    setAlreadySaved(Boolean(saved));
    setTxHash(saved || "");
  }, [report, account]);

  async function connect() {
    if (!window.ethereum) {
      setStatus("Wallet extension not found");
      return "";
    }

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const next = accounts?.[0] || "";
    setAccount(next);

    const id = await window.ethereum.request({ method: "eth_chainId" });
    setChainId(id);

    if (id?.toLowerCase() !== RITUAL_CHAIN_ID_HEX) {
      setNetworkModal(true);
      setStatus("Switch to Ritual testnet to save proof");
    } else {
      setStatus("Wallet connected");
    }

    return next;
  }

  function disconnectLocal() {
    setAccount("");
    setWalletMenu(false);
    setStatus("Wallet disconnected from this app");
  }

  async function switchOrAddRitual() {
    if (!window.ethereum) {
      setStatus("Wallet extension not found");
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: addRitualChainParams.chainId }]
      });
      setChainId(addRitualChainParams.chainId);
      setNetworkModal(false);
      setStatus("Ritual testnet selected");
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [addRitualChainParams]
        });
        setChainId(addRitualChainParams.chainId);
        setNetworkModal(false);
        setStatus("Ritual testnet added");
      } else {
        setStatus(err.message || "Network switch failed");
      }
    }
  }

  async function checkSafety() {
    const value = input.trim();

    if (!value) {
      setStatus("Paste wallet, contract, or transaction hash");
      return;
    }

    try {
      setBusy(true);
      setTxHash("");
      setAlreadySaved(false);
      setConfirmUpdate(false);
      setStatus("Checking Ritual data...");
      const nextReport = await scanTarget(type, value);
      setReport(nextReport);
      setStatus("Safety check complete");
    } catch (err) {
      setStatus(err.message || "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveProof(force = false) {
    if (!report) {
      setStatus("Run a safety check first");
      return;
    }

    if (!GUARD_CONTRACT_ADDRESS || !GUARD_CONTRACT_ADDRESS.startsWith("0x")) {
      setStatus("Proof saving is not active on this deployment");
      return;
    }

    if (alreadySaved && !force) {
      setConfirmUpdate(true);
      return;
    }

    if (!window.ethereum) {
      setStatus("Wallet extension not found");
      return;
    }

    if (!isRitual) {
      setNetworkModal(true);
      return;
    }

    try {
      setBusy(true);
      const active = account || await connect();
      if (!active) return;

      setStatus("Saving proof on Ritual...");
      const walletClient = createWalletClient({
        account: active,
        chain: ritualChain,
        transport: custom(window.ethereum)
      });

      let tx;

      if (nativeReady) {
        try {
          setStatus("Saving Ritual AI proof...");
          const factsHash = hash(JSON.stringify({ facts: report.facts, checks: report.checks, summary: report.summary }));
          const llmInput = encodeLlmInput(report);
          tx = await walletClient.writeContract({
            address: GUARD_CONTRACT_ADDRESS,
            abi: GUARD_ABI,
            functionName: "saveAiReport",
            args: [
              llmInput,
              report.inputType,
              report.input,
              Number(report.riskScore),
              report.riskLevel,
              factsHash
            ]
          });
        } catch (nativeError) {
          setStatus("Ritual AI proof failed. Saving standard proof...");
          const inputHash = hash(`${report.inputType}:${report.input.toLowerCase()}`);
          const reportHash = hash(JSON.stringify(report));
          tx = await walletClient.writeContract({
            address: GUARD_CONTRACT_ADDRESS,
            abi: GUARD_ABI,
            functionName: "saveManualReport",
            args: [report.inputType, inputHash, reportHash, Number(report.riskScore), report.riskLevel, report.summary]
          });
        }
      } else {
        const inputHash = hash(`${report.inputType}:${report.input.toLowerCase()}`);
        const reportHash = hash(JSON.stringify(report));
        tx = await walletClient.writeContract({
          address: GUARD_CONTRACT_ADDRESS,
          abi: GUARD_ABI,
          functionName: "saveManualReport",
          args: [report.inputType, inputHash, reportHash, Number(report.riskScore), report.riskLevel, report.summary]
        });
      }

      setTxHash(tx);
      localStorage.setItem(proofKey(report, active), tx);
      setAlreadySaved(true);
      setConfirmUpdate(false);
      setStatus("Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash: tx });
      setStatus("Proof saved on Ritual");
    } catch (err) {
      setStatus(err.shortMessage || err.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const placeholder = {
    wallet: "Paste wallet address: 0x...",
    contract: "Paste contract address: 0x...",
    tx: "Paste transaction hash: 0x..."
  }[type];

  const scanTitle = {
    wallet: "Wallet check",
    contract: "Contract check",
    tx: "Transaction check"
  }[type];

  const canSave = Boolean(report && GUARD_CONTRACT_ADDRESS && GUARD_CONTRACT_ADDRESS.startsWith("0x"));

  return (
    <main>
      <nav>
        <div className="brand">
          <div className="logo"><Shield size={25} /></div>
          <div>
            <b>Ritual Guard</b>
            <span>Wallet, contract, and transaction safety</span>
          </div>
        </div>

        <div className="nav-actions">
          <button className={isRitual ? "network-ok" : ""} onClick={() => setNetworkModal(true)}>
            <Network size={16} />
            {isRitual ? "Ritual Ready" : "Switch Network"}
          </button>

          {!account ? (
            <button className="primary" onClick={connect}>
              <Wallet size={16} />
              Connect
            </button>
          ) : (
            <div className="wallet-menu-wrap" ref={menuRef}>
              <button className="primary wallet-btn" onClick={() => setWalletMenu(!walletMenu)}>
                <Wallet size={16} />
                {short(account)}
                <ChevronDown size={15} />
              </button>

              {walletMenu && (
                <div className="wallet-menu">
                  <div className="wallet-line">
                    <span>Connected wallet</span>
                    <b>{short(account)}</b>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(account)}>
                    <Copy size={15} /> Copy address
                  </button>
                  <button onClick={disconnectLocal}>
                    <LogOut size={15} /> Disconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">Ritual safety assistant</p>
        <h1>Check wallet, contract, or transaction risk.</h1>
        <p className="subtitle">
          Paste a Ritual wallet address, contract address, or transaction hash. Get a simple risk score and clear onchain facts before you trust it.
        </p>
      </section>

      <section className="app-grid">
        <div className="card checker">
          <div className="section-title">
            <span className="step">01</span>
            <div>
              <h2>{scanTitle}</h2>
              <p>Choose what you want to verify on Ritual.</p>
            </div>
          </div>

          <div className="scan-tabs">
            <button className={type === "wallet" ? "active" : ""} onClick={() => { setType("wallet"); setReport(null); setInput(""); }}>
              Wallet
            </button>
            <button className={type === "contract" ? "active" : ""} onClick={() => { setType("contract"); setReport(null); setInput(""); }}>
              Contract
            </button>
            <button className={type === "tx" ? "active" : ""} onClick={() => { setType("tx"); setReport(null); setInput(""); }}>
              Tx Hash
            </button>
          </div>

          <label>{scanTitle}</label>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} />

          <div className="main-actions">
            <button className="primary big" onClick={checkSafety} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
              Check Safety
            </button>

            <button onClick={() => saveProof(false)} disabled={busy || !report || !canSave}>
              <Save size={17} />
              {alreadySaved ? "Proof Saved" : "Save Proof"}
            </button>
          </div>

          <p className="status">{status}</p>

          {txHash && (
            <a className="tx-link" href={`https://explorer.ritualfoundation.org/tx/${txHash}`} target="_blank" rel="noreferrer">
              View proof on Ritual Explorer <ExternalLink size={15} />
            </a>
          )}
        </div>

        <div className="card result">
          {!report ? (
            <div className="empty">
              <div className="empty-icon"><Shield size={42} /></div>
              <h2>Ready to scan</h2>
              <p>Paste a wallet, contract, or tx hash to see a professional safety report.</p>
            </div>
          ) : (
            <>
              <div className={`verdict ${report.riskClass}`}>
                <div className="meter-area">
                  <div className="meter-header">
                    <span>{report.emoji} {report.riskLevel}</span>
                    <b>{report.riskScore}/100</b>
                  </div>
                  <div className="meter">
                    <div style={{ width: `${report.riskScore}%` }} />
                  </div>
                  <small>Risk score: lower is safer</small>
                </div>
                <div>
                  <h2>{report.summary}</h2>
                  <p>Generated {new Date(report.generatedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="score-help">
                <b>How the score is calculated</b>
                <p>
                  The score starts at 0 and adds points for warning signals like invalid input, contract code on a wallet address, fresh address, failed transaction, or missing contract code. It is a risk score, not a guarantee.
                </p>
              </div>

              <div className="facts">
                <h3>Onchain facts</h3>
                {Object.keys(report.facts || {}).length === 0 ? (
                  <p className="muted">No extra facts available for this input.</p>
                ) : (
                  Object.entries(report.facts).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <b>{String(value)}</b>
                    </div>
                  ))
                )}
              </div>

              <div className="checks">
                <h3>Safety notes</h3>
                {report.checks.map((check, index) => (
                  <article key={index} className={check.severity}>
                    <div>
                      {check.severity === "safe" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                      <h4>{check.title}</h4>
                    </div>
                    <p>{check.text}</p>
                    <strong>{check.action}</strong>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="info">
        <div>
          <b>Wallet check</b>
          <p>Detects if an address is a normal wallet or a contract and checks basic Ritual RPC activity.</p>
        </div>
        <div>
          <b>Contract check</b>
          <p>Checks contract bytecode and tries token-style metadata when possible.</p>
        </div>
        <div>
          <b>Transaction check</b>
          <p>Looks up transaction status, receiver, value, and whether the tx failed.</p>
        </div>
      </section>

      {networkModal && (
        <Modal title="Switch to Ritual Testnet" onClose={() => setNetworkModal(false)}>
          <p className="modal-text">
            Ritual Guard can scan public RPC data anytime, but saving proof needs your wallet on Ritual testnet.
          </p>
          <div className="modal-actions">
            <button className="primary" onClick={switchOrAddRitual}>Add / Switch Ritual Network</button>
            <button onClick={() => setNetworkModal(false)}>Not now</button>
          </div>
        </Modal>
      )}

      {confirmUpdate && (
        <Modal title="Proof already saved" onClose={() => setConfirmUpdate(false)}>
          <p className="modal-text">
            You already saved proof for this same scan. Saving again will create another onchain transaction.
          </p>
          <div className="modal-actions">
            <button className="primary" onClick={() => saveProof(true)}>Save again</button>
            <button onClick={() => setConfirmUpdate(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
