(() => {
  const FILES = "abcdefgh";
  const VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };
  const PST = {
    p: [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
         5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
         5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40,
        -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
        -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10,
        -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
        -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ],
    r: [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10,
        -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
        -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
        20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ]
  };
  const DIRS = {
    n:[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],
    b:[[1,1],[1,-1],[-1,1],[-1,-1]],
    r:[[1,0],[-1,0],[0,1],[0,-1]],
    q:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],
    k:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]
  };
  const toIdx = sq => (8 - +sq[1]) * 8 + FILES.indexOf(sq[0]);
  const toSq  = i  => FILES[i % 8] + (8 - Math.floor(i / 8));
  const inside = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  function boardFromMap(map) {
    const b = new Array(64).fill(null);
    for (const sq in map) b[toIdx(sq)] = map[sq];
    return b;
  }
  function evaluate(b) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue;
      const white = p === p.toUpperCase();
      const t = p.toLowerCase();
      const pst = PST[t][white ? i : 63 - i];
      s += white ? VAL[t] + pst : -(VAL[t] + pst);
    }
    return s;
  }
  function genMoves(b, side) {
    const out = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue;
      const white = p === p.toUpperCase();
      if ((white ? "w" : "b") !== side) continue;
      const t = p.toLowerCase();
      const r = Math.floor(i / 8), c = i % 8;
      const push = (nr, nc) => {
        if (!inside(nr, nc)) return false;
        const j = nr*8+nc, tp = b[j];
        if (tp && (tp === tp.toUpperCase()) === white) return false;
        out.push({ from: toSq(i), to: toSq(j), cap: !!tp });
        return !tp;
      };
      if (t === "n" || t === "k") {
        for (const [dr,dc] of DIRS[t]) push(r+dr, c+dc);
      } else {
        for (const [dr,dc] of DIRS[t]) {
          let nr = r+dr, nc = c+dc;
          while (inside(nr,nc)) { if (!push(nr,nc)) break; nr+=dr; nc+=dc; }
        }
      }
    }
    return out;
  }
  const apply = (b,m) => { const f=toIdx(m.from), t=toIdx(m.to), cap=b[t]; b[t]=b[f]; b[f]=null; return cap; };
  const undo  = (b,m,cap) => { const f=toIdx(m.from), t=toIdx(m.to); b[f]=b[t]; b[t]=cap; };
  function search(b, side, depth, alpha, beta) {
    if (depth === 0) return evaluate(b);
    const moves = genMoves(b, side);
    if (!moves.length) return evaluate(b);
    const max = side === "w";
    let best = max ? -1e9 : 1e9;
    for (const m of moves) {
      const cap = apply(b, m);
      const v = search(b, side === "w" ? "b" : "w", depth-1, alpha, beta);
      undo(b, m, cap);
      if (max) { if (v > best) best = v; alpha = Math.max(alpha, v); }
      else     { if (v < best) best = v; beta  = Math.min(beta,  v); }
      if (beta <= alpha) break;
    }
    return best;
  }
  self.onmessage = (e) => {
    const { map, side, depth } = e.data;
    const b = boardFromMap(map);
    const moves = genMoves(b, side);
    if (!moves.length) return self.postMessage({ best: null, score: evaluate(b) });
    const max = side === "w";
    let best = max ? -1e9 : 1e9, bestMove = moves[0];
    for (const m of moves) {
      const cap = apply(b, m);
      const v = search(b, side === "w" ? "b" : "w", depth-1, -1e9, 1e9);
      undo(b, m, cap);
      if (max ? v > best : v < best) { best = v; bestMove = m; }
    }
    self.postMessage({ best: bestMove, score: best, side });
  };
})();