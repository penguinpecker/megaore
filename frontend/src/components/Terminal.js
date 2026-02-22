"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWatchContractEvent, useBalance } from "wagmi";
import { formatEther, parseEther } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { CONTRACTS, GRID_ABI, ORE_ABI, STAKING_ABI } from "@/lib/contracts";

const ROWS = ["A", "B", "C", "D", "E"];

const T = {
  bg: "#0c0908", surface: "#120f0d", border: "#221c18",
  accent: "#E8650A", accentSoft: "#BF5500", accentDim: "rgba(232,101,10,0.15)",
  ore: "#C0C0C8", oreSoft: "rgba(192,192,200,0.3)",
  text: "#E0D8D0", textSec: "#6B5E52", textMuted: "#2e2620",
  success: "#4ADE80", danger: "#EF4444", dangerSoft: "#B91C1C",
  dust: "220,130,50",
};

function DustCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let w, h, particles = [], raf;
    const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener("resize", resize);
    class P {
      constructor() { this.reset(); this.y = Math.random() * h; }
      reset() { this.x = Math.random() * w; this.y = h + 10; this.vy = -0.15 - Math.random() * 0.25; this.vx = (Math.random() - 0.5) * 0.12; this.s = 0.5 + Math.random() * 1.2; this.a = 0.04 + Math.random() * 0.1; }
      update() { this.y += this.vy; this.x += this.vx; if (this.y < -10) this.reset(); }
      draw() { ctx.fillStyle = `rgba(${T.dust},${this.a})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.s, 0, Math.PI * 2); ctx.fill(); }
    }
    for (let i = 0; i < 20; i++) particles.push(new P());
    const loop = () => { ctx.clearRect(0, 0, w, h); particles.forEach(p => { p.update(); p.draw(); }); raf = requestAnimationFrame(loop); };
    loop(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, opacity: 0.7 }} />;
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 4)}...${addr.slice(-3)}`;
}

export default function MegaORETerminal() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { writeContractAsync } = useWriteContract();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const { data: roundData, refetch: refetchRound } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "getCurrentRound",
  });
  const { data: cellCounts, refetch: refetchCells } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "getCellCounts",
  });
  const { data: depositAmount } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "depositAmount",
  });
  const { data: motherlodePool } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "motherlodePool",
  });
  const { data: orePerRound } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "orePerRound",
  });
  const { data: oreBalance } = useReadContract({
    address: CONTRACTS.oreToken, abi: ORE_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: isStaker } = useReadContract({
    address: CONTRACTS.nftStaking, abi: STAKING_ABI, functionName: "isStaker",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: hasJoined, refetch: refetchJoined } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "hasJoined",
    args: roundData ? [roundData[0], address] : undefined,
    query: { enabled: !!address && !!roundData },
  });
  const { data: playerCell } = useReadContract({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "playerCell",
    args: roundData ? [roundData[0], address] : undefined,
    query: { enabled: !!address && !!roundData && !!hasJoined },
  });
  const { data: ethBalance } = useBalance({ address });

  const [timeLeft, setTimeLeft] = useState(30);
  const [winnerCell, setWinnerCell] = useState(null);
  const [rewardFloat, setRewardFloat] = useState(null);
  const [motherlode, setMotherlode] = useState(false);
  const [feed, setFeed] = useState([]);
  const [joining, setJoining] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState(null);

  const roundId = roundData ? Number(roundData[0]) : 0;
  const roundEnd = roundData ? Number(roundData[2]) : 0;
  const totalDeposits = roundData ? roundData[3] : 0n;
  const totalPlayers = roundData ? Number(roundData[4]) : 0;
  const roundDuration = roundData ? Number(roundData[2]) - Number(roundData[1]) : 30;

  const occupiedCells = new Set();
  if (cellCounts) {
    for (let i = 0; i < 25; i++) {
      if (Number(cellCounts[i]) > 0) occupiedCells.add(i);
    }
  }
  const myCell = hasJoined && playerCell !== undefined ? Number(playerCell) : null;

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, roundEnd - now));
    }, 100);
    return () => clearInterval(iv);
  }, [roundEnd]);

  useEffect(() => {
    const iv = setInterval(() => {
      refetchRound(); refetchCells();
      if (address) refetchJoined();
    }, 3000);
    return () => clearInterval(iv);
  }, [address, refetchRound, refetchCells, refetchJoined]);

  useWatchContractEvent({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, eventName: "RoundResolved",
    onLogs(logs) {
      const e = logs[0]?.args; if (!e) return;
      const cell = Number(e.winningCell);
      setWinnerCell(cell);
      const reward = formatEther(e.orePerWinner || 0n);
      setRewardFloat({ cell, amount: `+${Number(reward).toFixed(1)} ORE` });
      if (e.motherlodeTriggered) setMotherlode(true);
      setFeed(prev => [{ addr: `RND#${Number(e.roundId)}`, amount: e.winnersCount > 0 ? `+${Number(reward).toFixed(1)} ORE` : "No winner", type: e.winnersCount > 0 ? "win" : "miss" }, ...prev.slice(0, 9)]);
      setTimeout(() => { setWinnerCell(null); setRewardFloat(null); setMotherlode(false); }, 1500);
      setTimeout(() => { setSelectedPreview(null); refetchRound(); refetchCells(); if (address) refetchJoined(); }, 2000);
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.oreGrid, abi: GRID_ABI, eventName: "PlayerJoined",
    onLogs() { refetchCells(); refetchRound(); },
  });

  const handleCellClick = useCallback(async (idx) => {
    if (winnerCell !== null || joining) return;
    if (!isConnected) { open(); return; }
    if (hasJoined) { setSelectedPreview(idx); return; }
    setSelectedPreview(idx);
    try {
      setJoining(true);
      await writeContractAsync({
        address: CONTRACTS.oreGrid, abi: GRID_ABI, functionName: "joinRound",
        args: [idx], value: depositAmount || parseEther("0.01"),
      });
      refetchJoined(); refetchCells(); refetchRound();
    } catch (err) { console.error("Join failed:", err); }
    finally { setJoining(false); }
  }, [winnerCell, joining, isConnected, hasJoined, open, writeContractAsync, depositAmount, refetchJoined, refetchCells, refetchRound]);

  const progress = roundDuration > 0 ? timeLeft / roundDuration : 0;
  const isUrgent = timeLeft < 5;
  const isCritical = timeLeft < 3;
  const displayOre = oreBalance ? Number(formatEther(oreBalance)).toFixed(2) : "0.00";
  const displayPot = totalDeposits ? Number(formatEther(totalDeposits)).toFixed(4) : "0.0000";
  const displayMotherlode = motherlodePool ? Number(formatEther(motherlodePool)).toFixed(1) : "0.0";
  const displayOrePerRound = orePerRound ? Number(formatEther(orePerRound)).toFixed(1) : "1.0";

  if (!mounted) return <div style={{ background: T.bg, height: "100vh", width: "100vw" }} />;

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'Inter','Space Grotesk',system-ui,sans-serif", height: "100vh", width: "100vw", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
      <DustCanvas />
      {motherlode && <div style={{ position: "fixed", inset: 0, background: `radial-gradient(circle, ${T.accentDim}, transparent 70%)`, animation: "motherlodeFlash 1s ease-out forwards", zIndex: 50, pointerEvents: "none" }} />}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "30%", background: `linear-gradient(to top, ${T.accent}06, transparent)`, pointerEvents: "none", zIndex: 0 }} />

      <header style={{ height: 48, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", borderBottom: `1px solid ${T.border}`, background: `${T.bg}dd`, backdropFilter: "blur(6px)", zIndex: 20, flexShrink: 0 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, background: T.accent, borderRadius: "50%", boxShadow: `0 0 10px ${T.accentDim}` }} />
          <span style={{ color: T.accent }}>MEGA</span><span style={{ color: T.textSec }}>ORE</span>
          <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 4, letterSpacing: 1.5 }}>MAINNET</span>
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: T.textSec, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span>RND</span><span style={{ color: T.text }}>#{roundId}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, background: T.ore, borderRadius: "50%", boxShadow: `0 0 5px ${T.oreSoft}` }} />
            <span style={{ color: T.ore }}>{displayOre}</span><span>ORE</span>
          </div>
          {isConnected ? (
            <div onClick={() => open()} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <span style={{ color: T.text }}>{shortAddr(address)}</span>
              <div style={{ width: 5, height: 5, background: T.success, borderRadius: "50%" }} />
            </div>
          ) : (
            <button onClick={() => open()} style={{ background: T.accent, color: "#fff", border: "none", padding: "4px 10px", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: "pointer", letterSpacing: 1, fontWeight: 600 }}>CONNECT</button>
          )}
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", zIndex: 5 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", background: `radial-gradient(circle at center, ${T.surface} 0%, ${T.bg} 70%)` }}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: 0.12 }}>
            <div style={{ position: "absolute", width: 1, height: "200%", left: "18%", top: "-50%", background: T.border, transform: "rotate(45deg)" }} />
            <div style={{ position: "absolute", width: 1, height: "200%", right: "18%", top: "-50%", background: T.border, transform: "rotate(-45deg)" }} />
          </div>
          <div style={{ position: "relative", padding: 24 }}>
            {[{ top: -4, left: -4, borderWidth: "1px 0 0 1px" }, { top: -4, right: -4, borderWidth: "1px 1px 0 0" }, { bottom: -4, left: -4, borderWidth: "0 0 1px 1px" }, { bottom: -4, right: -4, borderWidth: "0 1px 1px 0" }].map((pos, i) => (
              <div key={i} style={{ position: "absolute", ...pos, width: 12, height: 12, borderColor: T.textSec, borderStyle: "solid" }} />
            ))}
            <div style={{ position: "absolute", top: -20, right: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: isCritical ? T.danger : isUrgent ? T.dangerSoft : T.textSec, transition: "color 0.3s" }}>{timeLeft.toFixed(0)}s</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 78px)", gridTemplateRows: "repeat(5, 78px)", gap: 2, position: "relative" }}>
              <div style={{ position: "absolute", left: "-5%", width: "110%", height: 1, background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`, boxShadow: `0 0 6px ${T.accent}`, opacity: 0.25, pointerEvents: "none", zIndex: 10, animation: `scanSweep ${roundDuration}s linear infinite` }} />
              {Array.from({ length: 25 }, (_, i) => {
                const row = ROWS[Math.floor(i / 5)]; const col = (i % 5) + 1;
                const isOccupied = occupiedCells.has(i);
                const isMine = myCell === i;
                const isPreview = selectedPreview === i && !hasJoined;
                const isWinner = winnerCell === i;
                const cellPlayerCount = cellCounts ? Number(cellCounts[i]) : 0;
                return (
                  <div key={i} onClick={() => handleCellClick(i)} style={{
                    position: "relative",
                    background: isWinner ? undefined : isMine ? "#18120c" : isPreview ? "#14100a" : isOccupied ? `radial-gradient(circle at center, #16100a, ${T.surface})` : "#0e0c0a",
                    border: `1px solid ${isMine ? `${T.accent}55` : isPreview ? `${T.accent}33` : isOccupied ? "#281e14" : "rgba(255,255,255,0.02)"}`,
                    cursor: winnerCell !== null || hasJoined ? "default" : "crosshair",
                    transition: "all 0.2s", overflow: "hidden",
                    animation: isWinner ? "flashWin 0.8s ease-out forwards" : undefined,
                    zIndex: isWinner ? 10 : isMine ? 5 : 1,
                    boxShadow: isMine ? `0 0 12px ${T.accentDim}, inset 0 0 8px ${T.accent}08` : isOccupied ? `inset 0 0 10px ${T.accent}04` : "none",
                    opacity: joining ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!isWinner && !isMine) { e.currentTarget.style.background = "#1a1510"; e.currentTarget.style.borderColor = "#3a2e22"; }}}
                  onMouseLeave={e => { if (!isWinner && !isMine) { e.currentTarget.style.background = isOccupied ? `radial-gradient(circle at center, #16100a, ${T.surface})` : "#0e0c0a"; e.currentTarget.style.borderColor = isOccupied ? "#281e14" : "rgba(255,255,255,0.02)"; }}}>
                    <span style={{ position: "absolute", top: 3, left: 4, fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: isMine ? `${T.accent}66` : T.textMuted, pointerEvents: "none" }}>{row}{col}</span>
                    {cellPlayerCount > 0 && !isWinner && <span style={{ position: "absolute", top: 3, right: 4, fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: T.textSec, pointerEvents: "none" }}>{cellPlayerCount}</span>}
                    {isOccupied && !isWinner && <div style={{ position: "absolute", bottom: 4, right: 4, width: 3, height: 3, background: isMine ? T.accent : `${T.accent}30`, borderRadius: "50%", transition: "all 0.3s" }} />}
                    {isWinner && <div style={{ position: "absolute", bottom: 4, right: 4, width: 4, height: 4, background: T.ore, borderRadius: "50%", boxShadow: `0 0 6px ${T.oreSoft}` }} />}
                    {rewardFloat && rewardFloat.cell === i && <div style={{ position: "absolute", left: "50%", top: "50%", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: T.ore, textShadow: `0 0 8px ${T.oreSoft}`, pointerEvents: "none", whiteSpace: "nowrap", animation: "floatUp 1s ease-out forwards", zIndex: 20 }}>{rewardFloat.amount}</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, width: "100%", height: 2, background: T.border, position: "relative", overflow: "hidden", borderRadius: 1 }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${progress * 100}%`, background: isCritical ? T.danger : isUrgent ? T.accent : T.text, boxShadow: isUrgent ? `0 0 8px ${isCritical ? T.danger : T.accent}` : "none", transition: "width 0.1s linear, background 0.3s", borderRadius: 1 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>
              <span>ROUND {roundId} {timeLeft > 0 ? "ACTIVE" : "RESOLVING"}</span>
              <span>{totalPlayers} MINERS</span>
            </div>

            {isConnected && !hasJoined && timeLeft > 0 && (
              <div style={{ marginTop: 12, textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: T.textSec, letterSpacing: 0.5 }}>
                {joining ? "CONFIRMING TX..." : `CLICK A CELL TO JOIN \u2014 ${depositAmount ? formatEther(depositAmount) : "0.01"} ETH`}
              </div>
            )}
            {isConnected && hasJoined && (
              <div style={{ marginTop: 12, textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: T.accent, letterSpacing: 0.5 }}>
                LOCKED IN \u2014 CELL {myCell !== null ? `${ROWS[Math.floor(myCell / 5)]}${(myCell % 5) + 1}` : "?"}
              </div>
            )}
          </div>
        </div>

        <aside style={{ width: 300, background: T.surface, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: 20, gap: 24, flexShrink: 0, overflow: "hidden" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: T.textSec }}>Sector Analysis</span>
              <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: T.accent, animation: "pulse 2s ease infinite" }}>LIVE</span>
            </div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, padding: 12 }}>
              {[{ l: "POT SIZE", v: `${displayPot} ETH`, c: T.text }, { l: "ACTIVE MINERS", v: `${totalPlayers}`, c: T.text }, { l: "ORE/ROUND", v: `${displayOrePerRound} ORE`, c: T.ore }, { l: "MOTHERLODE", v: `${displayMotherlode} ORE`, c: T.ore }].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}><span style={{ color: T.textSec }}>{s.l}</span><span style={{ color: s.c }}>{s.v}</span></div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12 }}><span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: T.textSec }}>Unit Status</span></div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, padding: 12 }}>
              {[{ l: "YOUR CELL", v: myCell !== null ? `${ROWS[Math.floor(myCell / 5)]}${(myCell % 5) + 1}` : "\u2014", c: myCell !== null ? T.accent : T.textMuted }, { l: "ORE BAL", v: displayOre, c: T.ore }, { l: "ETH BAL", v: ethBalance ? Number(formatEther(ethBalance.value)).toFixed(4) : "\u2014", c: T.text }, { l: "NFT BOOST", v: isStaker ? "x1.5" : "\u2014", c: isStaker ? T.accentSoft : T.textMuted }].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}><span style={{ color: T.textSec }}>{s.l}</span><span style={{ color: s.c }}>{s.v}</span></div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12 }}><span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: T.textSec }}>Extraction Feed</span></div>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {feed.length === 0 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: T.textMuted, padding: 8 }}>Waiting for rounds...</div>}
              {feed.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", background: item.type === "win" ? `${T.ore}08` : "rgba(255,255,255,0.01)", borderLeft: `2px solid ${item.type === "win" ? T.ore : "transparent"}`, borderRadius: 2, animation: i === 0 ? "fadeIn 0.3s ease" : undefined }}>
                  <span style={{ color: T.textSec }}>{item.addr}</span><span style={{ color: item.type === "win" ? T.ore : T.textMuted }}>{item.amount}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: T.success }}>
              <div style={{ width: 4, height: 4, background: T.success, borderRadius: "50%", boxShadow: `0 0 4px ${T.success}66` }} />GRID ONLINE
            </div>
            <a href={`https://megaeth.blockscout.com/address/${CONTRACTS.oreGrid}`} target="_blank" rel="noopener" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: T.textMuted, textDecoration: "none" }}>MEGAETH ↗</a>
          </div>
        </aside>
      </div>
    </div>
  );
}
