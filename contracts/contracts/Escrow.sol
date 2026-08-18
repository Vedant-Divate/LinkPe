// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LinkPeEscrow is ReentrancyGuard {
    // Official USDC Contract on Polygon Amoy Testnet
    // (We will use this for testing, real Polygon USDC can be swapped later)
    IERC20 public usdc;


    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }
    
    enum State { Pending, Funded, Submitted, Released, Disputed, Cancelled }
    
    struct Escrow {
        address freelancer;
        address client;
        uint256 amount;
        State state;
        uint256 submissionTimestamp;
        uint256 disputeTimestamp;
        uint8 proposedSplit; // Percentage freelancer wants (0-100)
    }
    
    Escrow public currentEscrow;
    string public currentIpfsHash;
    
    // 7 days in seconds (604800). For testing, we will use 120 seconds (2 mins)
    uint256 public constant TIME_LOCK = 604800; 

    event EscrowFunded(address indexed client, address indexed freelancer, uint256 amount);
    event WorkSubmitted(address indexed freelancer, string ipfsHash);
    event WorkRejected(address indexed client);
    event SplitProposed(address indexed freelancer, uint8 split);
    event FundsReleased(address indexed to, uint256 amount);

    // Step 1 & 2 Combined: Client funds the escrow and binds the freelancer address
    function createAndFundEscrow(address _freelancer, uint256 _amount) external nonReentrant {
        require(currentEscrow.state == State.Pending || currentEscrow.state == State.Released || currentEscrow.state == State.Cancelled, "Active escrow exists");
        
        currentEscrow = Escrow({
            freelancer: _freelancer,
            client: msg.sender, // Dynamic Binding!
            amount: _amount,
            state: State.Funded,
            submissionTimestamp: 0,
            disputeTimestamp: 0,
            proposedSplit: 0
        });

        require(usdc.transferFrom(msg.sender, address(this), _amount), "USDC transfer failed");

        emit EscrowFunded(msg.sender, _freelancer, _amount);
    }

    // Step 3: Early Cancellation (Before work is submitted)
    function requestCancel() external {
        require(currentEscrow.state == State.Funded, "Can only cancel funded escrow");
        require(msg.sender == currentEscrow.client || msg.sender == currentEscrow.freelancer, "Not authorized");
        
        uint256 fee = (currentEscrow.amount * 5) / 100;
        uint256 refundAmount = currentEscrow.amount - fee;

        currentEscrow.state = State.Cancelled;
        // Refund client
        IERC20(usdc).transfer(currentEscrow.client, refundAmount);
        // Send fee to treasury (you can replace address(this) with a real treasury wallet)
        IERC20(usdc).transfer(address(this), fee);
    }

    // Step 4: Freelancer submits work
    function submitWork(string memory _ipfsHash) external {
        require(msg.sender == currentEscrow.freelancer, "Only freelancer can submit");
        require(currentEscrow.state == State.Funded, "Escrow not funded");

        currentEscrow.state = State.Submitted;
        currentEscrow.submissionTimestamp = block.timestamp;
        currentIpfsHash = _ipfsHash; // <-- ADD THIS LINE
        
        emit WorkSubmitted(msg.sender, _ipfsHash);
    }

    // Step 5A: Client approves work
    function releaseFunds() external nonReentrant {
        require(msg.sender == currentEscrow.client, "Only client can release");
        require(currentEscrow.state == State.Submitted, "Work not submitted");

        currentEscrow.state = State.Released;
        IERC20(usdc).transfer(currentEscrow.freelancer, currentEscrow.amount);

        emit FundsReleased(currentEscrow.freelancer, currentEscrow.amount);
    }

    // Step 5B: Freelancer auto-releases if client ghosts (after 7 days)
    function autoReleaseFunds() external nonReentrant {
        require(currentEscrow.state == State.Submitted, "Work not submitted");
        require(block.timestamp >= currentEscrow.submissionTimestamp + TIME_LOCK, "Time lock not expired");

        currentEscrow.state = State.Released;
        IERC20(usdc).transfer(currentEscrow.freelancer, currentEscrow.amount);

        emit FundsReleased(currentEscrow.freelancer, currentEscrow.amount);
    }

    // Step 5C: Client rejects work -> Triggers Dispute
    function rejectWork() external {
        require(msg.sender == currentEscrow.client, "Only client can reject");
        require(currentEscrow.state == State.Submitted, "Work not submitted");

        currentEscrow.state = State.Disputed;
        currentEscrow.disputeTimestamp = block.timestamp;

        emit WorkRejected(msg.sender);
    }

    // Step 6A: Freelancer proposes a split during dispute
    function proposeSplit(uint8 _splitPercentage) external {
        require(msg.sender == currentEscrow.freelancer, "Only freelancer can propose");
        require(currentEscrow.state == State.Disputed, "Not in dispute");
        require(_splitPercentage <= 100, "Invalid percentage");

        currentEscrow.proposedSplit = _splitPercentage;
        emit SplitProposed(msg.sender, _splitPercentage);
    }

    // Step 6B: Client accepts the split
    function acceptSplit() external nonReentrant {
        require(msg.sender == currentEscrow.client, "Only client can accept");
        require(currentEscrow.state == State.Disputed, "Not in dispute");
        require(currentEscrow.proposedSplit > 0, "No split proposed");

        uint256 freelancerAmount = (currentEscrow.amount * currentEscrow.proposedSplit) / 100;
        uint256 clientAmount = currentEscrow.amount - freelancerAmount;

        currentEscrow.state = State.Released;

        IERC20(usdc).transfer(currentEscrow.freelancer, freelancerAmount);
        IERC20(usdc).transfer(currentEscrow.client, clientAmount);

        emit FundsReleased(currentEscrow.freelancer, freelancerAmount);
    }

    // Step 6C: Default Judgment (7 days after dispute starts)
    function defaultJudgment() external nonReentrant {
        require(currentEscrow.state == State.Disputed, "Not in dispute");
        require(block.timestamp >= currentEscrow.disputeTimestamp + TIME_LOCK, "Dispute time lock not expired");

        uint8 split = currentEscrow.proposedSplit;
        currentEscrow.state = State.Released;

        // If freelancer proposed a split, they get that amount. 
        // If freelancer ghosts (proposedSplit = 0), client gets 100% refund.
        if (split > 0) {
            uint256 freelancerAmount = (currentEscrow.amount * split) / 100;
            uint256 clientAmount = currentEscrow.amount - freelancerAmount;
            IERC20(usdc).transfer(currentEscrow.freelancer, freelancerAmount);
            IERC20(usdc).transfer(currentEscrow.client, clientAmount);
        } else {
            // Refund client entirely
            IERC20(usdc).transfer(currentEscrow.client, currentEscrow.amount);
        }
    }
}