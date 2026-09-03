// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MarkPerps — real long/short on tokenized stocks, 24/7, settled against the MARK signature
/// @notice USDG-collateralised perpetual positions on Robinhood Chain. Every open, close and
///         liquidation carries a fresh MARK price update signed by the oracle; the contract
///         verifies the secp256k1 signature over sha256("MARKv1" ‖ sym ‖ price ‖ conf ‖ ts ‖ session).
///         Fills happen at mark ± conf/2 — traders pay the band, so a wide weekend band is a
///         wide spread, exactly as it should be. A single LP pool is the counterparty and earns
///         every fee and every liquidation remainder.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MarkPerps {
    struct Px { bytes32 sym; int64 price; uint64 conf; uint64 ts; uint8 session; bytes32 r; bytes32 s; }
    struct Pos { address owner; bytes32 sym; bool isLong; uint8 status; uint128 margin; uint128 size; int64 entry; uint64 openedAt; int64 exit; }
    // status: 0 open · 1 closed · 2 liquidated

    IERC20 public immutable USDG;
    address public signer;
    address public guardian;
    uint256 public maxLev = 10;
    uint16  public feeBps = 8;          // of size, on open and on close → pool
    uint16  public maintBps = 500;      // maintenance margin, % of size
    uint16  public liqBountyBps = 2000; // of remaining margin → liquidator
    uint64  public maxAge = 90;         // seconds a price update stays valid
    uint256 public oiCap = 4;           // total open size ≤ oiCap × poolBalance
    bool    public paused;

    mapping(address => uint256) public free;         // withdrawable collateral
    uint256 public poolBalance;                       // LP counterparty capital
    uint256 public totalShares;
    mapping(address => uint256) public shares;
    uint256 public openInterest;
    Pos[] public positions;
    mapping(address => uint256[]) internal userPos;
    mapping(bytes32 => bool) public listed;

    event Deposit(address indexed u, uint256 amt);
    event Withdraw(address indexed u, uint256 amt);
    event Provide(address indexed u, uint256 amt, uint256 sh);
    event Redeem(address indexed u, uint256 amt, uint256 sh);
    event Open(uint256 indexed id, address indexed u, bytes32 sym, bool isLong, uint256 margin, uint256 size, int64 entry, uint8 session);
    event Close(uint256 indexed id, address indexed u, int64 exit, int256 pnl, uint256 payout);
    event Liquidate(uint256 indexed id, address indexed u, address liquidator, int64 exit, uint256 bounty);

    modifier onlyGuardian() { require(msg.sender == guardian, "guardian"); _; }

    constructor(address usdg, address _signer, bytes32[] memory syms) {
        USDG = IERC20(usdg); signer = _signer; guardian = msg.sender;
        for (uint256 i = 0; i < syms.length; i++) listed[syms[i]] = true;
    }

    // ── oracle ──────────────────────────────────────────────────────────────────
    function priceHash(Px calldata p) public pure returns (bytes32) {
        return sha256(abi.encodePacked("MARKv1", p.sym, p.price, p.conf, p.ts, p.session));
    }
    function _verify(Px calldata p) internal view {
        require(listed[p.sym], "not listed");
        require(p.price > 0 && p.ts + maxAge >= block.timestamp && p.ts <= block.timestamp + 5, "stale price");
        bytes32 h = priceHash(p);
        require(ecrecover(h, 27, p.r, p.s) == signer || ecrecover(h, 28, p.r, p.s) == signer, "bad sig");
    }
    /// fill = mark ± conf/2; longs pay up, shorts sell down
    function _fill(Px calldata p, bool buy) internal pure returns (int64) {
        int64 half = int64(p.conf / 2);
        return buy ? p.price + half : p.price - half;
    }

    // ── collateral ──────────────────────────────────────────────────────────────
    function deposit(uint256 amt) external { require(USDG.transferFrom(msg.sender, address(this), amt), "transfer"); free[msg.sender] += amt; emit Deposit(msg.sender, amt); }
    function withdraw(uint256 amt) external { require(free[msg.sender] >= amt, "free"); free[msg.sender] -= amt; require(USDG.transfer(msg.sender, amt), "transfer"); emit Withdraw(msg.sender, amt); }

    // ── LP pool ─────────────────────────────────────────────────────────────────
    function provide(uint256 amt) external {
        require(USDG.transferFrom(msg.sender, address(this), amt), "transfer");
        uint256 sh = totalShares == 0 || poolBalance == 0 ? amt : amt * totalShares / poolBalance;
        poolBalance += amt; totalShares += sh; shares[msg.sender] += sh;
        emit Provide(msg.sender, amt, sh);
    }
    function redeem(uint256 sh) external {
        require(shares[msg.sender] >= sh && sh > 0, "shares");
        uint256 amt = sh * poolBalance / totalShares;
        require(poolBalance - amt >= openInterest / oiCap, "pool backs open interest");
        shares[msg.sender] -= sh; totalShares -= sh; poolBalance -= amt;
        require(USDG.transfer(msg.sender, amt), "transfer");
        emit Redeem(msg.sender, amt, sh);
    }

    // ── trading ─────────────────────────────────────────────────────────────────
    function open(Px calldata p, bool isLong, uint256 margin, uint256 lev) external returns (uint256 id) {
        require(!paused, "paused");
        _verify(p);
        require(lev >= 1 && lev <= maxLev, "lev");
        require(free[msg.sender] >= margin && margin > 0, "margin");
        uint256 size = margin * lev;
        uint256 fee = size * feeBps / 10000;
        require(fee < margin, "fee");
        require(openInterest + size <= poolBalance * oiCap, "oi cap");
        free[msg.sender] -= margin; poolBalance += fee;
        int64 entry = _fill(p, isLong);
        id = positions.length;
        positions.push(Pos(msg.sender, p.sym, isLong, 0, uint128(margin - fee), uint128(size), entry, uint64(block.timestamp), 0));
        userPos[msg.sender].push(id);
        openInterest += size;
        emit Open(id, msg.sender, p.sym, isLong, margin - fee, size, entry, p.session);
    }
    function pnlOf(Pos memory q, int64 px) public pure returns (int256) {
        int256 d = int256(px) - int256(q.entry);
        if (!q.isLong) d = -d;
        return d * int256(uint256(q.size)) / int256(q.entry);
    }
    function close(uint256 id, Px calldata p) external {
        Pos storage q = positions[id];
        require(q.owner == msg.sender && q.status == 0 && q.sym == p.sym, "position");
        _verify(p);
        int64 exit = _fill(p, !q.isLong);
        int256 pnl = pnlOf(q, exit);
        uint256 fee = uint256(q.size) * feeBps / 10000;
        int256 net = int256(uint256(q.margin)) + pnl - int256(fee);
        uint256 payout = net > 0 ? uint256(net) : 0;
        if (payout > uint256(q.margin) + poolBalance) payout = uint256(q.margin) + poolBalance; // pool can never owe more than it has
        // settle: margin was held by the contract; the difference moves to / from the pool
        if (payout >= q.margin) poolBalance -= (payout - q.margin); else poolBalance += (q.margin - payout);
        free[msg.sender] += payout;
        q.status = 1; q.exit = exit; openInterest -= q.size;
        emit Close(id, msg.sender, exit, pnl, payout);
    }
    function liquidatable(uint256 id, int64 px) public view returns (bool) {
        Pos memory q = positions[id];
        if (q.status != 0) return false;
        int256 eq = int256(uint256(q.margin)) + pnlOf(q, px);
        return eq <= int256(uint256(q.size) * maintBps / 10000);
    }
    function liquidate(uint256 id, Px calldata p) external {
        Pos storage q = positions[id];
        require(q.status == 0 && q.sym == p.sym, "position");
        _verify(p);
        require(liquidatable(id, p.price), "healthy");
        int256 eq = int256(uint256(q.margin)) + pnlOf(q, p.price);
        uint256 remain = eq > 0 ? uint256(eq) : 0;
        uint256 bounty = remain * liqBountyBps / 10000;
        poolBalance += q.margin - bounty;           // margin minus bounty stays with the pool
        free[msg.sender] += bounty;
        q.status = 2; q.exit = p.price; openInterest -= q.size;
        emit Liquidate(id, q.owner, msg.sender, p.price, bounty);
    }

    // ── views ───────────────────────────────────────────────────────────────────
    function count() external view returns (uint256) { return positions.length; }
    function idsOf(address u) external view returns (uint256[] memory) { return userPos[u]; }
    function equityOf(address u) external view returns (uint256) { return free[u]; }

    // ── guardian ────────────────────────────────────────────────────────────────
    function setSigner(address s) external onlyGuardian { signer = s; }
    function setListed(bytes32 sym, bool on) external onlyGuardian { listed[sym] = on; }
    function setParams(uint256 _maxLev, uint16 _feeBps, uint16 _maintBps, uint16 _liqBountyBps, uint64 _maxAge, uint256 _oiCap) external onlyGuardian {
        maxLev = _maxLev; feeBps = _feeBps; maintBps = _maintBps; liqBountyBps = _liqBountyBps; maxAge = _maxAge; oiCap = _oiCap;
    }
    function setPaused(bool p) external onlyGuardian { paused = p; }
    function setGuardian(address g) external onlyGuardian { guardian = g; }
}
