(() => {
  "use strict";

  const video   = document.getElementById("capture");
  const canvas  = document.getElementById("overlay");
  const ctx     = canvas.getContext("2d");
  const startBtn = document.getElementById("startBtn");
  const stopBtn  = document.getElementById("stopBtn");
  const bestEl = document.getElementById("best");
  const evalEl = document.getElementById("eval");
  const depthEl = document.getElementById("depth");
  const fillEl = document.getElementById("fill");

  const engine = new Worker("engine.js");
  let stream = null, rafId = null, lastKey = "";
  let pendingArrow = null;
  let currentRect = null;

  engine.onmessage = (e) => {
    const { best, score } = e.data;
    if (!best) { bestEl.textContent = "—"; return; }
    bestEl.textContent = `${best.from} → ${best.to}`;
    const p = score / 100;
    evalEl.textContent = (p > 0 ? "+" : "") + p.toFixed(2);
    depthEl.textContent = "3";
    fillEl.style.width = Math.max(2, Math.min(98, 50 + score / 20)) + "%";
    pendingArrow = best;
  };

  function fit() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", fit); fit();

  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d", { willReadFrequently: true });

  function grabFrame() {
    if (!stream || video.videoWidth === 0) return null;
    scratch.width  = video.videoWidth;
    scratch.height = video.videoHeight;
    sctx.drawImage(video, 0, 0);
    return sctx.getImageData(0, 0, scratch.width, scratch.height);
  }

  // Pure vision board locator — finds the largest square region
  // with checkerboard-like luminance variance (chess.com app layout).
  function findBoard(img) {
    const { width: W, height: H, data } = img;
    const step = Math.max(4, Math.floor(Math.min(W, H) / 150));
    const gw = Math.floor(W / step), gh = Math.floor(H / step);
    const grid = new Float32Array(gw * gh);
    
    // Downsample luminance
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const px = ((y * step) * W + (x * step)) * 4;
        grid[y * gw + x] = 0.299*data[px] + 0.587*data[px+1] + 0.114*data[px+2];
      }
    }
    
    // Sliding window correlation for 8x8 alternating grid
    let bestScore = -1, bestRect = null;
    const maxSize = Math.min(gw, gh);
    const minSize = Math.floor(maxSize * 0.3);
    
    for (let size = maxSize; size >= minSize; size -= Math.max(4, Math.floor(size * 0.05))) {
      for (let y = 0; y < gh - size; y += 4) {
        for (let x = 0; x < gw - size; x += 4) {
          let good = 0, total = 0;
          const cell = size / 8;
          // Sample 8x8 cells and check for alternating luminance
          for (let cy = 0; cy < 7; cy++) {
            for (let cx = 0; cx < 7; cx++) {
              const px1 = x + Math.floor((cx + 0.5) * cell), py1 = y + Math.floor((cy + 0.5) * cell);
              const px2 = x + Math.floor((cx + 1.5) * cell), py2 = y + Math.floor((cy + 0.5) * cell);
              const a = grid[py1 * gw + px1] || 0;
              const b = grid[py2 * gw + px2] || 0;
              total++;
              // Checkerboard means adjacent cells should have significant diff
              if (Math.abs(a - b) > 12) good++;
            }
          }
          const score = good / total;
          if (score > bestScore) { 
            bestScore = score; 
            bestRect = { left: x * step, top: y * step, size: size * step }; 
          }
        }
      }
    }
    
    if (bestScore < 0.45) return null;
    return bestRect;
  }

  // Pixel-density piece detection
  function readBoard(img, rect) {
    const { data, width: W } = img;
    const cell = rect.size / 8;
    const sample = (cx, cy) => {
      const px = Math.floor(cx), py = Math.floor(cy);
      const i = (py * W + px) * 4;
      return { r: data[i], g: data[i+1], b: data[i+2] };
    };
    
    // Learn the two base square colors from corners
    const cA = sample(rect.left + cell*0.5, rect.top + rect.size - cell*0.5);
    const cB = sample(rect.left + rect.size - cell*0.5, rect.top + rect.size - cell*0.5);
    const dist = (a,b) => Math.hypot(a.r-b.r, a.g-b.g, a.b-b.b);

    const map = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cx = rect.left + cell * (c + 0.5);
        const cy = rect.top  + cell * (r + 0.5);
        const p = sample(cx, cy);
        const dA = dist(p, cA), dB = dist(p, cB);
        const base = dA < dB ? cA : cB;
        const d = dist(p, base);
        
        if (d < 35) continue; // empty square
        
        // Piece presence: contrast against base square
        const lum = 0.299*p.r + 0.587*p.g + 0.114*p.b;
        const bl = 0.299*base.r + 0.587*base.g + 0.114*base.b;
        const isWhite = lum > bl + 15;
        
        const sq = "abcdefgh"[c] + (8 - r);
        // Placeholder piece typing (P/p) - exact classification would use ONNX
        map[sq] = isWhite ? "P" : "p";
      }
    }
    return map;
  }

  function paintArrow(rect, from, to) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!rect || !from || !to) return;
    
    const cell = rect.size / 8;
    const fx = "abcdefgh".indexOf(from[0]), fy = 8 - +from[1];
    const tx = "abcdefgh".indexOf(to[0]),   ty = 8 - +to[1];
    const ax = rect.left + cell * (fx + 0.5);
    const ay = rect.top  + cell * (fy + 0.5);
    const bx = rect.left + cell * (tx + 0.5);
    const by = rect.top  + cell * (ty + 0.5);
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;
    const tipX = bx - ux*14, tipY = by - uy*14;
    
    ctx.strokeStyle = "#4ade80";
    ctx.fillStyle = "#4ade80";
    ctx.lineWidth = Math.max(4, cell * 0.18);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    
    const head = cell * 0.55;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tipX - uy*head*0.5, tipY + ux*head*0.5);
    ctx.lineTo(tipX + uy*head*0.5, tipY - ux*head*0.5);
    ctx.closePath();
    ctx.fill();
  }

  function tick() {
    const img = grabFrame();
    if (!img) { rafId = requestAnimationFrame(tick); return; }
    
    // Throttle detection to save battery (every ~10 frames)
    if (!window._frameCounter) window._frameCounter = 0;
    window._frameCounter++;
    if (window._frameCounter % 10 !== 0 && currentRect) {
      if (pendingArrow) paintArrow(currentRect, pendingArrow.from, pendingArrow.to);
      rafId = requestAnimationFrame(tick); return;
    }

    const rect = findBoard(img);
    if (!rect) {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      currentRect = null;
      rafId = requestAnimationFrame(tick); return;
    }
    currentRect = rect;
    
    const map = readBoard(img, rect);
    const key = JSON.stringify(map);
    if (key !== lastKey) {
      lastKey = key;
      engine.postMessage({ map, side: "w", depth: 3 });
    }
    if (pendingArrow) paintArrow(rect, pendingArrow.from, pendingArrow.to);
    
    rafId = requestAnimationFrame(tick);
  }

  async function start() {
    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 10 },
          audio: false
        });
      } 
      else if (window.AndroidInterface && typeof window.AndroidInterface.startScreenCapture === "function") {
        stream = await new Promise((resolve, reject) => {
          window.AndroidInterface.startScreenCapture((streamId) => {
            navigator.mediaDevices.getUserMedia({
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: streamId
                }
              }
            }).then(resolve).catch(reject);
          }, reject);
        });
      }
      else {
        throw new Error("Screen share is blocked by this browser. Open in Chrome/Edge or use an Android wrapper.");
      }

      video.srcObject = stream;
      await video.play();
      
      startBtn.disabled = true;
      stopBtn.disabled = false;
      rafId = requestAnimationFrame(tick);
      
    } catch (err) {
      alert("share cancelled or blocked: " + err.message);
    }
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    lastKey = ""; pendingArrow = null; currentRect = null;
    bestEl.textContent = "—"; evalEl.textContent = "—"; depthEl.textContent = "—";
  }

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
})();