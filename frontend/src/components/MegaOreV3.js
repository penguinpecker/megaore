"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, http, fallback, parseEther, encodeFunctionData } from "viem";
import { megaethChain } from "./Providers";

// ═══════════════════════════════════════════════════════════════
// V3 CONTRACT ABI — OreGrid V3: Guaranteed Winners
// OreGrid V3: 0xa3230e290205FfEf5a1f71e52b5aDba69a88208d
// OreToken V3: 0x63Fb06feD80002818428673eE69D4dF1b1923e3A
// Chain: MegaETH Mainnet (4326)
// ═══════════════════════════════════════════════════════════════
const GRID_ABI = [
  { name: "currentRoundId", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getCurrentRound", type: "function", stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "potSize", type: "uint256" },
    ] },
  { name: "rounds", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "potSize", type: "uint256" },
      { name: "totalMiners", type: "uint256" },
      { name: "winningCell", type: "uint256" },
      { name: "resolved", type: "uint256" },
      { name: "extra", type: "uint256" },
    ] },
  { name: "playerCell", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "joinRound", type: "function", stateMutability: "payable",
    inputs: [{ name: "cellIndex", type: "uint8" }], outputs: [] },
  { name: "depositAmount", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "roundDuration", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "orePerRound", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "motherlodePool", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "canResolve", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "hasJoined", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "getCellPlayers", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "cell", type: "uint8" }],
    outputs: [{ name: "", type: "address[]" }] },
  { name: "pendingWithdrawals", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
];

const TOKEN_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
];

const GRID_ADDR = "0xa3230e290205FfEf5a1f71e52b5aDba69a88208d";
const TOKEN_ADDR = "0x63Fb06feD80002818428673eE69D4dF1b1923e3A";
const CELL_COST = "0.0001";
const ROUND_DURATION = 30;
const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const GRID_CELLS_SELECTOR = "0x6e0cf737"; // getCellCounts() — returns uint16[25] player counts
const RESOLVER_URL = ""; // V3 backup resolver — will be set after Supabase deploy

const CELL_LABELS = [];
for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    CELL_LABELS.push(`${String.fromCharCode(65 + r)}${c + 1}`);

// Our own public client — WE control the RPC, not MetaMask
const publicClient = createPublicClient({
  chain: megaethChain,
  transport: fallback([
    http("https://megaeth.drpc.org", {
      timeout: 30_000,
      retryCount: 2,
      retryDelay: 1000,
    }),
    http("https://mainnet.megaeth.com/rpc", {
      timeout: 30_000,
      retryCount: 2,
      retryDelay: 2000,
    }),
  ]),
});

