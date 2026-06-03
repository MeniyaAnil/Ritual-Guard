// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
    Ritual Guard All-In-One — Remix Ready

    Normal user flow:
    - Frontend scans wallet / contract / tx using Ritual RPC.
    - User saves proof on Ritual testnet with saveManualReport().
    - Optional native mode calls saveAiReport(), invoking Ritual LLM precompile 0x0802
      and storing the completion hash onchain.
*/

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;
    function depositFor(address user, uint256 lockDuration) external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function lockUntil(address account) external view returns (uint256);
}

contract RitualGuardAllInOne {
    address public constant LLM_INFERENCE_PRECOMPILE = address(0x0802);

    IRitualWallet public constant RITUAL_WALLET =
        IRitualWallet(0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948);

    struct ConversationHistory {
        string platform;
        string path;
        string keyRef;
    }

    struct Report {
        address user;
        string inputType;
        bytes32 inputHash;
        bytes32 reportHash;
        uint8 riskScore;
        string riskLevel;
        string source;
        uint256 timestamp;
    }

    struct LlmResult {
        bool hasError;
        bytes32 completionHash;
        string errorMessage;
    }

    Report[] private reports;
    mapping(address => uint256[]) private reportsByUser;

    event ManualReportSaved(
        uint256 indexed reportId,
        address indexed user,
        bytes32 indexed inputHash,
        string inputType,
        bytes32 reportHash,
        uint8 riskScore,
        string riskLevel,
        string summary,
        uint256 timestamp
    );

    event AiReportSaved(
        uint256 indexed reportId,
        address indexed user,
        bytes32 indexed inputHash,
        string inputType,
        string target,
        bytes32 completionHash,
        string errorMessage,
        uint8 riskScore,
        string riskLevel,
        uint256 timestamp
    );

    event RitualWalletFunded(
        address indexed payer,
        address indexed beneficiary,
        uint256 amount,
        uint256 lockDuration
    );

    error PrecompileCallFailed(address precompile, bytes revertData);

    function totalReports() external view returns (uint256) { return reports.length; }

    function getReport(uint256 reportId) external view returns (Report memory) {
        require(reportId < reports.length, "Bad reportId");
        return reports[reportId];
    }

    function getUserReportIds(address user) external view returns (uint256[] memory) {
        return reportsByUser[user];
    }

    function ritualWalletBalance(address user) external view returns (uint256) {
        return RITUAL_WALLET.balanceOf(user);
    }

    function fundMyRitualWallet(uint256 lockDuration) external payable {
        require(msg.value > 0, "No RITUAL sent");
        RITUAL_WALLET.depositFor{value: msg.value}(msg.sender, lockDuration);
        emit RitualWalletFunded(msg.sender, msg.sender, msg.value, lockDuration);
    }

    function depositToRitualWallet(uint256 lockDuration) external payable {
        require(msg.value > 0, "No RITUAL sent");
        RITUAL_WALLET.deposit{value: msg.value}(lockDuration);
        emit RitualWalletFunded(msg.sender, msg.sender, msg.value, lockDuration);
    }

    function withdrawFromRitualWallet(uint256 amount) external {
        RITUAL_WALLET.withdraw(amount);
    }

    function saveManualReport(
        string calldata inputType,
        bytes32 inputHash,
        bytes32 reportHash,
        uint8 riskScore,
        string calldata riskLevel,
        string calldata summary
    ) external returns (uint256 reportId) {
        reportId = _storeReport(msg.sender, inputType, inputHash, reportHash, riskScore, riskLevel, "manual");
        emit ManualReportSaved(reportId, msg.sender, inputHash, inputType, reportHash, riskScore, riskLevel, summary, block.timestamp);
    }

    function saveAiReport(
        bytes calldata llmInput,
        string calldata inputType,
        string calldata target,
        uint8 frontendRiskScore,
        string calldata frontendRiskLevel,
        bytes32 factsHash
    ) external returns (uint256 reportId) {
        LlmResult memory result = _runLlm(llmInput);
        require(!result.hasError, result.errorMessage);
        bytes32 inputHash = keccak256(abi.encodePacked(inputType, ":", target, ":", factsHash));
        reportId = _storeReport(msg.sender, inputType, inputHash, result.completionHash, frontendRiskScore, frontendRiskLevel, "ritual-ai");
        emit AiReportSaved(reportId, msg.sender, inputHash, inputType, target, result.completionHash, result.errorMessage, frontendRiskScore, frontendRiskLevel, block.timestamp);
    }

    function _runLlm(bytes calldata llmInput) internal returns (LlmResult memory result) {
        bytes memory output = _executePrecompile(LLM_INFERENCE_PRECOMPILE, llmInput);
        bytes memory completionData;
        bytes memory modelMetadata;
        ConversationHistory memory updatedConvoHistory;
        (result.hasError, completionData, modelMetadata, result.errorMessage, updatedConvoHistory) = abi.decode(output, (bool, bytes, bytes, string, ConversationHistory));
        modelMetadata; updatedConvoHistory;
        result.completionHash = keccak256(completionData);
    }

    function _storeReport(address user, string memory inputType, bytes32 inputHash, bytes32 reportHash, uint8 riskScore, string memory riskLevel, string memory source) internal returns (uint256 reportId) {
        require(bytes(inputType).length > 0, "inputType required");
        require(inputHash != bytes32(0), "inputHash required");
        require(reportHash != bytes32(0), "reportHash required");
        require(riskScore <= 100, "Score > 100");
        reportId = reports.length;
        reports.push(Report({user:user,inputType:inputType,inputHash:inputHash,reportHash:reportHash,riskScore:riskScore,riskLevel:riskLevel,source:source,timestamp:block.timestamp}));
        reportsByUser[user].push(reportId);
    }

    function _executePrecompile(address precompile, bytes memory input) internal returns (bytes memory) {
        (bool ok, bytes memory raw) = precompile.call(input);
        if (!ok) revert PrecompileCallFailed(precompile, raw);
        if (raw.length == 0) return raw;
        try this.decodeAsyncEnvelope(raw) returns (bytes memory output) { return output; } catch { return raw; }
    }

    function decodeAsyncEnvelope(bytes calldata raw) external pure returns (bytes memory output) {
        (, output) = abi.decode(raw, (bytes, bytes));
    }
}
