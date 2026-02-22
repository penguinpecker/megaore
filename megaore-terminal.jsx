import { useState, useEffect, useRef, useCallback } from "react";

const ROWS = ["A", "B", "C", "D", "E"];
const ROUND_TIME = 30;
const mockFeed = [
  { addr: "0x7a...4e2", amount: "+4.2 ORE", type: "win" },
  { addr: "0x3b...9a1", amount: "+1.1 ORE", type: "win" },
  { addr: "0x8c...2f4", amount: "Empty", type: "miss" },
  { addr: "0x1d...8e9", amount: "+8.8 ORE", type: "win" },
  { addr: "0xcc...01f", amount: "Empty", type: "miss" },
  { addr: "0x44...a92", amount: "+0.5 ORE", type: "win" },
];

// ─── THEME: EMBER ───
// Deep charcoal bg, molten orange accent, bright silver ore
const T = {
  bg: "#0c0908",
  surface: "#120f0d",
  border: "#221c18",
  accent: "#E8650A",
  accentSoft: "#BF5500",
  accentDim: "rgba(232,101,10,0.15)",
  ore: "#C0C0C8",
  oreSoft: "rgba(192,192,200,0.3)",
  text: "#E0D8D0",
  textSec: "#6B5E52",
  textMuted: "#2e2620",
  success: "#4ADE80",
  danger: "#EF4444",
  dangerSoft: "#B91C1C",
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

export default function MegaOREEmber() {
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [selectedCell, setSelectedCell] = useState(null);
  const [occupiedCells, setOccupiedCells] = useState(new Set([2, 7, 11, 14, 18, 22]));
  const [winnerCell, setWinnerCell] = useState(null);
  const [rewardFloat, setRewardFloat] = useState(null);
  const [roundId, setRoundId] = useState(8492);
  const [motherlode, setMotherlode] = useState(false);
  const [feed, setFeed] = useState(mockFeed);

  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0.1) {
          const winner = Math.floor(Math.random() * 25);
          setWinnerCell(winner);
          if (Math.random() < 0.05) setMotherlode(true);
          const reward = (Math.random() * 10 + 0.5).toFixed(1);
          setRewardFloat({ cell: winner, amount: `+${reward} ORE` });
          setFeed(prev => [{ addr: `0x${Math.random().toString(16).slice(2, 4)}...${Math.random().toString(16).slice(2, 5)}`, amount: `+${reward} ORE`, type: "win" }, ...prev.slice(0, 7)]);
          setTimeout(() => { setWinnerCell(null); setRewardFloat(null); setMotherlode(false); }, 1200);
          setTimeout(() => { setSelectedCell(null); setOccupiedCells(new Set(Array.from({ length: Math.floor(Math.random() * 8) + 2 }, () => Math.floor(Math.random() * 25)))); setRoundId(r => r + 1); }, 1500);
          return ROUND_TIME;
        }
        return t - 0.1;
      });
    }, 100);
    return () => clearInterval(iv);
  }, []);

  const handleCellClick = useCallback((idx) => { if (winnerCell !== null) return; setSelectedCell(idx); setOccupiedCells(prev => new Set([...prev, idx])); }, [winnerCell]);
  const progress = timeLeft / ROUND_TIME;
  const isUrgent = timeLeft < 5;
  const isCritical = timeLeft < 3;

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: "'Inter','Space Grotesk',system-ui,sans-serif", height: "100vh", width: "100vw", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
        @keyframes scanSweep { 0% { top: -2%; opacity: 0; } 5% { opacity: 0.35; } 95% { opacity: 0.35; } 100% { top: 102%; opacity: 0; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes flashWin { 0% { background: ${T.accent}; box-shadow: 0 0 25px ${T.accentDim}; } 30% { background: ${T.ore}; box-shadow: 0 0 20px ${T.oreSoft}; } 100% { background: #141210; box-shadow: inset 0 0 0 1px ${T.ore}; } }
        @keyframes floatUp { 0% { transform: translate(-50%,-50%); opacity: 1; } 100% { transform: translate(-50%,-120%); opacity: 0; } }
        @keyframes motherlodeFlash { 0% { opacity: 0.15; } 100% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <DustCanvas />
      {motherlode && <div style={{ position: "fixed", inset: 0, background: `radial-gradient(circle, ${T.accentDim}, transparent 70%)`, animation: "motherlodeFlash 1s ease-out forwards", zIndex: 50, pointerEvents: "none" }} />}

      {/* Warm ember glow from bottom */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "30%", background: `linear-gradient(to top, ${T.accent}06, transparent)`, pointerEvents: "none", zIndex: 0 }} />

      <header style={{ height: 48, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", borderBottom: `1px solid ${T.border}`, background: `${T.bg}dd`, backdropFilter: "blur(6px)", zIndex: 20, flexShrink: 0 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, background: T.accent, borderRadius: "50%", boxShadow: `0 0 10px ${T.accentDim}` }} />
          <span style={{ color: T.accent }}>MEGA</span><span style={{ color: T.textSec }}>ORE</span>
          <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 4, letterSpacing: 1.5 }}>EMBER_V1</span>
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: T.textSec }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span>RND</span><span style={{ color: T.text }}>#{roundId}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 5, height: 5, background: T.ore, borderRadius: "50%", boxShadow: `0 0 5px ${T.oreSoft}` }} /><span style={{ color: T.ore }}>1,240.50</span><span>ORE</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: T.text }}>0x84...2A</span><div style={{ width: 5, height: 5, background: T.success, borderRadius: "50%" }} /></div>
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
            <div style={{ position: "absolute", top: -20, right: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: isCritical ? T.danger : isUrgent ? T.dangerSoft : T.textSec, transition: "color 0.3s" }}>{timeLeft.toFixed(1)}s</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 78px)", gridTemplateRows: "repeat(5, 78px)", gap: 2, position: "relative" }}>
              <div style={{ position: "absolute", left: "-5%", width: "110%", height: 1, background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`, boxShadow: `0 0 6px ${T.accent}`, opacity: 0.25, pointerEvents: "none", zIndex: 10, animation: `scanSweep ${ROUND_TIME}s linear infinite` }} />
              {Array.from({ length: 25 }, (_, i) => {
                const row = ROWS[Math.floor(i / 5)]; const col = (i % 5) + 1;
                const isOccupied = occupiedCells.has(i); const isSelected = selectedCell === i; const isWinner = winnerCell === i;
                return (
                  <div key={i} onClick={() => handleCellClick(i)} style={{
                    position: "relative", background: isWinner ? undefined : isSelected ? "#18120c" : isOccupied ? `radial-gradient(circle at center, #16100a, ${T.surface})` : "#0e0c0a",
                    border: `1px solid ${isSelected ? `${T.accent}55` : isOccupied ? "#281e14" : "rgba(255,255,255,0.02)"}`,
                    cursor: winnerCell !== null ? "default" : "crosshair", transition: "all 0.2s", overflow: "hidden",
                    animation: isWinner ? "flashWin 0.8s ease-out forwards" : undefined, zIndex: isWinner ? 10 : isSelected ? 5 : 1,
                    boxShadow: isSelected ? `0 0 12px ${T.accentDim}, inset 0 0 8px ${T.accent}08` : isOccupied ? `inset 0 0 10px ${T.accent}04` : "none",
                  }}
                  onMouseEnter={e => { if (!isWinner) { e.currentTarget.style.background = "#1a1510"; e.currentTarget.style.borderColor = "#3a2e22"; }}}
                  onMouseLeave={e => { if (!isWinner && !isSelected) { e.currentTarget.style.background = isOccupied ? `radial-gradient(circle at center, #16100a, ${T.surface})` : "#0e0c0a"; e.currentTarget.style.borderColor = isOccupied ? "#281e14" : "rgba(255,255,255,0.02)"; }}}>
                    <span style={{ position: "absolute", top: 3, left: 4, fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: isSelected ? `${T.accent}44` : T.textMuted, pointerEvents: "none" }}>{row}{col}</span>
                    {isOccupied && !isWinner && <div style={{ position: "absolute", bottom: 4, right: 4, width: 3, height: 3, background: isSelected ? T.accent : `${T.accent}30`, borderRadius: "50%", transition: "all 0.3s" }} />}
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
              <span>ROUND {roundId} ACTIVE</span><span>{occupiedCells.size} MINERS</span>
            </div>
          </div>
        </div>
        <aside style={{ width: 300, background: T.surface, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: 20, gap: 24, flexShrink: 0, overflow: "hidden" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: T.textSec }}>Sector Analysis</span>
              <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: T.accent, animation: "pulse 2s ease infinite" }}>LIVE</span>
            </div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, padding: 12 }}>
              {[{ l: "POT SIZE", v: "0.25 ETH", c: T.text }, { l: "ACTIVE MINERS", v: `${occupiedCells.size}`, c: T.text }, { l: "ORE/ROUND", v: "1.0 ORE", c: T.ore }, { l: "MOTHERLODE", v: "42.8 ORE", c: T.ore }].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}><span style={{ color: T.textSec }}>{s.l}</span><span style={{ color: s.c }}>{s.v}</span></div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12 }}><span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: T.textSec }}>Unit Status</span></div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, padding: 12 }}>
              {[{ l: "YOUR CELL", v: selectedCell !== null ? `${ROWS[Math.floor(selectedCell / 5)]}${(selectedCell % 5) + 1}` : "—", c: selectedCell !== null ? T.accent : T.textMuted }, { l: "WINS TODAY", v: "12", c: T.text }, { l: "EARNED", v: "24.8 ORE", c: T.ore }, { l: "NFT BOOST", v: "x1.5", c: T.accentSoft }].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}><span style={{ color: T.textSec }}>{s.l}</span><span style={{ color: s.c }}>{s.v}</span></div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12 }}><span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: T.textSec }}>Extraction Feed</span></div>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {feed.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", background: item.type === "win" ? `${T.ore}08` : "rgba(255,255,255,0.01)", borderLeft: `2px solid ${item.type === "win" ? T.ore : "transparent"}`, borderRadius: 2, animation: i === 0 ? "fadeIn 0.3s ease" : undefined }}>
                  <span style={{ color: T.textSec }}>{item.addr}</span><span style={{ color: item.type === "win" ? T.ore : T.textMuted }}>{item.amount}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: T.success }}>
            <div style={{ width: 4, height: 4, background: T.success, borderRadius: "50%", boxShadow: `0 0 4px ${T.success}66` }} />GRID ONLINE // MEGAETH
          </div>
        </aside>
      </div>
    </div>
  );
}
