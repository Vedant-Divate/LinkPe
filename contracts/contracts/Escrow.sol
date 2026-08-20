// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LinkPeEscrow is ReentrancyGuard {
    IERC20 public usdc;
    
    // Use 0 for public demo testing, 604800 for production (7 days)
    uint256 public constant TIME_LOCK = 0; 
    
    enum State { Pending, Funded, Submitted, Released, Disputed, Cancelled }
    
    struct Escrow {
        address freelancer;
        address client;
        uint256 amount;
        State state;
        uint256 submissionTimestamp;
        uint256 disputeTimestamp;
        uint8 proposedSplit;
        string ipfsHash;
    }
    
    // Mapping from UUID (string) to Escrow struct - Supports infinite parallel escrows!
    mapping(string => Escrow) public escrows;
    
    event EscrowFunded(address indexed client, address indexed freelancer, uint256 amount);
    event WorkSubmitted(address indexed freelancer, string ipfsHash);
    event WorkRejected(address indexed client);
    event SplitProposed(address indexed freelancer, uint8 split);
    event FundsReleased(address indexed to, uint256 amount);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function createAndFundEscrow(string memory _escrowId, address _freelancer, uint256 _amount) external nonReentrant {
        require(escrows[_escrowId].client == address(0), "Escrow already exists");
        
        escrows[_escrowId] = Escrow({
            freelancer: _freelancer,
            client: msg.sender,
            amount: _amount,
            state: State.Funded,
            submissionTimestamp: 0,
            disputeTimestamp: 0,
            proposedSplit: 0,
            ipfsHash: ""
        });

        require(usdc.transferFrom(msg.sender, address(this), _amount), "USDC transfer failed");
        emit EscrowFunded(msg.sender, _freelancer, _amount);
    }

    function submitWork(string memory _escrowId, string memory _ipfsHash) external {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.freelancer, "Only freelancer can submit");
        require(e.state == State.Funded, "Escrow not funded");

        e.state = State.Submitted;
        e.submissionTimestamp = block.timestamp;
        e.ipfsHash = _ipfsHash;
        
        emit WorkSubmitted(msg.sender, _ipfsHash);
    }

    function releaseFunds(string memory _escrowId) external nonReentrant {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.client, "Only client can release");
        require(e.state == State.Submitted, "Work not submitted");

        e.state = State.Released;
        require(usdc.transfer(e.freelancer, e.amount), "Transfer failed");
        emit FundsReleased(e.freelancer, e.amount);
    }

    function autoReleaseFunds(string memory _escrowId) external nonReentrant {
        Escrow storage e = escrows[_escrowId];
        require(e.state == State.Submitted, "Work not submitted");
        require(block.timestamp >= e.submissionTimestamp + TIME_LOCK, "Time lock not expired");

        e.state = State.Released;
        require(usdc.transfer(e.freelancer, e.amount), "Transfer failed");
        emit FundsReleased(e.freelancer, e.amount);
    }

    function rejectWork(string memory _escrowId) external {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.client, "Only client can reject");
        require(e.state == State.Submitted, "Work not submitted");

        e.state = State.Disputed;
        e.disputeTimestamp = block.timestamp;
        emit WorkRejected(msg.sender);
    }

    function proposeSplit(string memory _escrowId, uint8 _splitPercentage) external {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.freelancer, "Only freelancer can propose");
        require(e.state == State.Disputed, "Not in dispute");
        require(_splitPercentage <= 100, "Invalid percentage");

        e.proposedSplit = _splitPercentage;
        emit SplitProposed(msg.sender, _splitPercentage);
    }

    function acceptSplit(string memory _escrowId) external nonReentrant {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.client, "Only client can accept");
        require(e.state == State.Disputed, "Not in dispute");
        require(e.proposedSplit > 0, "No split proposed");

        uint256 freelancerAmount = (e.amount * e.proposedSplit) / 100;
        uint256 clientAmount = e.amount - freelancerAmount;

        e.state = State.Released;

        require(usdc.transfer(e.freelancer, freelancerAmount), "Transfer to freelancer failed");
        require(usdc.transfer(e.client, clientAmount), "Transfer to client failed");

        emit FundsReleased(e.freelancer, freelancerAmount);
    }

    function defaultJudgment(string memory _escrowId) external nonReentrant {
        Escrow storage e = escrows[_escrowId];
        require(e.state == State.Disputed, "Not in dispute");
        require(block.timestamp >= e.disputeTimestamp + TIME_LOCK, "Dispute time lock not expired");

        uint8 split = e.proposedSplit;
        e.state = State.Released;

        if (split > 0) {
            uint256 freelancerAmount = (e.amount * split) / 100;
            uint256 clientAmount = e.amount - freelancerAmount;
            require(usdc.transfer(e.freelancer, freelancerAmount), "Transfer failed");
            require(usdc.transfer(e.client, clientAmount), "Transfer failed");
        } else {
            require(usdc.transfer(e.client, e.amount), "Transfer failed");
        }
        emit FundsReleased(e.freelancer, e.amount);
    }

    function requestCancel(string memory _escrowId) external {
        Escrow storage e = escrows[_escrowId];
        require(e.state == State.Funded, "Can only cancel funded escrow");
        require(msg.sender == e.client || msg.sender == e.freelancer, "Not authorized");
        
        uint256 fee = (e.amount * 5) / 100;
        uint256 refundAmount = e.amount - fee;

        e.state = State.Cancelled;
        
        require(usdc.transfer(e.client, refundAmount), "Refund failed");
        require(usdc.transfer(address(this), fee), "Fee transfer failed");
    }

    // --- GETTER FUNCTIONS (Bypasses Viem struct decoding bug) ---
    function getEscrowState(string memory _escrowId) public view returns (uint8) {
        return uint8(escrows[_escrowId].state); // <-- Explicit cast
    }

    function getEscrowClient(string memory _escrowId) public view returns (address) {
        return escrows[_escrowId].client;
    }
    function getEscrowAmount(string memory _escrowId) public view returns (uint256) {
        return escrows[_escrowId].amount;
    }
    function getEscrowSubmissionTime(string memory _escrowId) public view returns (uint256) {
        return escrows[_escrowId].submissionTimestamp;
    }
    function getEscrowProposedSplit(string memory _escrowId) public view returns (uint8) {
        return escrows[_escrowId].proposedSplit;
    }
    function getEscrowIpfsHash(string memory _escrowId) public view returns (string memory) {
        return escrows[_escrowId].ipfsHash;
    }
}