const fmt = (v, d = 4) => {
  if (!v) return "0." + "0".repeat(d);
  return (Number(v) / 1e18).toFixed(d);
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function MegaOreV3() {
  const { ready, authenticated, login, logout, user, exportWallet } = usePrivy();
  const { wallets } = useWallets();

  // Contract state
  const [round, setRound] = useState(0);
  const [roundStart, setRoundStart] = useState(0);
  const [roundEnd, setRoundEnd] = useState(0);
  const [potSize, setPotSize] = useState("0");
  const [activeMiners, setActiveMiners] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [winningCell, setWinningCell] = useState(-1);
  const [claimedCells, setClaimedCells] = useState(new Set());
  const [cellCounts, setCellCounts] = useState(new Array(TOTAL_CELLS).fill(0));
  const [playerCell, setPlayerCell] = useState(-1);
  const [oreBalance, setOreBalance] = useState("0");
  const [ethBalance, setEthBalance] = useState("0");

  // UI state
  const [smoothTime, setSmoothTime] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const lastTapRef = useRef({ cell: -1, time: 0 });
  const [hoveredCell, setHoveredCell] = useState(-1);
  const [claiming, setClaiming] = useState(false);
  const [feed, setFeed] = useState([]);
  const [userHistory, setUserHistory] = useState([]);
  const [userHistoryLoading, setUserHistoryLoading] = useState(false);
  const userHistoryLoaded = useRef(false);
  const userHistoryCursor = useRef(0);
  const [scanLine, setScanLine] = useState(0);
  const [error, setError] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { roundId, cell, miners, pot, txHash }
  const [roundHistory, setRoundHistory] = useState([]); // array of ALL loaded past results, newest first
  const [moneyFlow, setMoneyFlow] = useState(false);
  const [gridFlash, setGridFlash] = useState(false);
  const [historyPage, setHistoryPage] = useState(0); // current page (0 = newest)
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFullyLoaded, setHistoryFullyLoaded] = useState(false); // true when scanned back to round 1
  const historyCursor = useRef(0); // next round ID to scan backwards from
  const resolverTxHash = useRef(null);
  const HISTORY_PAGE_SIZE = 10;

  const animFrame = useRef(null);
  const pollRef = useRef(null);
  const lastRoundRef = useRef(0);
  const resolverCalledForRound = useRef(0);
  const resolvedRef = useRef(false);

  // Get the embedded wallet address
  const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
  const address = wallet?.address;

  // ─── Smooth 60fps Timer ───
  useEffect(() => {
    const tick = () => {
      if (roundEnd > 0) {
        const remaining = Math.max(0, roundEnd - Date.now() / 1000);
        setSmoothTime(remaining);
      }
      animFrame.current = requestAnimationFrame(tick);
    };
    animFrame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame.current);
  }, [roundEnd]);

  // ─── Scan Line ───
  useEffect(() => {
    const iv = setInterval(() => setScanLine((p) => (p + 1) % 100), 40);
    return () => clearInterval(iv);
  }, []);

  // ─── Poll Contract (uses OUR public client, not wallet) ───
  const pollError = useRef(null);
  const pollCount = useRef(0);
  const pollState = useCallback(async () => {
    pollCount.current++;
    try {
      // 1. Get current round (CRITICAL - everything depends on this)
      let roundId;
      try {
        roundId = await publicClient.readContract({
          address: GRID_ADDR, abi: GRID_ABI, functionName: "currentRoundId",
        });
      } catch (e) {
        pollError.current = "RPC: currentRoundId failed - " + (e.shortMessage || e.message || "unknown");
        console.error("Poll: currentRoundId failed", e);
        return; // Can't continue without round ID
      }
      const rNum = Number(roundId);
      setRound(rNum);
      pollError.current = null; // Clear error on success

      // 2. Get round data — field order: [0]start [1]end [2]pot [3]totalMiners [4]winningCell [5]resolved [6]extra
      try {
        const rd = await publicClient.readContract({
          address: GRID_ADDR, abi: GRID_ABI, functionName: "rounds", args: [roundId],
        });
        setRoundStart(Number(rd[0]));
        setRoundEnd(Number(rd[1]));
        setPotSize(rd[2].toString());
        setActiveMiners(Number(rd[3]));         // [3] = totalMiners
        const isResolved = Number(rd[5]) === 1; // [5] = resolved
        setResolved(isResolved);
        resolvedRef.current = isResolved;
        if (isResolved && Number(rd[4]) > 0) {  // [4] = winningCell
          setWinningCell(Number(rd[4]));
        } else if (!isResolved) {
          setWinningCell(-1);
        }
      } catch (e) {
        console.error("Poll: rounds() failed", e);
      }

      // 3. Auto-trigger resolver — use endTime we already fetched (skip canResolve RPC)
      //    Resolution window is only ~4 seconds. Every ms counts.
      try {
        if (!resolvedRef.current && rNum > 0) {
          const now = Date.now();
          const lastAttempt = resolverCalledForRound.current || 0;
          const nowSec = now / 1000;
          // Fire when round has ended (endTime passed) — no need to call canResolve()
          if (now - lastAttempt > 2000 && roundEnd > 0 && nowSec >= roundEnd) {
            resolverCalledForRound.current = now;
            if (RESOLVER_URL) {
              console.log("[MegaORE] Round ended, calling resolver directly...");
              fetch(RESOLVER_URL, { method: "POST" })
                .then(r => r.json())
                .then(d => {
                  console.log("[MegaORE] Resolver response:", d);
                  if ((d.action === "resolved" || d.action === "fulfill") && d.tx) resolverTxHash.current = d.tx;
                })
                .catch(err => console.error("[MegaORE] Resolver fetch error:", err));
            }
          }
        }
      } catch (e) {
        console.error("Poll: resolve trigger failed", e);
      }

      // 4. Player data (only if connected)
      if (address) {
        try {
          // V3: playerCell stores raw cell index (0-24), so we need hasJoined to distinguish
          const joined = await publicClient.readContract({
            address: GRID_ADDR, abi: GRID_ABI, functionName: "hasJoined",
            args: [roundId, address],
          });
          if (joined) {
            const pc = await publicClient.readContract({
              address: GRID_ADDR, abi: GRID_ABI, functionName: "playerCell",
              args: [roundId, address],
            });
            setPlayerCell(Number(pc));
          } else {
            setPlayerCell(-1);
          }
        } catch (e) {
          console.error("Poll: playerCell failed", e);
        }

        try {
          const oreBal = await publicClient.readContract({
            address: TOKEN_ADDR, abi: TOKEN_ABI, functionName: "balanceOf",
            args: [address],
          });
          setOreBalance(oreBal.toString());
        } catch (e) {
          console.error("Poll: balanceOf failed", e);
        }

        try {
          const ethBal = await publicClient.getBalance({ address });
          setEthBalance(ethBal.toString());
        } catch (e) {
          console.error("Poll: getBalance failed", e);
        }
      }

      // 5. Grid cell player counts (V3: getCellCounts returns uint16[25])
      try {
        const result = await publicClient.call({
          to: GRID_ADDR,
          data: GRID_CELLS_SELECTOR,
        });
        if (result.data) {
          const hex = result.data.slice(2);
          const claimed = new Set();
          const counts = new Array(TOTAL_CELLS).fill(0);
          for (let i = 0; i < TOTAL_CELLS; i++) {
            const word = hex.slice(i * 64, (i + 1) * 64);
            if (word && word.length === 64) {
              const count = Number(BigInt("0x" + word));
              counts[i] = count;
              if (count > 0) claimed.add(i);
            }
          }
          setClaimedCells(claimed);
          setCellCounts(counts);
        }
      } catch (e) {
        console.error("Poll: getCellCounts failed", e);
      }
    } catch (e) {
      pollError.current = "Poll error: " + (e.shortMessage || e.message || "unknown");
      console.error("Poll error:", e);
    }
  }, [address, roundEnd]);

  useEffect(() => {
    pollState();
    // Poll every 3s — fast enough for 30s rounds, avoids rate limits
    pollRef.current = setInterval(pollState, 3000);
    return () => { clearInterval(pollRef.current); };
  }, [pollState]);

  // ─── Load round history from contract ───
  const historyLoaded = useRef(false);
  const historyLoadingRef = useRef(false);
  const historyFullyLoadedRef = useRef(false);

  const scanRoundsWithMiners = async (startFrom, count) => {
    if (historyLoadingRef.current) return [];
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    const results = [];
    let cursor = startFrom;
    try {
      while (results.length < count && cursor >= 1) {
        const batchSize = Math.min(5, cursor);
        const ids = [];
        for (let i = 0; i < batchSize; i++) {
          if (cursor - i >= 1) ids.push(cursor - i);
        }
        const batch = await Promise.all(
          ids.map(rId =>
            publicClient.readContract({
              address: GRID_ADDR, abi: GRID_ABI, functionName: "rounds", args: [BigInt(rId)],
            }).then(rd => ({
              roundId: rId,
              cell: Number(rd[4]),           // [4] = winningCell
              miners: Number(rd[3]),          // [3] = totalMiners
              pot: rd[2].toString(),
              resolved: Number(rd[5]) === 1,  // [5] = resolved
              txHash: null,
            })).catch(() => null)
          )
        );
        for (const r of batch) {
          if (r && r.miners > 0 && results.length < count) {
            results.push(r);
          }
        }
        cursor -= batchSize;
      }
    } catch (e) {
      console.error("History scan error:", e);
    }
    historyCursor.current = Math.max(0, cursor);
    if (cursor < 1) {
      historyFullyLoadedRef.current = true;
      setHistoryFullyLoaded(true);
    }
    historyLoadingRef.current = false;
    setHistoryLoading(false);
    return results;
  };

  // Initial load on first round detection (or fallback after 5s)
  useEffect(() => {
    if (round > 1 && !historyLoaded.current) {
      historyLoaded.current = true;
      historyCursor.current = round - 1;
      scanRoundsWithMiners(round - 1, HISTORY_PAGE_SIZE).then(results => {
        if (results.length > 0) setRoundHistory(results);
      });
    }
  }, [round]);

  // Fallback: if after 5 seconds round is still 0, try fetching directly
  useEffect(() => {
    const fallbackTimer = setTimeout(async () => {
      if (round === 0 || historyLoaded.current) return;
      try {
        const roundId = await publicClient.readContract({
          address: GRID_ADDR, abi: GRID_ABI, functionName: "currentRoundId",
        });
        const rNum = Number(roundId);
        if (rNum > 1 && !historyLoaded.current) {
          setRound(rNum); // Force update round state
          historyLoaded.current = true;
          historyCursor.current = rNum - 1;
          const results = await scanRoundsWithMiners(rNum - 1, HISTORY_PAGE_SIZE);
          if (results.length > 0) setRoundHistory(results);
        }
      } catch (e) {
        console.error("Fallback history load failed:", e);
      }
    }, 5000);
    return () => clearTimeout(fallbackTimer);
  }, []);

  // Load older pages on demand
  const loadOlderHistory = () => {
    if (historyLoadingRef.current || historyFullyLoadedRef.current) return;
    scanRoundsWithMiners(historyCursor.current, HISTORY_PAGE_SIZE).then(results => {
      if (results.length > 0) {
        setRoundHistory(prev => {
          const existingIds = new Set(prev.map(r => r.roundId));
          const newOnes = results.filter(r => !existingIds.has(r.roundId));
          return [...prev, ...newOnes];
        });
      }
    });
  };

  // ─── User History — scan past rounds for this user's entries ───
  const scanUserHistory = async (startFrom, count) => {
    if (!address || startFrom < 1) return [];
    const results = [];
    let cursor = startFrom;
    try {
      while (results.length < count && cursor >= 1) {
        const batchSize = Math.min(5, cursor);
        const ids = [];
        for (let i = 0; i < batchSize; i++) {
          if (cursor - i >= 1) ids.push(cursor - i);
        }
        const joined = await Promise.all(
          ids.map(rId =>
            publicClient.readContract({
              address: GRID_ADDR, abi: GRID_ABI, functionName: "hasJoined",
              args: [BigInt(rId), address],
            }).then(j => j ? rId : null).catch(() => null)
          )
        );
        const playedRounds = joined.filter(Boolean);
        // Fetch details for rounds user played
        const details = await Promise.all(
          playedRounds.map(async (rId) => {
            try {
              const [rd, myCell] = await Promise.all([
                publicClient.readContract({
                  address: GRID_ADDR, abi: GRID_ABI, functionName: "rounds", args: [BigInt(rId)],
                }),
                publicClient.readContract({
                  address: GRID_ADDR, abi: GRID_ABI, functionName: "playerCell", args: [BigInt(rId), address],
                }),
              ]);
              const isResolved = Number(rd[5]) === 1;
              const winCell = Number(rd[4]);
              const pot = rd[2];
              const cell = Number(myCell);
              // V3: winner from occupied cells only, compare raw cell index
              const won = isResolved && cell === winCell;
              let payout = 0n;
              if (won) {
                try {
                  const cellPlayers = await publicClient.readContract({
                    address: GRID_ADDR, abi: GRID_ABI, functionName: "getCellPlayers",
                    args: [BigInt(rId), winCell],
                  });
                  const winnersCount = cellPlayers.length || 1;
                  const prizePool = pot * 90n / 100n;
                  payout = prizePool / BigInt(winnersCount);
                } catch { payout = pot * 90n / 100n; }
              }
              return {
                roundId: rId,
                cell,
                won,
                resolved: isResolved,
                pot: pot.toString(),
                payout: payout.toString(),
                cost: "100000000000000", // 0.0001 ETH
              };
            } catch { return null; }
          })
        );
        for (const d of details) {
          if (d && results.length < count) results.push(d);
        }
        cursor -= batchSize;
      }
    } catch (e) { console.error("User history scan error:", e); }
    userHistoryCursor.current = Math.max(0, cursor);
    return results;
  };

  useEffect(() => {
    if (round > 1 && address && !userHistoryLoaded.current) {
      userHistoryLoaded.current = true;
      userHistoryCursor.current = round - 1;
      setUserHistoryLoading(true);
      scanUserHistory(round - 1, 10).then(results => {
        setUserHistory(results);
        setUserHistoryLoading(false);
      });
    }
  }, [round, address]);

  // Update user history when a new round starts (check if user played previous round)
  useEffect(() => {
    if (round > 1 && address && userHistoryLoaded.current) {
      const prevRound = round - 1;
      // Check if we already have this round
      if (userHistory.some(h => h.roundId === prevRound)) return;
      publicClient.readContract({
        address: GRID_ADDR, abi: GRID_ABI, functionName: "hasJoined",
        args: [BigInt(prevRound), address],
      }).then(async (joined) => {
        if (!joined) return;
        const entries = await scanUserHistory(prevRound, 1);
        if (entries.length > 0) {
          setUserHistory(prev => {
            const ids = new Set(prev.map(h => h.roundId));
            const newOnes = entries.filter(e => !ids.has(e.roundId));
            return [...newOnes, ...prev];
          });
        }
      }).catch(() => {});
    }
  }, [round]);

  // ─── Round Change — fetch previous round data, save to history, reset grid ───
  useEffect(() => {
    if (round > 0 && round !== lastRoundRef.current) {
      const prevRound = lastRoundRef.current;

      // Fetch previous round data from contract (don't rely on stale state)
      if (prevRound > 0) {
        publicClient.readContract({
          address: GRID_ADDR, abi: GRID_ABI, functionName: "rounds", args: [BigInt(prevRound)],
        }).then(rd => {
          const miners = Number(rd[3]);   // [3] = totalMiners
          const cell = Number(rd[4]);     // [4] = winningCell
          const pot = rd[2].toString();
          const isResolved = Number(rd[5]) === 1;
          if (miners > 0) {
            const result = {
              roundId: prevRound,
              cell,
              miners,
              pot,
              resolved: isResolved,
              txHash: resolverTxHash.current || null,
            };
            setLastResult(result);
            setRoundHistory(prev => {
              if (prev.some(r => r.roundId === prevRound)) return prev;
              return [result, ...prev];
            });
            if (isResolved && cell > 0) {
              addFeed(`🎯 Round ${prevRound} winner: Cell ${CELL_LABELS[cell] || cell}`);
              setMoneyFlow(true);
              setTimeout(() => setMoneyFlow(false), 2500);
            } else if (miners > 0 && !isResolved) {
              addFeed(`⚠ Round ${prevRound} had ${miners} miner(s) but wasn't resolved`);
            }
            setHistoryPage(0);
          }
          resolverTxHash.current = null;
        }).catch(e => console.error("Failed to fetch prev round:", e));
      }

      // Flash grid on reset
      setGridFlash(true);
      setTimeout(() => setGridFlash(false), 600);
      addFeed(`◆ Round ${round} started`);
      lastRoundRef.current = round;
      setSelectedCell(null);
      setPlayerCell(-1);
      setClaimedCells(new Set());
      setCellCounts(new Array(TOTAL_CELLS).fill(0));
      setWinningCell(-1);
      setResolved(false);
      resolvedRef.current = false;
    }
  }, [round]);

  // ─── Winner detected — trigger animation + update history entry ───
  useEffect(() => {
    if (resolved && winningCell >= 0 && round > 0) {
      const result = {
        roundId: round,
        cell: winningCell,
        miners: activeMiners,
        pot: potSize,
        resolved: true,
        txHash: resolverTxHash.current || null,
      };
      setLastResult(result);
      setMoneyFlow(true);
      setTimeout(() => setMoneyFlow(false), 2500);
      // Upsert: update existing entry or prepend new one
      setRoundHistory(prev => {
        const idx = prev.findIndex(r => r.roundId === round);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = result;
          return updated;
        }
        return [result, ...prev];
      });
      setHistoryPage(0);
    }
  }, [resolved, winningCell]);

  // ─── Claim Cell (via Privy embedded wallet) ───
  const claimCell = async (cellIndex) => {
    if (!wallet || claiming) return;
    setClaiming(true);
    setError(null);

    try {
      // Switch the embedded wallet to MegaETH
      await wallet.switchChain(4326);

      // Get the EIP-1193 provider from Privy
      const provider = await wallet.getEthereumProvider();

      // Create a viem wallet client from the Privy provider
      const walletClient = createWalletClient({
        account: address,
        chain: megaethChain,
        transport: custom(provider),
      });

      // Encode the joinRound call
      const data = encodeFunctionData({
        abi: GRID_ABI,
        functionName: "joinRound",
        args: [cellIndex],
      });

      // Send tx with explicit gas — no MetaMask estimation needed
      const hash = await walletClient.sendTransaction({
        to: GRID_ADDR,
        data,
        value: parseEther(CELL_COST),
        gas: 300000n,
      });

      addFeed(`⛏ Claiming cell ${CELL_LABELS[cellIndex]}...`);
      await publicClient.waitForTransactionReceipt({ hash });
      addFeed(`✓ Cell ${CELL_LABELS[cellIndex]} claimed!`);
      setPlayerCell(cellIndex);
      setSelectedCell(null);
      pollState();
    } catch (e) {
      const msg = e.shortMessage || e.message || "Transaction failed";
      setError(msg);
      addFeed(`✗ Failed: ${msg.slice(0, 80)}`);
    }
    setClaiming(false);
  };

  const addFeed = (msg) => {
    setFeed((prev) => [{ msg, time: Date.now() }, ...prev].slice(0, 20));
  };

  // ─── Copy Wallet Address ───
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ─── Withdraw ETH ───
  const withdrawETH = async () => {
    if (!wallet || !withdrawAddr || !withdrawAmt || withdrawing) return;
    setWithdrawing(true);
    setError(null);
    try {
      await wallet.switchChain(4326);
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: address,
        chain: megaethChain,
        transport: custom(provider),
      });
      const hash = await walletClient.sendTransaction({
        to: withdrawAddr,
        value: parseEther(withdrawAmt),
        gas: 21000n,
      });
      addFeed(`↗ Withdrawing ${withdrawAmt} ETH...`);
      await publicClient.waitForTransactionReceipt({ hash });
      addFeed(`✓ Withdrawn ${withdrawAmt} ETH`);
      setWithdrawAddr("");
      setWithdrawAmt("");
      setShowWithdraw(false);
      pollState();
    } catch (e) {
      const msg = e.shortMessage || e.message || "Withdraw failed";
      setError(msg);
      addFeed(`✗ Withdraw failed: ${msg.slice(0, 80)}`);
    }
    setWithdrawing(false);
  };

  // ─── Derived UI State ───
  const actualDuration = (roundEnd > 0 && roundStart > 0) ? (roundEnd - roundStart) : ROUND_DURATION;
  const timerProgress = actualDuration > 0 ? smoothTime / actualDuration : 0;
  const timerColor = smoothTime > 10 ? "#ff8800" : smoothTime > 5 ? "#ffaa00" : "#ff3355";

  const getStatus = () => {
    if (!ready) return "INITIALIZING...";
    if (!authenticated) return "LOGIN TO PLAY";
    if (resolved) return `ROUND ${round} RESOLVED`;
    if (smoothTime <= 0 && round > 0) return `RESOLVING ROUND ${round}...`;
    if (smoothTime <= 0) return "WAITING...";
    return `ROUND ${round} ACTIVE`;
  };

  const getCellState = (idx) => {
    if (resolved && winningCell === idx) return "winner";
    if (playerCell === idx) return "yours";
    if (claimedCells.has(idx)) return "claimed";
    return "empty";
  };

  const canClaim = (idx) => {
    // V3: multiple players per cell — only restriction is one entry per player per round
    return !resolved && smoothTime > 0 && authenticated && playerCell < 0;
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={S.root}>
      {/* Scan line */}
      <div style={{
        ...S.scanOverlay,
        background: `linear-gradient(180deg,
          transparent ${scanLine - 2}%,
          rgba(255,136,0,0.12) ${scanLine - 1}%,
          rgba(255,136,0,0.35) ${scanLine}%,
          rgba(255,136,0,0.12) ${scanLine + 1}%,
          transparent ${scanLine + 2}%)`,
      }} />
      <div style={S.crtLines} />

      {/* ─── HEADER ─── */}
      <header style={S.header}>
        <div style={S.hLeft}>
          <span style={S.dot} />
          <span style={S.logo}>MEGA</span>
          <span style={S.logoSub}>ORE</span>
          <span style={S.badge}>MAINNET</span>
          <a href="/how-to-play" style={{ ...S.badge, textDecoration: "none", cursor: "pointer", background: "rgba(255,136,0,0.06)", border: "1px solid rgba(255,136,0,0.15)" }}>? HOW TO PLAY</a>
        </div>
        <div style={S.hRight}>
          <span style={S.hStat} className="mega-header-stat">
            RND <b style={{ color: "#e0e8f0" }}>#{round}</b>
          </span>
          {authenticated && (
            <>
              <span style={S.hStat} className="mega-header-stat">
                ● {fmt(oreBalance, 2)} <b style={{ color: "#ff6633" }}>ORE</b>
              </span>
              <span style={S.hStat} className="mega-header-stat">
                ◆ {fmt(ethBalance, 4)} <b style={{ color: "#ff8800" }}>ETH</b>
              </span>
            </>
          )}
          {!authenticated ? (
            <button style={S.loginBtn} onClick={login}>⚡ LOGIN</button>
          ) : (
            <button style={S.loginBtn} onClick={logout}>
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "LOGOUT"}
            </button>
          )}
          <button style={S.menuBtn} className="mega-menu-btn" onClick={() => setMobileMenu(!mobileMenu)}>☰</button>
        </div>
      </header>

      {/* ─── MAIN ─── */}
      <div style={S.main} className="mega-main">

        {/* ─── GRID AREA ─── */}
        <div style={S.gridArea} className="mega-grid-area">
          {/* Timer */}
          <div style={S.timerWrap}>
            <div style={S.timerBarBg}>
              <div style={{
                ...S.timerBarFill,
                width: `${timerProgress * 100}%`,
                backgroundColor: timerColor,
                boxShadow: `0 0 20px ${timerColor}66`,
              }} />
            </div>
            <div style={{ minWidth: 70, textAlign: "right" }}>
              <span style={{ ...S.timerNum, color: timerColor }}>
                {Math.floor(smoothTime)}
                <span style={S.timerMs}>.{Math.floor((smoothTime % 1) * 10)}</span>s
              </span>
            </div>
          </div>

          {/* Grid */}
          <div style={S.gridOuter}>
            <div style={S.cornerTL} /><div style={S.cornerTR} />
            <div style={S.cornerBL} /><div style={S.cornerBR} />

            {/* Grid flash on new round */}
            {gridFlash && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 8, zIndex: 15, pointerEvents: "none",
                animation: "gridResetFlash 0.6s ease-out forwards",
              }} />
            )}

            <div style={S.grid}>
              {CELL_LABELS.map((label, idx) => {
                const state = getCellState(idx);
                const isSelected = selectedCell === idx;
                const isWinnerCell = resolved && winningCell === idx;
                return (
                  <button
                    key={idx}
                    style={{
                      ...S.cell,
                      ...(state === "winner" ? S.cellWinner : {}),
                      ...(state === "yours" ? S.cellYours : {}),
                      ...(state === "claimed" ? S.cellClaimed : {}),
                      ...(isSelected ? S.cellSelected : {}),
                      ...(hoveredCell === idx && state === "empty" ? {
                        transform: "translateY(-3px) scale(1.03)",
                        boxShadow: "0 6px 16px rgba(255,136,0,0.15)",
                        borderColor: "rgba(255,136,0,0.35)",
                        background: "rgba(255,136,0,0.06)",
                      } : {}),
                      transition: "all 0.15s ease",
                      animationDelay: isWinnerCell ? "0s" : `${Math.floor(idx / GRID_SIZE) * 0.08}s`,
                    }}
                    onMouseEnter={() => setHoveredCell(idx)}
                    onMouseLeave={() => setHoveredCell(-1)}
                    onClick={() => {
                      if (!canClaim(idx)) return;
                      const now = Date.now();
                      const last = lastTapRef.current;
                      if (last.cell === idx && now - last.time < 400 && !claiming) {
                        // Double-tap/click — mine directly
                        claimCell(idx);
                        lastTapRef.current = { cell: -1, time: 0 };
                      } else {
                        // First tap — select
                        setSelectedCell(idx);
                        lastTapRef.current = { cell: idx, time: now };
                      }
                    }}
                    onDoubleClick={() => { if (canClaim(idx) && !claiming) claimCell(idx); }}
                  >
                    <span style={S.cellLabel}>{label}</span>
                    {state === "winner" && <span style={{ ...S.cellIcon, animation: "winnerPop 0.6s ease-out" }}>🎯</span>}
                    {state === "yours" && <span style={S.cellIcon}>⛏</span>}
                    {state === "claimed" && state !== "yours" && <span style={S.cellIcon}>{cellCounts[idx] > 1 ? `${cellCounts[idx]}×` : "●"}</span>}
                    {state === "empty" && <span style={{ fontSize: 9, opacity: 0.3 }}></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div style={S.statusBar}>
            <span style={{ fontWeight: 600 }}>{getStatus()}</span>
            <span style={{ color: "#7a8b9e" }}>{activeMiners} MINERS</span>
          </div>

          {/* Miner dots */}
          <div style={S.dots}>
            {Array.from({ length: TOTAL_CELLS }).map((_, i) => (
              <div key={i} style={{
                ...S.progressDot,
                backgroundColor: i < activeMiners ? "#ff8800" : "rgba(255,255,255,0.08)",
              }} />
            ))}
          </div>

          {/* Claim button — below grid */}
          {selectedCell !== null && !claiming && authenticated && (
            <button style={{ ...S.claimBtn, maxWidth: 520, marginTop: 12 }} onClick={() => claimCell(selectedCell)}>
              ⛏ CLAIM CELL {CELL_LABELS[selectedCell]} — {CELL_COST} ETH
            </button>
          )}
          {claiming && (
            <div style={{ ...S.claimingBar, maxWidth: 520, marginTop: 12 }}><div style={S.claimingDot} />CONFIRMING TX...</div>
          )}

          {/* ─── ROUND HISTORY TABLE (paginated) ─── */}
          {(() => {
            const totalPages = Math.ceil(roundHistory.length / HISTORY_PAGE_SIZE) || 1;
            const pageStart = historyPage * HISTORY_PAGE_SIZE;
            const pageRows = roundHistory.slice(pageStart, pageStart + HISTORY_PAGE_SIZE);
            const hasOlder = roundHistory.length > 0 && (historyPage < totalPages - 1 || !historyFullyLoaded);
            const hasNewer = historyPage > 0;
            return (
            <div style={{
              width: "100%", maxWidth: 520, marginTop: 14,
              borderRadius: 10,
              border: "1px solid rgba(255,136,0,0.2)",
              background: "rgba(255,136,0,0.03)",
              overflow: "hidden",
              animation: "winnerBannerIn 0.5s ease-out",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: "1px solid rgba(255,136,0,0.1)",
                background: "rgba(255,136,0,0.04)",
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#8a9bae" }}>ROUND HISTORY</span>
                <span style={{ fontSize: 10, color: "#5a6a7e", letterSpacing: 1 }}>
                  {historyLoading ? "SCANNING..." : `${roundHistory.length} ROUNDS${historyFullyLoaded ? "" : "+"} · PAGE ${historyPage + 1}`}
                </span>
              </div>
              {/* Column headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "60px 55px 55px 75px 1fr",
                padding: "8px 16px 4px", gap: 4,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <span style={{ fontSize: 9, color: "#4a5a6e", letterSpacing: 1.5, fontWeight: 700 }}>ROUND</span>
                <span style={{ fontSize: 9, color: "#4a5a6e", letterSpacing: 1.5, fontWeight: 700 }}>WINNER</span>
                <span style={{ fontSize: 9, color: "#4a5a6e", letterSpacing: 1.5, fontWeight: 700 }}>MINERS</span>
                <span style={{ fontSize: 9, color: "#4a5a6e", letterSpacing: 1.5, fontWeight: 700 }}>POT</span>
                <span style={{ fontSize: 9, color: "#4a5a6e", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>TX</span>
              </div>
              {/* Rows */}
              <div>
                {pageRows.length === 0 && (
                  <div style={{ padding: "20px 16px", textAlign: "center", color: "#5a6a7e", fontSize: 11, letterSpacing: 1 }}>
                    {historyLoading ? "⟐ SCANNING ROUNDS..." : "NO ROUNDS WITH MINERS FOUND"}
                  </div>
                )}
                {pageRows.map((r, i) => {
                  const globalIdx = pageStart + i;
                  const isLatest = globalIdx === 0 && moneyFlow;
                  return (
                    <div key={r.roundId} style={{
                      display: "grid", gridTemplateColumns: "60px 55px 55px 75px 1fr",
                      padding: "7px 16px", gap: 4,
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      background: isLatest ? "rgba(255,200,0,0.06)" : "transparent",
                      transition: "background 0.5s ease",
                      animation: globalIdx === 0 ? "winnerBannerIn 0.4s ease-out" : "none",
                    }}>
                      <span style={{
                        fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600,
                        color: isLatest ? "#ffc800" : "#d0dce8",
                      }}>#{r.roundId}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: r.resolved === false ? "#ff6666" : "#ffc800", letterSpacing: 0.5,
                      }}>
                        {r.resolved === false ? "⏳" : (CELL_LABELS[r.cell] || "?")} {globalIdx === 0 && r.resolved !== false ? "🎯" : ""}
                      </span>
                      <span style={{
                        fontFamily: "'Orbitron', sans-serif", fontSize: 11,
                        color: "#c8d6e5",
                      }}>{r.miners}</span>
                      <span style={{
                        fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600,
                        color: isLatest ? "#ffc800" : "#ff8800",
                        animation: isLatest ? "pulse 1s ease-in-out infinite" : "none",
                      }}>{fmt(r.pot)}</span>
                      <span style={{ textAlign: "right" }}>
                        {r.txHash ? (
                          <a
                            href={`https://mega.etherscan.io/tx/${r.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 10, color: "#ff8800", textDecoration: "none", fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {r.txHash.slice(0, 6)}…{r.txHash.slice(-4)} ↗
                          </a>
                        ) : (
                          <a
                            href={`https://mega.etherscan.io/address/${GRID_ADDR}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 10, color: "#5a6a7e", textDecoration: "none" }}
                          >
                            Explorer ↗
                          </a>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Pagination */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 16px",
                borderTop: "1px solid rgba(255,136,0,0.1)",
                background: "rgba(255,136,0,0.02)",
              }}>
                <button
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={!hasNewer}
                  style={{
                    background: hasNewer ? "rgba(255,136,0,0.12)" : "transparent",
                    border: hasNewer ? "1px solid rgba(255,136,0,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    color: hasNewer ? "#ff8800" : "#3a4a5e",
                    padding: "4px 14px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    letterSpacing: 1.5, cursor: hasNewer ? "pointer" : "default",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >◀ NEWER</button>
                <span style={{ fontSize: 10, color: "#5a6a7e", letterSpacing: 1 }}>
                  {pageStart + 1}–{Math.min(pageStart + HISTORY_PAGE_SIZE, roundHistory.length)} of {roundHistory.length}{historyFullyLoaded ? "" : "+"}
                </span>
                <button
                  onClick={() => {
                    const nextPage = historyPage + 1;
                    const nextStart = nextPage * HISTORY_PAGE_SIZE;
                    // If we need more data, fetch it
                    if (nextStart >= roundHistory.length - HISTORY_PAGE_SIZE && !historyFullyLoaded) {
                      loadOlderHistory();
                    }
                    setHistoryPage(nextPage);
                  }}
                  disabled={!hasOlder || historyLoading}
                  style={{
                    background: hasOlder ? "rgba(255,136,0,0.12)" : "transparent",
                    border: hasOlder ? "1px solid rgba(255,136,0,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    color: hasOlder ? "#ff8800" : "#3a4a5e",
                    padding: "4px 14px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    letterSpacing: 1.5, cursor: hasOlder ? "pointer" : "default",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >{historyLoading ? "LOADING..." : "OLDER ▶"}</button>
              </div>
            </div>
            );
          })()}
        </div>

        {/* ─── SIDEBAR ─── */}
        <div style={S.sidebar} className={`mega-sidebar ${mobileMenu ? "open" : ""}`}>
          <button style={S.closeBtn} className="mega-close-sidebar" onClick={() => setMobileMenu(false)}>✕</button>

          {/* Login prompt */}
          {!authenticated && (
            <div style={S.loginPrompt}>
              <div style={S.loginPromptTitle}>⚡ ENTER THE GRID</div>
              <div style={S.loginPromptText}>Login with email or Google to get an instant wallet and start mining.</div>
              <button style={S.claimBtn} onClick={login}>LOGIN TO PLAY</button>
            </div>
          )}

          {/* Sector Analysis */}
          <Panel title="SECTOR ANALYSIS" live>
            <Row label="POT SIZE" value={`${fmt(potSize)} ETH`} />
            <Row label="ACTIVE MINERS" value={activeMiners} />
            <Row label="ORE/ROUND" value="1.0 ORE" />
            <Row label="MOTHERLODE" value="0.4 ORE" />
            <Row label="CELL COST" value={`${CELL_COST} ETH`} />
          </Panel>

          {/* Unit Status */}
          {authenticated && (
            <Panel title="UNIT STATUS">
              <Row label="YOUR CELL" value={playerCell >= 0 ? CELL_LABELS[playerCell] : "—"} hl />
              <Row label="ORE BAL" value={fmt(oreBalance, 2)} />
              <Row label="ETH BAL" value={fmt(ethBalance)} />
              <div style={{ padding: "6px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: "#6a7b8e", letterSpacing: 0.5 }}>WALLET</span>
                  <button onClick={copyAddress} style={{ background: "none", border: "none", color: copied ? "#00cc88" : "#ff8800", cursor: "pointer", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    {copied ? "✓ COPIED" : "📋 COPY"}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "#8a9bae", wordBreak: "break-all", marginTop: 4, padding: "6px 8px", background: "rgba(255,136,0,0.04)", borderRadius: 4, border: "1px solid rgba(255,136,0,0.08)", lineHeight: 1.6 }}>
                  {address || "—"}
                </div>
                <div style={{ fontSize: 9, color: "#4a5a6e", marginTop: 4 }}>Send ETH on MegaETH to this address to fund your wallet</div>
              </div>
            </Panel>
          )}

          {/* Wallet Actions */}
          {authenticated && (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...S.claimBtn, fontSize: 10, padding: "10px 12px", flex: 1 }} onClick={() => setShowWithdraw(!showWithdraw)}>
                ↗ WITHDRAW
              </button>
              <button style={{ ...S.claimBtn, fontSize: 10, padding: "10px 12px", flex: 1, borderColor: "#6a7b8e", color: "#8a9bae", background: "rgba(255,255,255,0.03)" }} onClick={exportWallet}>
                🔑 EXPORT KEY
              </button>
            </div>
          )}

          {/* Withdraw Form */}
          {showWithdraw && authenticated && (
            <div style={{ border: "1px solid rgba(255,136,0,0.15)", borderRadius: 8, padding: 14, background: "rgba(255,136,0,0.03)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ff8800", letterSpacing: 1.5, marginBottom: 10 }}>WITHDRAW ETH</div>
              <input
                placeholder="Destination address (0x...)"
                value={withdrawAddr}
                onChange={(e) => setWithdrawAddr(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,136,0,0.15)", borderRadius: 4, color: "#c8d6e5", marginBottom: 8, outline: "none" }}
              />
              <input
                placeholder="Amount in ETH (e.g. 0.01)"
                value={withdrawAmt}
                onChange={(e) => setWithdrawAmt(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,136,0,0.15)", borderRadius: 4, color: "#c8d6e5", marginBottom: 10, outline: "none" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ ...S.claimBtn, fontSize: 10, padding: "10px 12px", flex: 1, opacity: withdrawing ? 0.6 : 1 }}
                  onClick={withdrawETH}
                  disabled={withdrawing}
                >
                  {withdrawing ? "SENDING..." : "SEND"}
                </button>
                <button
                  style={{ ...S.claimBtn, fontSize: 10, padding: "10px 12px", flex: 1, borderColor: "#4a5a6e", color: "#6a7b8e", background: "none" }}
                  onClick={() => setShowWithdraw(false)}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={S.errorBox} onClick={() => setError(null)}>⚠ {error.slice(0, 120)}</div>
          )}

          {/* User History */}
          {authenticated && (
            <Panel title="YOUR HISTORY">
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {userHistoryLoading && userHistory.length === 0 && (
                  <div style={{ fontSize: 11, color: "#4a5a6e", padding: "10px 0", fontStyle: "italic" }}>Scanning past rounds...</div>
                )}
                {!userHistoryLoading && userHistory.length === 0 && (
                  <div style={{ fontSize: 11, color: "#4a5a6e", padding: "10px 0", fontStyle: "italic" }}>No rounds played yet</div>
                )}
                {userHistory.map((h, i) => {
                  const net = h.won
                    ? BigInt(h.payout) - BigInt(h.cost)
                    : -BigInt(h.cost);
                  const netEth = Number(net) / 1e18;
                  const isWin = h.won;
                  return (
                    <div key={h.roundId} style={{
                      display: "grid", gridTemplateColumns: "38px 62px 28px 1fr", alignItems: "center",
                      padding: "6px 0", gap: 6,
                      borderBottom: i < userHistory.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                      fontSize: 11,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        padding: "2px 5px", borderRadius: 3, textAlign: "center",
                        background: isWin ? "rgba(0,204,136,0.12)" : "rgba(255,51,85,0.1)",
                        color: isWin ? "#00cc88" : "#ff3355",
                      }}>
                        {isWin ? "WON" : "LOST"}
                      </span>
                      <span style={{ color: "#6a7b8e" }}>R#{h.roundId}</span>
                      <span style={{ color: "#4a5a6e", fontSize: 10 }}>{CELL_LABELS[h.cell] || "?"}</span>
                      <span style={{
                        fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600,
                        color: isWin ? "#00cc88" : "#ff3355", textAlign: "right",
                      }}>
                        {isWin ? "+" : ""}{netEth.toFixed(4)} ETH
                      </span>
                    </div>
                  );
                })}
                {userHistory.length > 0 && userHistoryCursor.current > 0 && (
                  <button
                    onClick={() => {
                      setUserHistoryLoading(true);
                      scanUserHistory(userHistoryCursor.current, 10).then(results => {
                        setUserHistory(prev => {
                          const ids = new Set(prev.map(h => h.roundId));
                          return [...prev, ...results.filter(r => !ids.has(r.roundId))];
                        });
                        setUserHistoryLoading(false);
                      });
                    }}
                    style={{
                      width: "100%", padding: "8px 0", marginTop: 6,
                      background: "none", border: "1px solid rgba(255,136,0,0.15)",
                      borderRadius: 4, color: "#ff8800", fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                      letterSpacing: 1, cursor: "pointer",
                    }}
                  >
                    {userHistoryLoading ? "SCANNING..." : "LOAD MORE"}
                  </button>
                )}
              </div>
            </Panel>
          )}

          {/* Feed */}
          <Panel title="EXTRACTION FEED">
            <div style={S.feedBody}>
              {feed.length === 0 ? (
                <div style={S.feedEmpty}>Waiting for activity...</div>
              ) : (
                feed.map((f, i) => (
                  <div key={f.time + "-" + i} style={{ ...S.feedItem, opacity: 1 - i * 0.06 }}>
                    <span style={S.feedTime}>
                      {new Date(f.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span>{f.msg}</span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Debug: show poll errors visibly */}
      {round === 0 && (
        <div style={{
          width: "100%", maxWidth: 900, padding: "10px 16px", margin: "8px auto",
          background: "rgba(255,0,0,0.1)", border: "1px solid rgba(255,0,0,0.3)",
          borderRadius: 8, fontSize: 11, color: "#ff6666", fontFamily: "'JetBrains Mono', monospace",
        }}>
          <b>⚠ DEBUG:</b> Round = 0 (not loading). Polls: {pollCount.current}.
          {pollError.current && <span> Error: {pollError.current}</span>}
          {!pollError.current && <span> No error caught — poll may not have run yet. Check console.</span>}
          <br/>RPC: https://megaeth.drpc.org | Contract: {GRID_ADDR.slice(0,10)}...
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <footer style={S.footer}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.greenDot} />
          <span style={S.gridOnline}>GRID ONLINE</span>
        </span>
        <span style={{ fontSize: 11, color: "#4a5a6e", letterSpacing: 1 }}>MEGAETH ◆ CHAIN 4326</span>
      </footer>

      {/* ─── CSS ─── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; padding: 0; background: #0a0c0f; overflow-x: hidden; }
        @keyframes cellAppear { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 8px rgba(255,136,0,0.3), inset 0 0 8px rgba(255,136,0,0.1); }
          50% { box-shadow: 0 0 20px rgba(255,136,0,0.6), inset 0 0 15px rgba(255,136,0,0.2); }
        }
        @keyframes winnerGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(255,200,0,0.4), inset 0 0 10px rgba(255,200,0,0.1); }
          50% { box-shadow: 0 0 30px rgba(255,200,0,0.8), inset 0 0 20px rgba(255,200,0,0.3); }
        }
        @keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes moneyFlowBg {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes coinFlow {
          0% { opacity: 0; transform: translateX(-8px) scale(0.5); }
          40% { opacity: 1; transform: translateX(0) scale(1); }
          100% { opacity: 0; transform: translateX(8px) scale(0.5); }
        }
        @keyframes winnerPop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes gridResetFlash {
          0% { background: rgba(255,136,0,0.25); }
          100% { background: transparent; }
        }
        @keyframes particleFlow {
          0% { left: -5%; opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.8; }
          100% { left: 105%; opacity: 0; }
        }
        @keyframes winnerBannerIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanGlow {
          0% { text-shadow: 0 0 4px #ff8800; }
          50% { text-shadow: 0 0 12px #ff8800, 0 0 24px #ff880044; }
          100% { text-shadow: 0 0 4px #ff8800; }
        }
        @media (max-width: 768px) {
          .mega-main { flex-direction: column !important; }
          .mega-sidebar {
            position: fixed !important; top: 0 !important; right: -100% !important;
            width: 85vw !important; max-width: 380px !important; height: 100vh !important;
            z-index: 1000 !important; transition: right 0.3s ease !important;
            overflow-y: auto !important; background: #0d1117 !important;
            border-left: 1px solid rgba(255,136,0,0.15) !important;
          }
          .mega-sidebar.open { right: 0 !important; }
          .mega-grid-area { padding: 8px !important; }
          .mega-header-stat { display: none !important; }
          .mega-menu-btn { display: flex !important; }
          .mega-close-sidebar { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mega-menu-btn { display: none !important; }
          .mega-close-sidebar { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════
function Panel({ title, live, children }) {
  return (
    <div style={S.panel}>
      <div style={S.panelHead}>
        <span>{title}</span>
        {live && <span style={S.liveTag}>● LIVE</span>}
      </div>
      <div style={{ padding: "8px 14px" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, hl }) {
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <span style={{ ...S.rowValue, ...(hl ? { color: "#ff8800" } : {}) }}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const S = {
  root: {
    fontFamily: "'JetBrains Mono', monospace",
    background: "radial-gradient(ellipse at 30% 20%, #0f1923 0%, #0a0c0f 50%, #080a0d 100%)",
    color: "#c8d6e5", minHeight: "100vh",
    display: "flex", flexDirection: "column",
    position: "relative", overflow: "hidden",
  },
  scanOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 2, transition: "background 0.04s linear",
  },
  crtLines: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 1,
    background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", borderBottom: "1px solid rgba(255,136,0,0.12)",
    background: "rgba(10,12,15,0.95)", zIndex: 10, position: "relative",
    flexWrap: "wrap", gap: 8,
  },
  hLeft: { display: "flex", alignItems: "center", gap: 8 },
  hRight: { display: "flex", alignItems: "center", gap: 16 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#ff6633", boxShadow: "0 0 8px #ff663388" },
  logo: { fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 18, color: "#ff6633", letterSpacing: 2 },
  logoSub: { fontFamily: "'Orbitron', sans-serif", fontWeight: 500, fontSize: 18, color: "#e0e8f0", letterSpacing: 2 },
  badge: { fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(255,136,0,0.12)", color: "#ff8800", letterSpacing: 1.5, fontWeight: 600 },
  hStat: { fontSize: 12, color: "#7a8b9e", letterSpacing: 0.5 },
  loginBtn: {
    fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700,
    padding: "8px 16px", borderRadius: 6,
    border: "1px solid #ff8800",
    background: "linear-gradient(135deg, rgba(255,136,0,0.15), rgba(255,136,0,0.05))",
    color: "#ff8800", cursor: "pointer", letterSpacing: 1.5,
  },
  menuBtn: { fontSize: 20, background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#c8d6e5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" },
  main: { display: "flex", flex: 1, gap: 0, position: "relative", zIndex: 5 },
  gridArea: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 24px", minHeight: 0 },
  timerWrap: { width: "100%", maxWidth: 520, display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  timerBarBg: { flex: 1, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.08)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" },
  timerBarFill: { height: "100%", borderRadius: 6 },
  timerNum: { fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 700, transition: "color 0.5s ease" },
  timerMs: { fontSize: 14, opacity: 0.7 },
  gridOuter: { position: "relative", width: "100%", maxWidth: 520, padding: 12 },
  cornerTL: { position: "absolute", top: 0, left: 0, width: 20, height: 20, borderLeft: "2px solid rgba(255,136,0,0.4)", borderTop: "2px solid rgba(255,136,0,0.4)" },
  cornerTR: { position: "absolute", top: 0, right: 0, width: 20, height: 20, borderRight: "2px solid rgba(255,136,0,0.4)", borderTop: "2px solid rgba(255,136,0,0.4)" },
  cornerBL: { position: "absolute", bottom: 0, left: 0, width: 20, height: 20, borderLeft: "2px solid rgba(255,136,0,0.4)", borderBottom: "2px solid rgba(255,136,0,0.4)" },
  cornerBR: { position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRight: "2px solid rgba(255,136,0,0.4)", borderBottom: "2px solid rgba(255,136,0,0.4)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, width: "100%" },
  cell: {
    fontFamily: "'JetBrains Mono', monospace", position: "relative",
    aspectRatio: "1", minHeight: 64,
    border: "1px solid rgba(255,136,0,0.08)", borderRadius: 6,
    background: "rgba(255,136,0,0.02)", color: "#5a7a6e",
    cursor: "pointer", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 2,
    fontSize: 11, fontWeight: 600, transition: "all 0.15s ease",
    animation: "cellAppear 0.4s ease both",
    touchAction: "manipulation",
  },
  cellClaimed: { background: "rgba(255,102,51,0.08)", borderColor: "rgba(255,102,51,0.3)", color: "#ff6633", cursor: "default" },
  cellYours: { background: "rgba(255,136,0,0.1)", borderColor: "rgba(255,136,0,0.5)", color: "#ff8800", animation: "glow 2s ease-in-out infinite" },
  cellWinner: { background: "rgba(255,200,0,0.15)", borderColor: "rgba(255,200,0,0.6)", color: "#ffc800", boxShadow: "0 0 20px rgba(255,200,0,0.4), inset 0 0 12px rgba(255,200,0,0.15)", animation: "winnerGlow 1.5s ease-in-out infinite" },
  cellSelected: { background: "rgba(0,180,255,0.12)", borderColor: "rgba(0,180,255,0.5)", color: "#00b4ff", boxShadow: "0 0 15px rgba(0,180,255,0.3)" },
  cellLabel: { letterSpacing: 1 },
  cellIcon: { fontSize: 16 },
  statusBar: { display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 520, padding: "8px 12px", marginTop: 8, fontSize: 11, letterSpacing: 1.5, color: "#5a6a7e" },
  dots: { display: "flex", gap: 3, width: "100%", maxWidth: 520, padding: "0 12px" },
  progressDot: { flex: 1, height: 3, borderRadius: 2, transition: "background-color 0.5s ease" },
  sidebar: {
    width: 340, minWidth: 300, borderLeft: "1px solid rgba(255,136,0,0.08)",
    background: "rgba(10,14,20,0.98)", padding: 16,
    display: "flex", flexDirection: "column", gap: 12,
    overflowY: "auto", maxHeight: "calc(100vh - 100px)",
  },
  closeBtn: { alignSelf: "flex-end", background: "none", border: "none", color: "#7a8b9e", fontSize: 18, cursor: "pointer", padding: "4px 8px" },
  loginPrompt: { border: "1px solid rgba(255,136,0,0.2)", borderRadius: 8, background: "rgba(255,136,0,0.04)", padding: 16, textAlign: "center" },
  loginPromptTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "#ff8800", marginBottom: 8 },
  loginPromptText: { fontSize: 12, color: "#7a8b9e", marginBottom: 12, lineHeight: 1.5 },
  panel: { border: "1px solid rgba(255,136,0,0.1)", borderRadius: 8, background: "rgba(255,136,0,0.02)", overflow: "hidden" },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#8a9bae", borderBottom: "1px solid rgba(255,136,0,0.06)" },
  liveTag: { color: "#ff8800", fontSize: 10, letterSpacing: 1, animation: "scanGlow 2s ease-in-out infinite" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 12 },
  rowLabel: { color: "#6a7b8e", letterSpacing: 0.5 },
  rowValue: { fontWeight: 600, color: "#d0dce8", fontFamily: "'Orbitron', sans-serif", fontSize: 13 },
  claimBtn: {
    fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 700,
    padding: "14px 20px", borderRadius: 8,
    border: "1px solid #ff8800",
    background: "linear-gradient(135deg, rgba(255,136,0,0.15), rgba(255,136,0,0.05))",
    color: "#ff8800", cursor: "pointer", letterSpacing: 1,
    transition: "all 0.2s", textAlign: "center", width: "100%",
  },
  claimingBar: { display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderRadius: 8, border: "1px solid rgba(255,170,0,0.3)", background: "rgba(255,170,0,0.08)", color: "#ffaa00", fontSize: 12, fontWeight: 600, letterSpacing: 1 },
  claimingDot: { width: 8, height: 8, borderRadius: "50%", background: "#ffaa00", animation: "pulse 1s ease-in-out infinite" },
  errorBox: { padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,51,85,0.3)", background: "rgba(255,51,85,0.08)", color: "#ff3355", fontSize: 11, cursor: "pointer" },
  feedBody: { maxHeight: 200, overflowY: "auto" },
  feedEmpty: { color: "#3a4a5e", fontSize: 12, fontStyle: "italic", padding: "12px 0" },
  feedItem: { fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", gap: 8, animation: "slideIn 0.3s ease" },
  feedTime: { color: "#3a4a5e", fontSize: 10, flexShrink: 0 },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderTop: "1px solid rgba(255,136,0,0.08)", background: "rgba(10,12,15,0.95)", zIndex: 10, position: "relative" },
  greenDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#ff8800", boxShadow: "0 0 6px #ff880088" },
  gridOnline: { fontSize: 12, fontWeight: 700, color: "#ff8800", letterSpacing: 1.5, animation: "scanGlow 3s ease-in-out infinite" },
};
