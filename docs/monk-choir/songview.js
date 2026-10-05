// Song view: the stage scene with the ritual instruments, and a scrolling
// piano roll built from the same event list the audio engine plays, so the
// counterpoint is visible: every voice is its own coloured line.

import { makeAnatomy, makeArticulation, areaFunction, SECTIONS as TUBE_SECTIONS } from "./engine/anatomy.js";

const WINDOW = 14.0; // seconds of score on screen
const PLAYHEAD = 0.28;
const LENGTH_HOLDER = { length: 180 };

export function songTimeText(t) {
    function mmss(x) {
        const m = Math.floor(x / 60);
        const s = Math.floor(x % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }
    return mmss(Math.max(0, t)) + " / " + mmss(LENGTH_HOLDER.length);
}

// ------------------------------------------------------------------ roll data

export const ROLL_VOICES = [
    { key: "upper0", label: "Countertenor", color: "#9ab6e0", width: 3 },
    { key: "upper1", label: "Tenor (head)", color: "#8fd1c3", width: 3 },
    { key: "upper2", label: "Tenor (chest)", color: "#6fb59a", width: 3 },
    { key: "monks", label: "Monks", color: "#e9a23b", width: 5 },
    { key: "over", label: "Overtone", color: "#f2cf6b", width: 2.5 },
    { key: "drone", label: "Its drone", color: "rgba(242,207,107,0.35)", width: 2 },
    { key: "bass0", label: "Throat: growl", color: "#e05d8a", width: 3.5 },
    { key: "bass1", label: "Throat: squeal", color: "#c58fd1", width: 3 },
    { key: "bass2", label: "Throat: chop", color: "#d96a4f", width: 3 },
    { key: "horn", label: "Dungchen", color: "rgba(217,140,43,0.55)", width: 6 },
    { key: "gya", label: "Gyaling", color: "#b0573f", width: 2 }
];

function voiceKeyIndex() {
    const map = {};
    for (let i = 0; i < ROLL_VOICES.length; i = i + 1) {
        map[ROLL_VOICES[i].key] = i;
    }
    return map;
}

function harmonicPitch(drone, harmonic) {
    return drone + 12.0 * Math.log2(harmonic);
}

// Turn the event list into note segments per voice and percussion hits.
function collectRoll(events, length) {
    const index = voiceKeyIndex();
    const segs = [];
    for (let i = 0; i < ROLL_VOICES.length; i = i + 1) {
        segs.push([]);
    }
    const open = {};
    const hits = [];
    let soloNote = -1;
    let soloHarm = 8;
    function close(key, t) {
        if (open[key] !== undefined && open[key] !== null) {
            open[key].t1 = t;
            if (open[key].t1 > open[key].t0) {
                segs[index[key]].push(open[key]);
            }
            open[key] = null;
        }
    }
    function start(key, t, pitch) {
        close(key, t);
        open[key] = { t0: t, t1: t, pitch: pitch };
    }
    for (let i = 0; i < events.length; i = i + 1) {
        const e = events[i];
        const a = e.a;
        const t = e.t;
        if (e.act === "voice" && (a.part === "upper" || a.part === "bass")) {
            start(a.part + a.index, t, a.note);
        } else if (e.act === "voiceOff" && (a.part === "upper" || a.part === "bass")) {
            close(a.part + a.index, t);
        } else if (e.act === "note" && a.part === "monks") {
            start("monks", t, a.note);
        } else if (e.act === "note" && a.part === "bass") {
            start("bass0", t, a.note);
        } else if (e.act === "note" && a.part === "solo") {
            soloNote = a.note;
            start("drone", t, a.note);
            start("over", t, harmonicPitch(a.note, soloHarm));
        } else if (e.act === "set" && a.part === "solo" && a.name === "harmonic") {
            soloHarm = a.value;
            if (soloNote >= 0 && open.over) {
                start("over", t, harmonicPitch(soloNote, soloHarm));
            }
        } else if (e.act === "overtone") {
            soloNote = a.drone;
            soloHarm = a.harmonic;
            start("drone", t, a.drone);
            start("over", t, harmonicPitch(a.drone, a.harmonic));
        } else if (e.act === "off") {
            if (a.part === "monks") {
                close("monks", t);
            } else if (a.part === "upper") {
                close("upper0", t); close("upper1", t); close("upper2", t);
            } else if (a.part === "solo") {
                close("over", t); close("drone", t);
                soloNote = -1;
            } else if (a.part === "bass") {
                close("bass0", t);
            }
        } else if (e.act === "horn") {
            start("horn", t, a.note);
        } else if (e.act === "hornStop") {
            close("horn", t);
        } else if (e.act === "gya" && a.which === 0) {
            start("gya", t, a.note);
        } else if (e.act === "gyaStop" && a.which === 0) {
            close("gya", t);
        } else if (e.kind === "trigger") {
            hits.push({ t: t, act: e.act, amp: a.amp !== undefined ? a.amp : 0.8, seconds: a.seconds });
        }
    }
    const keys = Object.keys(open);
    for (let i = 0; i < keys.length; i = i + 1) {
        close(keys[i], length);
    }
    return { segs: segs, hits: hits };
}

export function buildSongPanel(def, onSeek) {
    LENGTH_HOLDER.length = def.length;
    const view = {
        def: def,
        events: def.buildScore(),
        sections: def.sections,
        length: def.length,
        time: 0.0,
        playing: false,
        pendingPlay: false,
        telemetry: null
    };
    view.roll = collectRoll(view.events, view.length);
    const list = document.getElementById("song-sections");
    list.innerHTML = "";
    for (let i = 0; i < view.sections.length; i = i + 1) {
        const li = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = songTimeText(view.sections[i].start).split(" / ")[0] + "  " + view.sections[i].name;
        li.appendChild(strong);
        const span = document.createElement("span");
        span.textContent = view.sections[i].text;
        li.appendChild(span);
        li.addEventListener("click", makeSeekHandler(onSeek, view.sections[i].start));
        list.appendChild(li);
    }
    const legend = document.getElementById("roll-legend");
    if (legend !== null) {
        legend.innerHTML = "";
        for (let i = 0; i < ROLL_VOICES.length; i = i + 1) {
            const v = ROLL_VOICES[i];
            if (view.roll.segs[i].length === 0) {
                continue;
            }
            const item = document.createElement("span");
            const sw = document.createElement("i");
            sw.style.background = v.color;
            item.appendChild(sw);
            item.appendChild(document.createTextNode(v.label));
            legend.appendChild(item);
        }
    }
    return view;
}

function makeSeekHandler(onSeek, t) {
    function seek() {
        onSeek(t);
    }
    return seek;
}

export function scoreSeekTime(view, fraction) {
    return Math.min(view.length - 1, Math.max(0, view.time + (fraction - PLAYHEAD) * WINDOW));
}

// ------------------------------------------------------------------ roll drawing

const PITCH_LOW = 28;
const PITCH_HIGH = 98;

export function drawScore(canvas, ctx, view) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const left = 34;
    const plotW = w - left - 6;
    const perc = 34;
    const rollTop = 16;
    const rollH = h - perc - rollTop - 4;
    const t0 = view.time - PLAYHEAD * WINDOW;
    function xOf(t) {
        return left + (t - t0) / WINDOW * plotW;
    }
    function yOf(p) {
        return rollTop + (1 - (p - PITCH_LOW) / (PITCH_HIGH - PITCH_LOW)) * rollH;
    }
    // section bands
    ctx.font = "11px Georgia, serif";
    for (let i = 0; i < view.sections.length; i = i + 1) {
        const a = view.sections[i].start;
        const b = i + 1 < view.sections.length ? view.sections[i + 1].start : view.length;
        if (b < t0 || a > t0 + WINDOW) {
            continue;
        }
        ctx.fillStyle = i % 2 === 0 ? "rgba(239,228,207,0.025)" : "rgba(233,162,59,0.04)";
        const xa = Math.max(left, xOf(a));
        ctx.fillRect(xa, 2, Math.min(xOf(b), w) - xa, h - 4);
        if (xOf(a) >= left) {
            ctx.fillStyle = "rgba(242,207,107,0.7)";
            ctx.fillText(view.sections[i].name, xOf(a) + 4, 12);
        }
    }
    // octave lines
    for (let p = 36; p <= 96; p = p + 12) {
        ctx.strokeStyle = "rgba(239,228,207,0.07)";
        ctx.beginPath();
        ctx.moveTo(left, yOf(p));
        ctx.lineTo(w, yOf(p));
        ctx.stroke();
        ctx.fillStyle = "rgba(239,228,207,0.45)";
        ctx.fillText("C" + (p / 12 - 1), 4, yOf(p) + 4);
    }
    // voices, horns first so they sit behind
    const order = [9, 5, 3, 6, 7, 8, 2, 1, 0, 10, 4];
    for (let oi = 0; oi < order.length; oi = oi + 1) {
        const vi = order[oi];
        const v = ROLL_VOICES[vi];
        const segs = view.roll.segs[vi];
        ctx.strokeStyle = v.color;
        ctx.lineWidth = v.width;
        ctx.lineCap = "round";
        for (let i = 0; i < segs.length; i = i + 1) {
            const sg = segs[i];
            if (sg.t1 < t0 || sg.t0 > t0 + WINDOW) {
                continue;
            }
            const y = yOf(sg.pitch);
            ctx.beginPath();
            ctx.moveTo(xOf(sg.t0) + 1, y);
            ctx.lineTo(Math.max(xOf(sg.t0) + 2, xOf(sg.t1) - 1), y);
            ctx.stroke();
        }
    }
    ctx.lineCap = "butt";
    // percussion strip
    const py = h - perc;
    ctx.strokeStyle = "rgba(239,228,207,0.08)";
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(w, py);
    ctx.stroke();
    const hits = view.roll.hits;
    for (let i = 0; i < hits.length; i = i + 1) {
        const e = hits[i];
        if (e.t < t0 - 1 || e.t > t0 + WINDOW) {
            continue;
        }
        const x = xOf(e.t);
        let y = py + perc * 0.5;
        let r = 2;
        let color = "#efe4cf";
        if (e.act === "rolmo") { y = py + perc * 0.3; r = 1.5 + 3.5 * e.amp; color = "#f2cf6b"; }
        else if (e.act === "nga") { y = py + perc * 0.75; r = 2 + 3 * e.amp; color = "#c0503a"; }
        else if (e.act === "bell") { y = py + perc * 0.15; r = 3; color = "#9ab6e0"; }
        else if (e.act === "conch" || e.act === "kang") { y = py + perc * 0.15; r = 4; color = "#c58fd1"; }
        else if (e.act === "kick") { y = py + perc * 0.85; r = 3; color = "#e9a23b"; }
        else if (e.act === "snare") { y = py + perc * 0.55; r = 1.2 + 1.8 * e.amp; color = "#efe4cf"; }
        else if (e.act === "hat") { y = py + perc * 0.35; r = 1; color = "rgba(239,228,207,0.5)"; }
        else if (e.act === "dunk") { y = py + perc * 0.85; r = 2; color = "#e05d8a"; }
        else if (e.act === "riser") {
            ctx.fillStyle = "rgba(111,181,154,0.15)";
            ctx.beginPath();
            ctx.moveTo(x, h - 2);
            ctx.lineTo(xOf(e.t + e.seconds), py + 2);
            ctx.lineTo(xOf(e.t + e.seconds), h - 2);
            ctx.fill();
            continue;
        } else if (e.act === "impact") { y = py + perc * 0.5; r = 6; color = "#f2cf6b"; }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
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
        let loud = parts.bass[0];
        for (let i = 1; i < parts.bass.length; i = i + 1) {
            if (parts.bass[i].env > loud.env) {
                loud = parts.bass[i];
            }
        }
        drawThroat(ctx, w, h, loud, Math.max(inst.sub, inst.dunk || 0));
    }
}
