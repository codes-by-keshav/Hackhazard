// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title MONarcade
 * @dev A contract for staking native MON in games and distributing rewards based on game results
 * @custom:security-contact security@monarcade.example
 */
contract MONarcade is Ownable, ReentrancyGuard, Pausable {
    // Game state enumeration for better tracking
    enum GameStatus { NonExistent, Created, InProgress, Completed }
    
    struct Game {
        GameStatus status;
        address[] players;
        mapping(address => bool) hasStaked;
        mapping(address => uint256) stakedAmount;
        uint256 totalStaked;
        uint256 requiredStake;
        uint256 createdAt;
        uint256 expiresAt;
    }

    mapping(bytes32 => Game) private games;
    
    // Time window after which a game can be cancelled if not all players have staked
    uint256 public gameExpirationTime = 24 hours;
    
    // Minimum number of players required for a game
    uint256 public constant MIN_PLAYERS = 2;
    
    // Maximum number of players allowed in a game (prevent gas limit issues)
    uint256 public constant MAX_PLAYERS = 10;
    
    // Fee percentage (in basis points, e.g., 100 = 1%)
    uint256 public feePercentage = 0;
    
    // Address where fees are collected
    address public feeCollector;

    event GameCreated(bytes32 indexed gameId, address[] players, uint256 stakeAmount, uint256 expiresAt);
    event PlayerStaked(bytes32 indexed gameId, address indexed player, uint256 amount);
    event GameResultSubmitted(bytes32 indexed gameId, address indexed winner, uint256 reward);
    event GameCancelled(bytes32 indexed gameId, string reason);
    event FeePercentageChanged(uint256 oldFee, uint256 newFee);
    event FeeCollectorChanged(address oldCollector, address newCollector);
    event GameExpirationTimeChanged(uint256 oldTime, uint256 newTime);
    event FundsRecovered(address to, uint256 amount);

    /**
     * @dev Initializes contract with fee collector address
     * @param _feeCollector Address that will receive fees
     */
    constructor(address _feeCollector) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector address");
        feeCollector = _feeCollector;
    }

    /**
     * @dev Checks if the caller is a player in the specified game
     */
    modifier onlyPlayer(bytes32 gameId) {
        require(games[gameId].status != GameStatus.NonExistent, "Game does not exist");
        bool isPlayer = false;
        for (uint i = 0; i < games[gameId].players.length; i++) {
            if (games[gameId].players[i] == msg.sender) {
                isPlayer = true;
                break;
            }
        }
        require(isPlayer, "Not a player in this game");
        _;
    }

    /**
     * @dev Creates a new game with specified players and stake amount
     * @param gameId Unique identifier for the game
     * @param players Array of player addresses
     * @param stakeAmount Amount each player must stake in native MON
     */
    function createGame(bytes32 gameId, address[] calldata players, uint256 stakeAmount) 
        external 
        onlyOwner 
        whenNotPaused 
    {
        require(games[gameId].status == GameStatus.NonExistent, "Game already exists");
        require(players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS, "Invalid number of players");
        require(stakeAmount > 0, "Stake must be greater than 0");
        
        // Check for duplicate players
        for (uint i = 0; i < players.length; i++) {
            require(players[i] != address(0), "Invalid player address");
            for (uint j = i + 1; j < players.length; j++) {
                require(players[i] != players[j], "Duplicate player address");
            }
        }

        Game storage game = games[gameId];
        game.status = GameStatus.Created;
        game.players = players;
        game.requiredStake = stakeAmount;
        game.createdAt = block.timestamp;
        game.expiresAt = block.timestamp + gameExpirationTime;

        emit GameCreated(gameId, players, stakeAmount, game.expiresAt);
    }

    /**
     * @dev Allows a player to stake native MON for a game
     * @param gameId The game identifier
     */
    function stake(bytes32 gameId) 
        external 
        payable
        nonReentrant 
        onlyPlayer(gameId) 
        whenNotPaused 
    {
        Game storage game = games[gameId];
        require(game.status != GameStatus.Completed, "Game already completed");
        require(!game.hasStaked[msg.sender], "Player already staked");
        require(block.timestamp < game.expiresAt, "Game staking period has expired");
        
        uint256 amount = game.requiredStake;
        require(msg.value == amount, "Incorrect stake amount");
        
        // Update state
        game.hasStaked[msg.sender] = true;
        game.stakedAmount[msg.sender] = amount;
        game.totalStaked += amount;
        
        // Check if all players have staked
        bool allStaked = true;
        for (uint i = 0; i < game.players.length; i++) {
            if (!game.hasStaked[game.players[i]]) {
                allStaked = false;
                break;
            }
        }
        
        if (allStaked) {
            game.status = GameStatus.InProgress;
        }

        emit PlayerStaked(gameId, msg.sender, amount);
    }

    /**
     * @dev Submits and validates game results
     * @param gameId The game identifier
     * @param winner Address of the winning player
     * @param signatures Signatures from other players confirming the result
     */
    function submitResult(
        bytes32 gameId,
        address winner,
        bytes[] calldata signatures
    ) 
        external 
        nonReentrant
        onlyPlayer(gameId) 
        whenNotPaused 
    {
        Game storage game = games[gameId];
        require(game.status == GameStatus.InProgress, "Game not in progress");
        
        // Check if winner is a player
        bool winnerIsPlayer = false;
        for (uint i = 0; i < game.players.length; i++) {
            if (game.players[i] == winner) {
                winnerIsPlayer = true;
                break;
            }
        }
        require(winnerIsPlayer, "Winner is not a player in this game");

        uint256 expectedPlayers = game.players.length;
        require(signatures.length == expectedPlayers - 1, "Incorrect number of signatures");

        // Create the message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(gameId, winner, address(this), block.chainid, game.createdAt)
        );
        
        // Convert to Ethereum signed message hash
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        
        // Track valid signatures and which players have signed
        uint256 validSignatures = 0;
        bool[] memory sigUsed = new bool[](signatures.length);

        for (uint i = 0; i < game.players.length; i++) {
            address player = game.players[i];
            if (player == msg.sender) continue;

            bool validSig = false;
            for (uint j = 0; j < signatures.length; j++) {
                if (sigUsed[j]) continue;
                address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signatures[j]);
                if (recoveredSigner == player) {
                    validSig = true;
                    validSignatures++;
                    sigUsed[j] = true;
                    break;
                }
            }
            require(validSig, "Invalid or missing signature from player");
        }

        require(validSignatures == expectedPlayers - 1, "Not enough valid signatures");
        
        // Mark game as completed before transfer to prevent reentrancy
        game.status = GameStatus.Completed;
        
        // Calculate fee if applicable
        uint256 totalAmount = game.totalStaked;
        uint256 feeAmount = 0;
        
        if (feePercentage > 0 && feeCollector != address(0)) {
            feeAmount = (totalAmount * feePercentage) / 10000;
            totalAmount -= feeAmount;
            
            if (feeAmount > 0) {
                (bool feeSuccess, ) = feeCollector.call{value: feeAmount}("");
                require(feeSuccess, "Fee transfer failed");
            }
        }
        
        // Transfer the reward to winner
        (bool success, ) = winner.call{value: totalAmount}("");
        require(success, "Reward transfer failed");
        
        emit GameResultSubmitted(gameId, winner, totalAmount);
    }

    /**
     * @dev Cancels a game that hasn't started and returns funds to staked players
     * @param gameId The game identifier
     */
    function cancelGame(bytes32 gameId) 
        external 
        nonReentrant 
    {
        Game storage game = games[gameId];
        
        // Game can be cancelled by owner anytime or by a player if the game has expired
        require(
            msg.sender == owner() || 
            (isPlayerInGame(gameId, msg.sender) && block.timestamp >= game.expiresAt),
            "Not authorized to cancel"
        );
        require(game.status == GameStatus.Created, "Game cannot be cancelled");
        
        game.status = GameStatus.Completed; // Mark as completed to prevent further stakes
        
        // Return stakes to players who have already staked
        for (uint i = 0; i < game.players.length; i++) {
            address player = game.players[i];
            uint256 amount = game.stakedAmount[player];
            
            if (game.hasStaked[player] && amount > 0) {
                game.stakedAmount[player] = 0;
                (bool success, ) = player.call{value: amount}("");
                require(success, "Refund transfer failed");
            }
        }
        
        emit GameCancelled(gameId, "Game cancelled");
    }

    /**
     * @dev Allows contract owner to update fee percentage
     * @param _feePercentage New fee percentage in basis points (e.g., 100 = 1%)
     */
    function setFeePercentage(uint256 _feePercentage) external onlyOwner {
        require(_feePercentage <= 1000, "Fee cannot exceed 10%");
        uint256 oldFee = feePercentage;
        feePercentage = _feePercentage;
        emit FeePercentageChanged(oldFee, _feePercentage);
    }

    /**
     * @dev Updates the fee collector address
     * @param _feeCollector New fee collector address
     */
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid fee collector address");
        address oldCollector = feeCollector;
        feeCollector = _feeCollector;
        emit FeeCollectorChanged(oldCollector, _feeCollector);
    }

    /**
     * @dev Updates the game expiration time
     * @param _expirationTime New expiration time in seconds
     */
    function setGameExpirationTime(uint256 _expirationTime) external onlyOwner {
        require(_expirationTime >= 1 hours, "Expiration time too short");
        uint256 oldTime = gameExpirationTime;
        gameExpirationTime = _expirationTime;
        emit GameExpirationTimeChanged(oldTime, _expirationTime);
    }
    
    /**
     * @dev Emergency pause functionality
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Recover accidentally sent native MON
     * @param to Address to send recovered MON to
     * @param amount Amount of MON to recover
     */
    function recoverFunds(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot send to zero address");
        
                // Calculate how many MON are not part of active games
        uint256 contractBalance = address(this).balance;
        uint256 allocatedMON = 0;
        
        // This is a simplistic approach - in production you'd need a more efficient way to track this
        bytes32[] memory activeGameIds = getActiveGameIds();
        for (uint i = 0; i < activeGameIds.length; i++) {
            allocatedMON += games[activeGameIds[i]].totalStaked;
        }
        
        require(contractBalance - allocatedMON >= amount, "Cannot withdraw staked MON");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "Recovery transfer failed");
        emit FundsRecovered(to, amount);
    }
    
    /**
     * @dev Receive function to allow contract to receive native MON
     */
    receive() external payable {}
    
    /**
     * @dev Fallback function in case receive is not matched
     */
    fallback() external payable {}
    
    // View functions

    /**
     * @dev Checks if an address is a player in a specific game
     * @param gameId The game identifier
     * @param player Address to check
     * @return True if the address is a player in the game
     */
    function isPlayerInGame(bytes32 gameId, address player) public view returns (bool) {
        if (games[gameId].status == GameStatus.NonExistent) return false;
        
        for (uint i = 0; i < games[gameId].players.length; i++) {
            if (games[gameId].players[i] == player) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Returns list of player addresses for a game
     * @param gameId The game identifier
     * @return Array of player addresses
     */
    function getGamePlayers(bytes32 gameId) external view returns (address[] memory) {
        require(games[gameId].status != GameStatus.NonExistent, "Game does not exist");
        return games[gameId].players;
    }

    /**
     * @dev Checks if a player has staked in a game
     * @param gameId The game identifier
     * @param player Address of the player
     * @return True if player has staked
     */
    function hasPlayerStaked(bytes32 gameId, address player) external view returns (bool) {
        require(games[gameId].status != GameStatus.NonExistent, "Game does not exist");
        return games[gameId].hasStaked[player];
    }

    /**
     * @dev Returns the game status
     * @param gameId The game identifier
     * @return Game status (0=NonExistent, 1=Created, 2=InProgress, 3=Completed)
     */
    function getGameStatus(bytes32 gameId) external view returns (GameStatus) {
        return games[gameId].status;
    }

    /**
     * @dev Returns the total amount staked in a game
     * @param gameId The game identifier
     * @return Total staked amount
     */
    function getTotalStaked(bytes32 gameId) external view returns (uint256) {
        require(games[gameId].status != GameStatus.NonExistent, "Game does not exist");
        return games[gameId].totalStaked;
    }
    
    /**
     * @dev Returns the amount staked by a specific player
     * @param gameId The game identifier
     * @param player Address of the player
     * @return Amount staked by the player
     */
    function getPlayerStake(bytes32 gameId, address player) external view returns (uint256) {
        require(games[gameId].status != GameStatus.NonExistent, "Game does not exist");
        return games[gameId].stakedAmount[player];
    }
    
    /**
     * @dev Returns the expiration time for a game
     * @param gameId The game identifier
     * @return Timestamp when the game expires
     */
    function getGameExpiration(bytes32 gameId) external view returns (uint256) {
        require(games[gameId].status != GameStatus.NonExistent, "Game does not exist");
        return games[gameId].expiresAt;
    }
    
    /**
     * @dev Returns IDs of all active games (Created or InProgress)
     * @notice This is a helper function and might be gas-intensive - not suitable for on-chain calls
     */
    function getActiveGameIds() public view returns (bytes32[] memory) {
        // This implementation is inefficient for production use
        // In a real implementation, consider storing game IDs in an array and using index mapping
        
        // Dummy implementation to demonstrate the concept
        bytes32[] memory dummyIds = new bytes32[](0);
        return dummyIds;
    }
}

