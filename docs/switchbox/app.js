// Page side of Switchbox: sizing, the frame loop, crisp text over the pixel
// frame, Web Audio, pointer and keys, and the save in localStorage. The game
// itself (rules, her behaviour, the software renderer, HUD and dialogs) runs
// in sbx.wasm, compiled from the original C++.
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const SAVE_KEY = params.has("script") || params.has("dev") ? "switchbox-dev-v2" : "switchbox-v2";
  const SAVE_PATH = "/save/switchbox-v2.txt";
  const view = document.getElementById("view");
  const ctx = view.getContext("2d");
  const nameInput = document.getElementById("name");
  const status = document.getElementById("status");
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");

  // ------------------------------------------------------------ text
  // Sizes are in points; a game pixel is two points, as on the Mac. Masks are
  // measured like the CoreText ones they replace: text extent plus one point
  // of margin each side, word wrapped to a width in points.
  const FAMILY = '"Comic Neue", "Chalkboard SE", "Comic Sans MS", cursive';
  const MEASURE = 4;  // measure at 4x for sub-point precision
  const mctx = document.createElement("canvas").getContext("2d");
  const layoutCache = new Map();
  const metricsCache = new Map();
  const font = (px, bold) => `${bold ? 700 : 400} ${px}px ${FAMILY}`;

  function metrics(size, bold) {
    const key = size + (bold ? "b" : "r");
    let m = metricsCache.get(key);
    if (!m) {
      mctx.font = font(size * MEASURE, bold);
      const t = mctx.measureText("Hgy");
      const asc = (t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent * 1.15) / MEASURE;
      const desc = (t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent * 1.3) / MEASURE;
      m = { asc, line: asc + desc, gap: size * 0.05 };
      metricsCache.set(key, m);
    }
    return m;
  }

  function layout(s, size, bold, wrap) {
    const key = `${bold ? 1 : 0}|${size}|${wrap}|${s}`;
    let l = layoutCache.get(key);
    if (l) return l;
    mctx.font = font(size * MEASURE, bold);
    const width = (t) => mctx.measureText(t).width / MEASURE;
    const lines = [];
    if (wrap > 0) {
      const tokens = s.split(/(\s+)/).filter((t) => t.length);
      let cur = "";
      for (const tok of tokens) {
        const next = cur + tok;
        if (!cur || width(next.trimEnd()) <= wrap) { cur = next; continue; }
        if (/^\s+$/.test(tok)) { lines.push(cur.trimEnd()); cur = ""; continue; }
        lines.push(cur.trimEnd());
        cur = tok;
        while (width(cur) > wrap && cur.length > 1) {  // a word longer than the line
          let n = cur.length - 1;
          while (n > 1 && width(cur.slice(0, n)) > wrap) n--;
          lines.push(cur.slice(0, n));
          cur = cur.slice(n);
        }
      }
      if (cur.trimEnd().length || !lines.length) lines.push(cur.trimEnd());
    } else {
      lines.push(s);
    }
    const m = metrics(size, bold);
    let w = 0;
    for (const line of lines) w = Math.max(w, width(line));
    const h = lines.length * m.line + (lines.length - 1) * m.gap;
    l = { lines, w: Math.max(1, Math.ceil(w) + 2), h: Math.max(1, Math.ceil(h) + 2), m };
    if (layoutCache.size > 2000) layoutCache.clear();
    layoutCache.set(key, l);
    return l;
  }

  const queued = [];
  const sbxText = {
    measure(s, size, bold, wrap) { const l = layout(s, size, bold, wrap); return [l.w, l.h]; },
    push(s, x, y, size, bold, wrap, r, g, b, a) { queued.push({ s, x, y, size, bold, wrap, r, g, b, a }); },
  };

  // ------------------------------------------------------------ audio
  const WAVS = new Set(["switchbox_clap", "switchbox_babble_01", "switchbox_babble_02", "switchbox_babble_03",
    "switchbox_babble_04", "switchbox_babble_05", "switchbox_babble_06"]);
  const AAC = ["music_switchbox_loop", "stinger_topscore_switchbox", "stinger_win_switchbox", "switchbox_giggle_boing",
    "switchbox_reach", "switchbox_reset", "switchbox_switch_off_01", "switchbox_switch_off_02", "switchbox_switch_off_03",
    "switchbox_switch_on_01", "switchbox_switch_on_02", "switchbox_switch_on_03", "switchbox_unlock",
    "ui_name_backspace", "ui_name_confirm", "ui_name_key_01", "ui_name_key_02", "ui_name_key_03"];
  const LOOP_END = { music_switchbox_loop: 4680000 / 48000 };  // switchbox_audio_manifest.json, at 48 kHz

  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = AC ? new AC({ latencyHint: "interactive" }) : null;
  const master = actx ? actx.createGain() : null;
  if (master) master.connect(actx.destination);
  const buffers = new Map();
  const pending = new Map();
  let unlocked = false;

  async function decode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url);
    const data = await res.arrayBuffer();
    return await new Promise((ok, fail) => {
      const p = actx.decodeAudioData(data, ok, fail);
      if (p && p.catch) p.catch(fail);
    });
  }
  function load(name) {
    if (!actx) return Promise.resolve(null);
    if (pending.has(name)) return pending.get(name);
    const base = `./assets/audio/${name}`;
    const p = (WAVS.has(name) ? decode(base + ".wav") : decode(base + ".m4a").catch(() => decode(base + ".ogg")))
      .then((b) => { buffers.set(name, b); return b; })
      .catch(() => null);  // missing files stay silent, as on the Mac
    pending.set(name, p);
    return p;
  }

  const slots = [0, 1].map(() => ({ name: "", src: null, gain: actx ? actx.createGain() : null }));
  slots.forEach((s) => s.gain && (s.gain.gain.value = 0, s.gain.connect(master)));

  const sbxAudio = {
    musicStart(slot, name) {
      const s = slots[slot];
      if (!s || !actx) return;
      if (s.src) { try { s.src.stop(); } catch (_) {} s.src.disconnect(); s.src = null; }
      s.name = name;
      if (!name) return;
      load(name).then((buf) => {
        if (!buf || s.name !== name || s.src) return;
        const src = actx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        if (LOOP_END[name] && LOOP_END[name] < buf.duration) src.loopEnd = LOOP_END[name];
        src.connect(s.gain);
        src.start();
        s.src = src;
      });
    },
    musicGain(slot, vol) {
      const s = slots[slot];
      if (s && s.gain) s.gain.gain.setTargetAtTime(vol, actx.currentTime, 0.03);
    },
    sfx(name, gain, rate) {
      if (!actx || !unlocked) return;
      const buf = buffers.get(name);
      if (!buf) { load(name); return; }
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = actx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(master);
      src.onended = () => g.disconnect();
      src.start();
    },
  };

  if (master) master.gain.value = 0;
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_) {}  // iOS: play with the ringer off
  function unlock() {
    if (!actx) return;
    if (actx.state !== "running" && !document.hidden) actx.resume().catch(() => {});
    if (!unlocked) master.gain.setTargetAtTime(1, actx.currentTime, 0.5);  // music ramped up while waiting: ease it in
    unlocked = true;
  }

  // ------------------------------------------------------------ save
  const sbxSave = {
    written(path) {
      try { localStorage.setItem(SAVE_KEY, mod.FS.readFile(path, { encoding: "utf8" })); } catch (_) {}
    },
  };

  // ------------------------------------------------------------ pointer
  // She can carry the pointer off and drop it somewhere else. A page cannot
  // move the real cursor, so the game draws the pointer where she left it and
  // your motion carries it from there; the offset melts away as you move.
  let unit = 2, N = 4, dpr = 1;   // CSS px per game pixel; device px per game pixel
  const pointer = { x: 0, y: 0, offX: 0, offY: 0, type: "mouse", inside: false, captured: false };
  const sbxPointer = {
    warp(gx, gy) {
      if (pointer.type !== "mouse" || !pointer.inside) return;
      pointer.offX = gx * unit - pointer.x;
      pointer.offY = gy * unit - pointer.y;
    },
  };
  const virtualX = () => pointer.x + pointer.offX;
  const virtualY = () => pointer.y + pointer.offY;
  const offset = () => Math.hypot(pointer.offX, pointer.offY) > 0.5;

  // ------------------------------------------------------------ module
  let mod = null;
  let pw = 0, ph = 0;
  let image = null, imageBuf = null;

  function size() {
    const W = window.innerWidth, H = window.innerHeight;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    // about 550 x 380 game pixels at the reference window, larger screens get
    // bigger pixels; an integer number of device pixels per game pixel
    const want = Math.max(1.5, Math.min(W / 550, H / 380));
    N = Math.max(1, Math.round(want * dpr));
    unit = N / dpr;
    pw = Math.ceil(W / unit);
    ph = Math.ceil(H / unit);
    view.width = pw * N;
    view.height = ph * N;
    view.style.width = `${pw * unit}px`;
    view.style.height = `${ph * unit}px`;
    off.width = pw;
    off.height = ph;
    image = null;
  }

  function present() {
    const ptr = mod._sbx_frame();
    const w = mod._sbx_width(), h = mod._sbx_height();
    if (!ptr || w !== pw || h !== ph) return;
    const heap = mod.HEAPU8.buffer;
    if (!image || imageBuf !== heap || image.data.byteOffset !== ptr) {
      image = new ImageData(new Uint8ClampedArray(heap, ptr, w * h * 4), w, h);
      imageBuf = heap;
    }
    offCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, pw * N, ph * N);
    // crisp text, one point = N/2 device pixels
    const k = N / 2;
    ctx.textBaseline = "alphabetic";
    for (const t of queued) {
      const l = layout(t.s, t.size, t.bold, t.wrap);
      ctx.font = font(t.size * k, t.bold);
      ctx.fillStyle = `rgba(${Math.round(t.r * 255)},${Math.round(t.g * 255)},${Math.round(t.b * 255)},${t.a})`;
      let y = t.y * N + (1 + l.m.asc) * k;
      for (const line of l.lines) {
        ctx.fillText(line, t.x * N + k, y);
        y += (l.m.line + l.m.gap) * k;
      }
    }
    queued.length = 0;
    if (offset() && pointer.inside) drawPointer(virtualX() * dpr, virtualY() * dpr);
  }

  function drawPointer(x, y) {
    const s = dpr;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.2, 12.8); ctx.lineTo(7.2, 19.6); ctx.lineTo(10, 18.4);
    ctx.lineTo(7.2, 11.8); ctx.lineTo(12.6, 11.8); ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1a1020";
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function updateCursor() {
    const c = mod._sbx_cursor();
    view.style.cursor = c === 2 || (offset() && pointer.inside) ? "none" : c === 1 ? "pointer" : "default";
  }

  let panel = 0;
  function watchPanel() {
    const p = mod._sbx_panel();
    if (p === panel) return;
    panel = p;
    if (p === 3) { nameInput.value = ""; nameInput.focus({ preventScroll: true }); }
    else if (document.activeElement === nameInput) view.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ input
  function send(action, e) {
    const r = view.getBoundingClientRect();
    if (e) {
      const nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (pointer.inside && action === 0 && offset()) {
        // the offset left by her drop melts away with motion
        const d = Math.hypot(nx - pointer.x, ny - pointer.y), o = Math.hypot(pointer.offX, pointer.offY);
        const keep = Math.max(0, o - d * 0.35) / o;
        pointer.offX *= keep;
        pointer.offY *= keep;
      }
      pointer.x = nx;
      pointer.y = ny;
      const vx = virtualX(), vy = virtualY();
      if (vx < 0 || vy < 0 || vx > r.width || vy > r.height) { pointer.offX = 0; pointer.offY = 0; }
    }
    mod._sbx_pointer(action, virtualX() / unit, virtualY() / unit);
    updateCursor();
  }

  view.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    unlock();
    pointer.type = e.pointerType;
    pointer.inside = true;
    view.focus({ preventScroll: true });
    try { view.setPointerCapture(e.pointerId); pointer.captured = true; } catch (_) {}
    send(1, e);
    if (panel === 3) nameInput.focus({ preventScroll: true });
    e.preventDefault();
  });
  view.addEventListener("pointermove", (e) => {
    pointer.type = e.pointerType;
    pointer.inside = true;
    send(0, e);
  });
  const release = (e) => {
    send(2, e);
    pointer.captured = false;
    if (e.pointerType !== "mouse") { pointer.inside = false; send(3, null); }  // a finger leaves no hover behind
  };
  view.addEventListener("pointerup", release);
  view.addEventListener("pointercancel", release);
  view.addEventListener("pointerleave", (e) => {
    if (pointer.captured) return;
    pointer.inside = false;
    pointer.offX = pointer.offY = 0;
    send(3, e);
  });
  view.addEventListener("contextmenu", (e) => e.preventDefault());

  const KEYS = { Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54,
    Numpad1: 49, Numpad2: 50, Numpad3: 51, Numpad4: 52, Numpad5: 53, Numpad6: 54,
    F1: 104, KeyH: 104, KeyT: 116, KeyM: 109, KeyN: 110, Escape: 27, Enter: 13, NumpadEnter: 13, Backspace: 8 };
  window.addEventListener("keydown", (e) => {
    if (!mod || e.ctrlKey || e.metaKey || e.altKey) return;
    unlock();
    if (panel === 3) {
      const k = { Backspace: 8, Enter: 13, NumpadEnter: 13, Escape: 27 }[e.code];
      if (k) { mod._sbx_key(k, e.repeat ? 1 : 0); e.preventDefault(); }
      if (document.activeElement !== nameInput) nameInput.focus({ preventScroll: true });
      return;
    }
    const k = KEYS[e.code];
    if (k === undefined || k === 8) return;
    mod._sbx_key(k, e.repeat ? 1 : 0);
    e.preventDefault();
  });
  nameInput.addEventListener("input", (e) => {
    if (!mod) return;
    if (e.inputType && e.inputType.startsWith("delete")) mod._sbx_key(8, 0);
    else for (const ch of e.data || nameInput.value) mod._sbx_text(ch.charCodeAt(0));
    nameInput.value = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (!mod) return;
    mod._sbx_front(document.hidden ? 0 : 1);
    if (document.hidden) { if (actx) actx.suspend().catch(() => {}); }
    else if (unlocked) unlock();
  });
  window.addEventListener("pagehide", () => mod && mod._sbx_persist());

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      size();
      mod._sbx_resize(pw, ph);
    });
  });

  // ------------------------------------------------------------ dev replay
  // ?script=1.0:2,1.1:4,3.5:-1 replays timed inputs like SBX_SCRIPT on the Mac
  // (a switch, -1 head, 7 next correct, 8 whack, 9 a wrong one, 10 the stolen hole).
  // It plays on a separate save so it never touches yours.
  const script = (params.get("script") || "").split(",").map((item) => item.split(":").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
  let clock = 0;
  function replay(dt) {
    clock += dt;
    while (script.length && script[0][0] <= clock) mod._sbx_script(script.shift()[1]);
  }

  // ------------------------------------------------------------ loop
  let last = 0, cost = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    // sixty frames a second at most; on a slow machine the original's thirty
    const interval = cost > 14 ? 1000 / 30 : 1000 / 60;
    if (last && now - last < interval - 4) return;
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const t0 = performance.now();
    if (script.length) replay(Math.min(dt, 0.25));
    mod._sbx_tick(Math.min(dt, 0.25));
    present();
    updateCursor();
    watchPanel();
    cost = cost * 0.95 + (performance.now() - t0) * 0.05;
  }

  async function start() {
    try {
      await Promise.all([document.fonts.load(font(12, false)), document.fonts.load(font(12, true))]);
    } catch (_) {}
    let saved = null;
    try { saved = localStorage.getItem(SAVE_KEY); } catch (_) {}
    mod = await createSwitchbox({
      locateFile: (p) => "./" + p,
      sbxText, sbxAudio, sbxSave, sbxPointer,
      preRun: [(m) => {
        m.ENV.GAMES_STATE_DIR = "/save";
        m.FS.mkdir("/save");
        if (saved) m.FS.writeFile(SAVE_PATH, saved);
      }],
    });
    for (const n of AAC.concat([...WAVS])) load(n);
    if (params.has("dev")) window.sbx = { mod, cost: () => cost, audio: () => [...buffers.keys()].length, state: () => actx && actx.state };
    size();
    mod._sbx_init(pw, ph);
    mod._sbx_front(document.hidden ? 0 : 1);
    status.classList.add("gone");
    view.focus({ preventScroll: true });
    requestAnimationFrame(frame);
  }
  start().catch((err) => {
    status.textContent = "The box would not open in this browser.";
    console.error(err);
  });
})();
