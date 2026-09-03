// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MarkOracle — the 24/7 fair-value oracle for tokenized stocks on Robinhood Chain
/// @notice Staked publishers push MARK reports (price, confidence, session). Consumers read the
///         median of fresh reports. Reads through `pullPrice` pay a fee in $MARK that accrues to the
///         publishers whose reports were used; `getPrice` is a free view for integrators who only
///         need a number. A publisher whose report sits outside the confidence band of the accepted
///         median can be slashed by the guardian, and the slash goes to the challenger.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MarkOracle {
    struct Report {
        int64 price;        // USD, 8 decimals (fixed-point 1e8 — the same integer the signed payload carries)
        uint64 conf;        // USD, 8 decimals, absolute confidence (± around price)
        uint64 publishTime; // unix seconds
        uint8 session;      // 0 OPEN · 1 PRE · 2 POST · 3 CLOSED
    }
    struct Price { int64 price; uint64 conf; uint64 publishTime; uint8 session; uint8 reports; }

    IERC20 public immutable MARK;
    address public guardian;
    uint256 public minStake;            // $MARK a publisher must lock to post
    uint256 public readFee;             // $MARK charged per pullPrice
    uint64  public maxAge = 120;        // seconds; older reports are ignored by the median
    uint16  public slashBps = 2000;     // 20% of stake per confirmed bad report

    address[] public publishers;
    mapping(address => uint256) public stake;
    mapping(address => uint256) public earned;                         // read fees owed to a publisher
    mapping(bytes32 => mapping(address => Report)) public reportOf;    // feedId → publisher → latest report
    mapping(bytes32 => bool) public feedEnabled;

    event Posted(bytes32 indexed feedId, address indexed publisher, int64 price, uint64 conf, uint64 publishTime, uint8 session);
    event Staked(address indexed publisher, uint256 amount);
    event Unstaked(address indexed publisher, uint256 amount);
    event Slashed(address indexed publisher, bytes32 indexed feedId, uint256 amount, address challenger);
    event FeedSet(bytes32 indexed feedId, bool enabled);

    modifier onlyGuardian() { require(msg.sender == guardian, "guardian"); _; }

    constructor(address mark, uint256 _minStake, uint256 _readFee) {
        MARK = IERC20(mark); guardian = msg.sender; minStake = _minStake; readFee = _readFee;
    }

    /// @dev feedId = keccak256("MARK:" ‖ SYMBOL), e.g. keccak256("MARK:TSLA")
    function feedId(string memory symbol) public pure returns (bytes32) { return keccak256(abi.encodePacked("MARK:", symbol)); }

    // ── publishers ──────────────────────────────────────────────────────────────
    function addStake(uint256 amount) external {
        require(MARK.transferFrom(msg.sender, address(this), amount), "transfer");
        if (stake[msg.sender] == 0) publishers.push(msg.sender);
        stake[msg.sender] += amount;
        emit Staked(msg.sender, amount);
    }
    function removeStake(uint256 amount) external {
        require(stake[msg.sender] >= amount, "stake");
        stake[msg.sender] -= amount;
        require(MARK.transfer(msg.sender, amount), "transfer");
        emit Unstaked(msg.sender, amount);
    }
    function claim() external {
        uint256 a = earned[msg.sender]; earned[msg.sender] = 0;
        require(MARK.transfer(msg.sender, a), "transfer");
    }
    /// @notice Post a MARK report. Price and conf are the fixed-point integers from the signed payload.
    function post(bytes32 id, int64 price, uint64 conf, uint64 publishTime, uint8 session) external {
        require(stake[msg.sender] >= minStake, "under-staked");
        require(feedEnabled[id], "feed");
        require(price > 0 && session <= 3, "report");
        require(publishTime <= block.timestamp + 5 && publishTime >= reportOf[id][msg.sender].publishTime, "time");
        reportOf[id][msg.sender] = Report(price, conf, publishTime, session);
        emit Posted(id, msg.sender, price, conf, publishTime, session);
    }
    function postMany(bytes32[] calldata ids, int64[] calldata prices, uint64[] calldata confs, uint64 publishTime, uint8 session) external {
        require(ids.length == prices.length && ids.length == confs.length, "len");
        for (uint256 i = 0; i < ids.length; i++) this.post(ids[i], prices[i], confs[i], publishTime, session);
    }

    // ── consumers ───────────────────────────────────────────────────────────────
    /// @notice Free view: median price across fresh staked reports. Reverts if no fresh report exists.
    function getPrice(bytes32 id) public view returns (Price memory p) {
        (int64[] memory px, uint64[] memory cf, uint64 t, uint8 s, uint8 n) = _fresh(id);
        require(n > 0, "stale");
        p.price = _median(px, n);
        p.conf = _maxConf(cf, n);
        p.publishTime = t; p.session = s; p.reports = n;
    }
    /// @notice Paid read: charges `readFee` $MARK, split across the publishers whose reports were used.
    function pullPrice(bytes32 id) external returns (Price memory p) {
        p = getPrice(id);
        if (readFee > 0) {
            require(MARK.transferFrom(msg.sender, address(this), readFee), "fee");
            uint256 share = readFee / p.reports;
            for (uint256 i = 0; i < publishers.length; i++) {
                Report memory r = reportOf[id][publishers[i]];
                if (r.publishTime + maxAge >= block.timestamp && stake[publishers[i]] >= minStake) earned[publishers[i]] += share;
            }
        }
    }
    /// @notice Returns the last report of a specific publisher regardless of age (for explorers / disputes).
    function getReport(bytes32 id, address publisher) external view returns (Report memory) { return reportOf[id][publisher]; }

    // ── guardian ────────────────────────────────────────────────────────────────
    /// @notice Slash a publisher whose fresh report is outside the accepted median's confidence band.
    function slash(bytes32 id, address publisher, address challenger) external onlyGuardian {
        Report memory r = reportOf[id][publisher];
        require(r.publishTime + maxAge >= block.timestamp, "not fresh");
        Price memory p = getPrice(id);
        int256 dev = int256(r.price) - int256(p.price); if (dev < 0) dev = -dev;
        require(uint256(dev) > uint256(p.conf) * 2, "inside band");
        uint256 amt = stake[publisher] * slashBps / 10000;
        stake[publisher] -= amt;
        delete reportOf[id][publisher];
        require(MARK.transfer(challenger, amt), "transfer");
        emit Slashed(publisher, id, amt, challenger);
    }
    function setFeed(bytes32 id, bool enabled) external onlyGuardian { feedEnabled[id] = enabled; emit FeedSet(id, enabled); }
    function setParams(uint256 _minStake, uint256 _readFee, uint64 _maxAge, uint16 _slashBps) external onlyGuardian { minStake = _minStake; readFee = _readFee; maxAge = _maxAge; slashBps = _slashBps; }
    function setGuardian(address g) external onlyGuardian { guardian = g; }

    // ── internals ───────────────────────────────────────────────────────────────
    function _fresh(bytes32 id) internal view returns (int64[] memory px, uint64[] memory cf, uint64 latest, uint8 session, uint8 n) {
        px = new int64[](publishers.length); cf = new uint64[](publishers.length);
        for (uint256 i = 0; i < publishers.length; i++) {
            if (stake[publishers[i]] < minStake) continue;
            Report memory r = reportOf[id][publishers[i]];
            if (r.publishTime == 0 || r.publishTime + maxAge < block.timestamp) continue;
            px[n] = r.price; cf[n] = r.conf; n++;
            if (r.publishTime > latest) { latest = r.publishTime; session = r.session; }
        }
    }
    function _median(int64[] memory a, uint8 n) internal pure returns (int64) {
        for (uint256 i = 1; i < n; i++) { int64 k = a[i]; uint256 j = i; while (j > 0 && a[j - 1] > k) { a[j] = a[j - 1]; j--; } a[j] = k; }
        return n % 2 == 1 ? a[n / 2] : int64((int128(a[n / 2 - 1]) + int128(a[n / 2])) / 2);
    }
    function _maxConf(uint64[] memory a, uint8 n) internal pure returns (uint64 m) { for (uint256 i = 0; i < n; i++) if (a[i] > m) m = a[i]; }
}
