// Song view: the stage scene with the ritual instruments, and a scrolling
// score built from the same event list the audio engine plays.

import { makeAnatomy, makeArticulation, areaFunction, SECTIONS as TUBE_SECTIONS } from "./engine/anatomy.js";
import { oscillatorWave } from "./engine/singer.js";
import { GRID, BAR } from "./engine/song.js";

const RATE = 20; // timeline samples per second
const WINDOW = 16.0; // seconds of score on screen
const PLAYHEAD = 0.3;

export function songTimeText(t) {
    function mmss(x) {
        const m = Math.floor(x / 60);
        const s = Math.floor(x % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }
    return mmss(Math.max(0, t)) + " / " + mmss(LENGTH_HOLDER.length);
}

const LENGTH_HOLDER = { length: 180 };

// ------------------------------------------------------------------ score data

function makeTimeline(length) {
    const n = Math.ceil(length * RATE) + 1;
    return {
        n: n,
        monksOn: new Float32Array(n), monksVowel: new Float32Array(n), monksHum: new Float32Array(n),
        upperOn: new Float32Array(n), soloOn: new Float32Array(n), soloHarm: new Float32Array(n),
        bassOn: new Float32Array(n), bassNote: new Float32Array(n), bassRate: new Float32Array(n), bassShape: new Array(n)
    };
}

function sampleTimeline(events, length) {
    const tl = makeTimeline(length);
    const st = { monksOn: 0, monksVowel: 0.5, monksHum: 0, upperOn: 0, soloOn: 0, soloHarm: 6, bassOn: 0, bassNote: 36, bassRate: 0, bassShape: "sine" };
    let k = 0;
    for (let i = 0; i < tl.n; i = i + 1) {
        const t = i / RATE;
        while (k < events.length && events[k].t <= t) {
            const e = events[k];
            const a = e.a;
            if (e.act === "note") {
                if (a.part === "monks") { st.monksOn = 1; }
                if (a.part === "upper") { st.upperOn = 1; }
                if (a.part === "solo") { st.soloOn = 1; }
                if (a.part === "bass") { st.bassOn = 1; st.bassNote = a.note; }
            } else if (e.act === "off") {
                if (a.part === "monks") { st.monksOn = 0; }
                if (a.part === "upper") { st.upperOn = 0; }
                if (a.part === "solo") { st.soloOn = 0; }
                if (a.part === "bass") { st.bassOn = 0; }
            } else if (e.act === "set") {
                if (a.part === "monks" && a.name === "vowel") { st.monksVowel = a.value; }
                if (a.part === "monks" && a.name === "hum") { st.monksHum = a.value; }
                if (a.part === "solo" && a.name === "harmonic") { st.soloHarm = a.value; }
                if (a.part === "bass" && a.name === "osc.rate") { st.bassRate = a.value; }
                if (a.part === "bass" && a.name === "osc.shape") { st.bassShape = a.value; }
            }
            k = k + 1;
        }
        tl.monksOn[i] = st.monksOn; tl.monksVowel[i] = st.monksVowel; tl.monksHum[i] = st.monksHum;
        tl.upperOn[i] = st.upperOn; tl.soloOn[i] = st.soloOn; tl.soloHarm[i] = st.soloHarm;
        tl.bassOn[i] = st.bassOn; tl.bassNote[i] = st.bassNote; tl.bassRate[i] = st.bassRate; tl.bassShape[i] = st.bassShape;
    }
    return tl;
}

function collectSegments(events) {
    const horns = [[], []];
    const gyas = [];
    const hits = [];
    const open = [null, null];
    let gyaOpen = null;
    for (let i = 0; i < events.length; i = i + 1) {
        const e = events[i];
        const a = e.a;
        if (e.act === "horn") {
            if (open[a.which] !== null) {
                open[a.which].t1 = e.t;
                horns[a.which].push(open[a.which]);
            }
            open[a.which] = { t0: e.t, t1: e.t, note: a.note, level: a.level };
        } else if (e.act === "hornStop" && open[a.which] !== null) {
            open[a.which].t1 = e.t;
            horns[a.which].push(open[a.which]);
            open[a.which] = null;
        } else if (e.act === "gya" && a.which === 0) {
            if (gyaOpen !== null) {
                gyaOpen.t1 = e.t;
                gyas.push(gyaOpen);
            }
            gyaOpen = { t0: e.t, t1: e.t, note: a.note };
        } else if (e.act === "gyaStop" && a.which === 0 && gyaOpen !== null) {
            gyaOpen.t1 = e.t;
            gyas.push(gyaOpen);
            gyaOpen = null;
        } else if (e.kind === "trigger") {
            hits.push({ t: e.t, act: e.act, amp: a.amp !== undefined ? a.amp : 0.8, seconds: a.seconds, open: a.open });
        }
    }
    return { horns: horns, gyas: gyas, hits: hits };
}

export function buildSongPanel(events, sections, length, onSeek) {
    LENGTH_HOLDER.length = length;
    const view = {
        events: events,
        sections: sections,
        length: length,
        timeline: sampleTimeline(events, length),
        segments: collectSegments(events),
        time: 0.0,
        playing: false,
        pendingPlay: false,
        telemetry: null,
        flash: 0.0
    };
    const list = document.getElementById("song-sections");
    for (let i = 0; i < sections.length; i = i + 1) {
        const li = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = songTimeText(sections[i].start).split(" / ")[0] + "  " + sections[i].name;
        li.appendChild(strong);
        const span = document.createElement("span");
        span.textContent = sections[i].text;
        li.appendChild(span);
        li.addEventListener("click", makeSeekHandler(onSeek, sections[i].start));
        list.appendChild(li);
    }
    const score = document.getElementById("score");
    function scoreClick(event) {
        const r = score.getBoundingClientRect();
        const x = (event.clientX - r.left) / r.width;
        const t = view.time + (x - PLAYHEAD) * WINDOW;
        onSeek(Math.min(length - 1, Math.max(0, t)));
    }
    score.addEventListener("click", scoreClick);
    return view;
}

function makeSeekHandler(onSeek, t) {
    function seek() {
        onSeek(t);
    }
    return seek;
}

// ------------------------------------------------------------------ score drawing

const LANES = ["Chant", "Overtones", "Dungchen", "Gyaling", "Rolmo · nga · bell", "Throat bass", "Kit"];

export function drawScore(canvas, ctx, view) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const left = 92;
    const plotW = w - left - 8;
    const laneH = (h - 8) / LANES.length;
    const t0 = view.time - PLAYHEAD * WINDOW;
    function xOf(t) {
        return left + (t - t0) / WINDOW * plotW;
    }
    // section bands
    for (let i = 0; i < view.sections.length; i = i + 1) {
        const a = view.sections[i].start;
        const b = i + 1 < view.sections.length ? view.sections[i + 1].start : view.length;
        if (b < t0 || a > t0 + WINDOW) {
            continue;
        }
        ctx.fillStyle = i % 2 === 0 ? "rgba(239,228,207,0.025)" : "rgba(233,162,59,0.035)";
        ctx.fillRect(Math.max(left, xOf(a)), 4, Math.min(xOf(b), w) - Math.max(left, xOf(a)), h - 8);
        ctx.fillStyle = "rgba(242,207,107,0.6)";
        ctx.font = "11px Georgia, serif";
        if (xOf(a) > left) {
            ctx.fillText(view.sections[i].name, xOf(a) + 4, 12);
        }
    }
    ctx.font = "12px Georgia, serif";
    for (let l = 0; l < LANES.length; l = l + 1) {
        const y = 4 + l * laneH;
        ctx.fillStyle = "rgba(239,228,207,0.55)";
        ctx.fillText(LANES[l], 6, y + laneH * 0.6);
        ctx.strokeStyle = "rgba(239,228,207,0.06)";
        ctx.beginPath();
        ctx.moveTo(left, y + laneH);
        ctx.lineTo(w, y + laneH);
        ctx.stroke();
    }
    const tl = view.timeline;
    const i0 = Math.max(0, Math.floor(t0 * RATE));
    const i1 = Math.min(tl.n - 1, Math.ceil((t0 + WINDOW) * RATE));
    // chant: vowel contour, thick when singing, dotted when the lips are closed
    const yC = 4;
    for (let i = i0 + 1; i <= i1; i = i + 1) {
        if (tl.monksOn[i] < 0.5) {
            continue;
        }
        const ya = yC + (1 - tl.monksVowel[i - 1]) * (laneH - 8) + 4;
        const yb = yC + (1 - tl.monksVowel[i]) * (laneH - 8) + 4;
        ctx.strokeStyle = tl.monksHum[i] > 0.5 ? "rgba(233,162,59,0.35)" : "#e9a23b";
        ctx.lineWidth = tl.monksHum[i] > 0.5 ? 1.5 : 3.5;
        ctx.beginPath();
        ctx.moveTo(xOf((i - 1) / RATE), ya);
        ctx.lineTo(xOf(i / RATE), yb);
        ctx.stroke();
        if (tl.upperOn[i] > 0.5) {
            ctx.fillStyle = "rgba(154,182,224,0.25)";
            ctx.fillRect(xOf((i - 1) / RATE), yC + 2, xOf(i / RATE) - xOf((i - 1) / RATE) + 0.5, 4);
        }
    }
    // overtones: harmonic number
    const yO = 4 + laneH;
    for (let i = i0 + 1; i <= i1; i = i + 1) {
        if (tl.soloOn[i] < 0.5) {
            continue;
        }
        const y = yO + (1 - (tl.soloHarm[i] - 5) / 11) * (laneH - 6) + 3;
        ctx.fillStyle = "#6fb59a";
        ctx.fillRect(xOf((i - 1) / RATE), y - 1.5, xOf(i / RATE) - xOf((i - 1) / RATE) + 0.5, 3);
    }
    // dungchen pair
    const yH = 4 + 2 * laneH;
    for (let k = 0; k < 2; k = k + 1) {
        const segs = view.segments.horns[k];
        for (let i = 0; i < segs.length; i = i + 1) {
            const s = segs[i];
            if (s.t1 < t0 || s.t0 > t0 + WINDOW) {
                continue;
            }
            ctx.fillStyle = "rgba(217,140,43," + (0.25 + 0.6 * s.level).toFixed(2) + ")";
            const y = yH + 4 + k * (laneH - 8) / 2;
            ctx.fillRect(xOf(s.t0), y, Math.max(2, xOf(s.t1) - xOf(s.t0)), (laneH - 12) / 2);
        }
    }
    // gyaling melody
    const yG = 4 + 3 * laneH;
    const gy = view.segments.gyas;
    for (let i = 0; i < gy.length; i = i + 1) {
        const s = gy[i];
        if (s.t1 < t0 || s.t0 > t0 + WINDOW) {
            continue;
        }
        const y = yG + (1 - (s.note - 59) / 13) * (laneH - 6) + 3;
        ctx.fillStyle = "#d96a4f";
        ctx.fillRect(xOf(s.t0), y - 2, Math.max(2, xOf(s.t1) - xOf(s.t0) - 1), 4);
    }
    // ritual percussion and the drop kit
    const yP = 4 + 4 * laneH;
    const yK = 4 + 6 * laneH;
    const hits = view.segments.hits;
    for (let i = 0; i < hits.length; i = i + 1) {
        const e = hits[i];
        if (e.t < t0 - 1 || e.t > t0 + WINDOW) {
            continue;
        }
        const x = xOf(e.t);
        let y = 0;
        let r = 2;
        let color = "#efe4cf";
        if (e.act === "rolmo") { y = yP + laneH * 0.45; r = 1.5 + 4 * e.amp; color = "#f2cf6b"; }
        else if (e.act === "nga") { y = yP + laneH * 0.8; r = 2 + 3 * e.amp; color = "#8c2f22"; }
        else if (e.act === "bell") { y = yP + laneH * 0.15; r = 3; color = "#9ab6e0"; }
        else if (e.act === "conch" || e.act === "kang") { y = yP + laneH * 0.15; r = 4; color = "#c58fd1"; }
        else if (e.act === "kick") { y = yK + laneH * 0.8; r = 3.5; color = "#e9a23b"; }
        else if (e.act === "snare") { y = yK + laneH * 0.5; r = 1.5 + 2 * e.amp; color = "#efe4cf"; }
        else if (e.act === "hat") { y = yK + laneH * 0.18; r = 1.2; color = "rgba(239,228,207,0.6)"; }
        else if (e.act === "riser") {
            ctx.fillStyle = "rgba(111,181,154,0.18)";
            ctx.beginPath();
            ctx.moveTo(x, yK + laneH - 2);
            ctx.lineTo(xOf(e.t + e.seconds), yK + 2);
            ctx.lineTo(xOf(e.t + e.seconds), yK + laneH - 2);
            ctx.fill();
            continue;
        } else if (e.act === "impact") { y = yK + laneH * 0.5; r = 7; color = "#f2cf6b"; }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // throat bass: the vowel orbit drawn as its actual waveform
    const yB = 4 + 5 * laneH;
    ctx.strokeStyle = "#e05d8a";
    ctx.lineWidth = 1.6;
    let drawing = false;
    ctx.beginPath();
    for (let px = 0; px <= plotW; px = px + 2) {
        const t = t0 + px / plotW * WINDOW;
        const i = Math.floor(t * RATE);
        if (i < 0 || i >= tl.n || tl.bassOn[i] < 0.5) {
            drawing = false;
            continue;
        }
        // the engine re-phases the orbit on every downbeat
        const barStart = GRID + Math.floor((t - GRID) / BAR) * BAR;
        const v = oscillatorWave(tl.bassShape[i], tl.bassRate[i] * (t - barStart));
        const y = yB + laneH * 0.5 - v * (laneH * 0.38);
        if (!drawing) {
            ctx.moveTo(left + px, y);
            drawing = true;
        } else {
            ctx.lineTo(left + px, y);
        }
    }
    ctx.stroke();
    // playhead
    ctx.strokeStyle = "#f2cf6b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xOf(view.time), 2);
    ctx.lineTo(xOf(view.time), h - 2);
    ctx.stroke();
}

// ------------------------------------------------------------------ stage drawing

const BASS_ANATOMY = makeAnatomy("basso");
const bassAreas = new Float64Array(TUBE_SECTIONS);
const bassSeg = {};
const bassArt = makeArticulation();

function drawHorn(ctx, x0, y0, x1, y1, level) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const steps = 24;
    ctx.beginPath();
    for (let i = 0; i <= steps; i = i + 1) {
        const u = i / steps;
        const half = 2 + 16 * Math.pow(u, 3.2);
        ctx.lineTo(x0 + dx * u + nx * half, y0 + dy * u + ny * half);
    }
    for (let i = steps; i >= 0; i = i - 1) {
        const u = i / steps;
        const half = 2 + 16 * Math.pow(u, 3.2);
        ctx.lineTo(x0 + dx * u - nx * half, y0 + dy * u - ny * half);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#8a6a35");
    g.addColorStop(1, "#d9a748");
    ctx.fillStyle = g;
    ctx.fill();
    // telescoping joints
    ctx.strokeStyle = "rgba(60,40,20,0.6)";
    ctx.lineWidth = 1;
    for (let j = 1; j < 4; j = j + 1) {
        const u = j / 4;
        const half = 2 + 16 * Math.pow(u, 3.2);
        ctx.beginPath();
        ctx.moveTo(x0 + dx * u + nx * half, y0 + dy * u + ny * half);
        ctx.lineTo(x0 + dx * u - nx * half, y0 + dy * u - ny * half);
        ctx.stroke();
    }
    if (level > 0.01) {
        const r = 30 + 60 * level;
        const glow = ctx.createRadialGradient(x1, y1, 2, x1, y1, r);
        glow.addColorStop(0, "rgba(242,207,107," + (0.55 * level).toFixed(3) + ")");
        glow.addColorStop(1, "rgba(242,207,107,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x1, y1, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCymbals(ctx, x, y, size, level) {
    const gap = 3 + size * 0.5 * (1.0 - Math.min(1, level * 1.6));
    ctx.fillStyle = "#c9a14a";
    ctx.strokeStyle = "#f2cf6b";
    ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k = k + 2) {
        ctx.beginPath();
        ctx.ellipse(x, y + k * gap * 0.5, size, size * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, y + k * gap * 0.5 - k * size * 0.08, size * 0.25, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#a8822f";
        ctx.fill();
        ctx.fillStyle = "#c9a14a";
    }
    if (level > 0.05) {
        ctx.strokeStyle = "rgba(242,207,107," + (0.5 * level).toFixed(3) + ")";
        ctx.lineWidth = 1.5;
        for (let k = 1; k <= 3; k = k + 1) {
            ctx.beginPath();
            ctx.ellipse(x, y, size * (1 + 0.35 * k), size * (0.3 + 0.12 * k), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

function drawDrum(ctx, x, y, r, level) {
    // stand
    ctx.strokeStyle = "#5e1f17";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.lineTo(x - r * 0.6, y + r * 2.1);
    ctx.moveTo(x, y + r);
    ctx.lineTo(x + r * 0.6, y + r * 2.1);
    ctx.stroke();
    // frame and membrane
    ctx.fillStyle = "#8c2f22";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d98c2b";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "rgba(242,207,107," + (0.12 + 0.5 * level).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(x, y, r * (0.55 + 0.1 * level), 0, Math.PI * 2);
    ctx.fill();
    // curved stick, swinging toward the membrane on a stroke
    const angle = -0.9 + 0.8 * Math.min(1, level * 1.4);
    ctx.strokeStyle = "#e3c896";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const sx = x - r * 1.1;
    const sy = y - r * 0.9;
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + Math.cos(angle) * r * 0.6, sy + Math.sin(angle) * r * 0.2 + r * 0.4, x - r * 0.15, y - r * 0.1 + (1 - level) * -r * 0.5);
    ctx.stroke();
}

function drawBell(ctx, x, y, s, level) {
    if (level > 0.02) {
        const glow = ctx.createRadialGradient(x, y, 1, x, y, s * 3);
        glow.addColorStop(0, "rgba(154,182,224," + (0.6 * level).toFixed(3) + ")");
        glow.addColorStop(1, "rgba(154,182,224,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, s * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "#c9a14a";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.8, y + s * 0.6);
    ctx.quadraticCurveTo(x - s * 0.7, y - s * 0.6, x, y - s * 0.7);
    ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.6, x + s * 0.8, y + s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - s * 0.08, y - s * 1.4, s * 0.16, s * 0.75);
}

function drawPipe(ctx, x, y, angle, len, level, color) {
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fill();
    if (level > 0.02) {
        const glow = ctx.createRadialGradient(ex, ey, 1, ex, ey, 26);
        glow.addColorStop(0, "rgba(217,106,79," + (0.7 * level).toFixed(3) + ")");
        glow.addColorStop(1, "rgba(217,106,79,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ex, ey, 26, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawShell(ctx, x, y, s, level, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 60; i = i + 1) {
        const a = i * 0.28;
        const r = s * (0.15 + i / 60);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.7;
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.stroke();
    if (level > 0.02) {
        ctx.fillStyle = "rgba(197,143,209," + (0.4 * level).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(x, y, s * (1.4 + level), 0, Math.PI * 2);
        ctx.fill();
    }
}

// The bass voice is a basso's vocal tract: draw its tube, mirrored, along
// the floor, opening and closing with the vowel orbit.
function drawThroat(ctx, w, h, singer, level) {
    if (singer === undefined || singer.env < 0.02) {
        return;
    }
    bassArt.jaw = singer.jaw;
    bassArt.lipAperture = singer.lip;
    bassArt.lipProtrusion = singer.protrusion;
    bassArt.tonguePos = singer.tongue;
    bassArt.tongueHeight = singer.tongueHeight;
    bassArt.velum = singer.velum;
    bassArt.tipPos = singer.tipPos;
    bassArt.tipClose = singer.tipClose;
    bassArt.epilarynx = singer.epilarynx;
    bassArt.larynx = singer.larynx;
    areaFunction(BASS_ANATOMY, bassArt, bassAreas, bassSeg);
    const x0 = w * 0.08;
    const x1 = w * 0.92;
    const mid = h - 13;
    const scale = 5.5;
    const alpha = Math.min(1, singer.env) * (0.5 + 0.5 * level);
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, "rgba(140,47,34," + alpha.toFixed(3) + ")");
    g.addColorStop(1, "rgba(224,93,138," + alpha.toFixed(3) + ")");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < TUBE_SECTIONS; i = i + 1) {
        const x = x0 + (i + 0.5) / TUBE_SECTIONS * (x1 - x0);
        const r = Math.sqrt(bassAreas[i] / Math.PI) * scale;
        ctx.lineTo(x, mid - r);
    }
    for (let i = TUBE_SECTIONS - 1; i >= 0; i = i - 1) {
        const x = x0 + (i + 0.5) / TUBE_SECTIONS * (x1 - x0);
        const r = Math.sqrt(bassAreas[i] / Math.PI) * scale;
        ctx.lineTo(x, mid + r);
    }
    ctx.closePath();
    ctx.fill();
}

function partLength(parts, name, i) {
    if (parts === null || parts[name] === undefined || parts[name][i] === undefined) {
        return 17.0;
    }
    return parts[name][i].length;
}

function partMouth(parts, name, i) {
    if (parts === null || parts[name] === undefined || parts[name][i] === undefined) {
        return { jaw: 0.15, lip: 0.3, protrusion: 0.3, velum: 0.0, active: 0.0 };
    }
    const s = parts[name][i];
    return { jaw: s.jaw, lip: s.lip, protrusion: s.protrusion, velum: s.velum, active: Math.min(1, s.env * 1.2) };
}

export function drawSongStage(ctx, w, h, view, drawMonk, smoothMouth, hues) {
    const tel = view.telemetry;
    const parts = tel !== null ? tel.parts : null;
    const inst = tel !== null ? tel.inst : { horn0: 0, horn1: 0, gya0: 0, gya1: 0, conch: 0, kang: 0, rolmo: 0, nga: 0, bell: 0, kick: 0, snare: 0, hat: 0, sub: 0, riser: 0 };
    // drop light: kick glows the floor, snare flashes the room
    if (inst.kick > 0.02) {
        const g = ctx.createLinearGradient(0, h, 0, h * 0.4);
        g.addColorStop(0, "rgba(233,162,59," + (0.35 * inst.kick).toFixed(3) + ")");
        g.addColorStop(1, "rgba(233,162,59,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }
    if (inst.snare > 0.05) {
        ctx.fillStyle = "rgba(239,228,207," + (0.06 * inst.snare).toFixed(3) + ")";
        ctx.fillRect(0, 0, w, h);
    }
    if (inst.riser > 0.05) {
        ctx.fillStyle = "rgba(111,181,154," + (0.12 * inst.riser).toFixed(3) + ")";
        ctx.fillRect(0, 0, w, h * inst.riser);
    }
    // horns
    drawHorn(ctx, w * 0.22, h - 46, w * 0.025, h * 0.2, inst.horn0);
    drawHorn(ctx, w * 0.78, h - 46, w * 0.975, h * 0.2, inst.horn1);
    // ritual instruments above and beside the monks
    drawCymbals(ctx, w * 0.2, h * 0.28, Math.min(34, w * 0.035), inst.rolmo);
    drawDrum(ctx, w * 0.86, h * 0.42, Math.min(46, h * 0.18), inst.nga);
    drawBell(ctx, w * 0.12, h * 0.62, 10, inst.bell);
    drawPipe(ctx, w * 0.43, h * 0.2, -2.4, 30, inst.gya0, "#b0573f");
    drawPipe(ctx, w * 0.57, h * 0.2, -0.74, 30, inst.gya1, "#b0573f");
    drawShell(ctx, w * 0.5, h * 0.11, 9, Math.max(inst.conch, inst.kang), inst.kang > inst.conch ? "#e3c896" : "#f3ead8");
    // back row: upper voices and the overtone singer (in the middle)
    const back = [["upper", 0], ["upper", 1], ["solo", 0], ["upper", 2]];
    const baseSize = Math.min(w * 0.05, h * 0.26);
    for (let k = 0; k < back.length; k = k + 1) {
        const name = back[k][0];
        const idx = back[k][1];
        const x = w * (0.38 + 0.08 * k);
        const mouth = smoothMouth(10 + k, partMouth(parts, name, idx));
        const size = baseSize * 0.78 * Math.pow(partLength(parts, name, idx) / 17.0, 1.3);
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, mouth.active * 3);
        drawMonk(ctx, x, h - 18 - baseSize * 0.75, size, mouth, mouth.active, false, hues[(k + 2) % hues.length]);
        ctx.globalAlpha = 1.0;
    }
    // front row: the five chant monks
    for (let k = 0; k < 5; k = k + 1) {
        const x = w * (0.3 + 0.1 * k);
        const mouth = smoothMouth(k, partMouth(parts, "monks", k));
        const size = baseSize * Math.pow(partLength(parts, "monks", k) / 17.0, 1.3);
        drawMonk(ctx, x, h - 18, size, mouth, mouth.active, false, hues[k % hues.length]);
    }
    // the throat bass along the floor
    if (parts !== null && parts.bass !== undefined) {
        drawThroat(ctx, w, h, parts.bass[0], inst.sub);
    }
}
