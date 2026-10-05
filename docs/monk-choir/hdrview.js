// HDR tab: controls, layer meters and a 120 dB scrolling spectrogram.

import { VOICE_TYPES } from "./engine/anatomy.js?v=9500908dbe";
import { REGISTERS } from "./engine/glottis.js?v=aa724f7289";

const LAYER_INFO = [
    ["interaction", "Glottis hears its tube", "Flow follows the pressure across the folds; skew and open-phase damping emerge.", null],
    ["noise", "Turbulence at the constriction", "Noise born where the jet is fastest, coloured by jet speed over gap width.", "noise"],
    ["impact", "Fold collision", "A contact transient when the folds close, scaled by closing speed squared.", "impact"],
    ["crossmodes", "Cross-modes above 5 kHz", "Transverse resonances of the widest section, driven by the tube's pressure.", "crossmodes"],
    ["living", "One living body", "Breath pressure, tremor and heartbeat move pitch, loudness and fold pressure together.", "living"]
];

export function buildHdrPanel(post, makeSlider, makeSelect) {
    const c = document.getElementById("hdr-controls");
    const state = { voiceType: "baritone", register: "chest" };
    const typeOptions = [];
    const keys = Object.keys(VOICE_TYPES);
    for (let i = 0; i < keys.length; i = i + 1) {
        typeOptions.push([keys[i], VOICE_TYPES[keys[i]].label]);
    }
    const regOptions = [];
    const rkeys = Object.keys(REGISTERS);
    for (let i = 0; i < rkeys.length; i = i + 1) {
        regOptions.push([rkeys[i], REGISTERS[rkeys[i]].label]);
    }
    function sendConfig() {
        post({ type: "hdrConfig", voiceType: state.voiceType, register: state.register });
    }
    function setType(v) {
        state.voiceType = v;
        sendConfig();
    }
    function setRegister(v) {
        state.register = v;
        sendConfig();
    }
    makeSelect(c, { label: "Body", options: typeOptions, value: state.voiceType, onInput: setType });
    makeSelect(c, { label: "Register", options: regOptions, value: state.register, onInput: setRegister });
    for (let i = 0; i < LAYER_INFO.length; i = i + 1) {
        addLayer(c, LAYER_INFO[i], post, makeSlider);
    }
    function sender(name) {
        function send(v) {
            post({ type: "hdrSet", name: name, value: v });
        }
        return send;
    }
    function fmt2(v) { return v.toFixed(2); }
    function pct(v) { return Math.round(v * 100) + "%"; }
    makeSlider(c, { label: "Tongue tip toward teeth", min: 0, max: 0.97, step: 0.01, value: 0, format: fmt2, onInput: sender("tip"), title: "Narrow the front of the mouth and listen to the turbulence appear and brighten" });
    makeSlider(c, { label: "Om (close to hum)", min: 0, max: 1, step: 0.01, value: 0, format: pct, onInput: sender("hum") });
    makeSlider(c, { label: "Effort", min: 0.2, max: 1.0, step: 0.01, value: 0.7, format: fmt2, onInput: sender("effort") });
    makeSlider(c, { label: "Vibrato", min: 0, max: 0.6, step: 0.01, value: 0.15, format: fmt2, onInput: sender("vibrato") });
    makeSlider(c, { label: "Room", min: 0, max: 0.8, step: 0.01, value: 0.18, format: pct, onInput: sender("hall") });

    const exposures = document.querySelectorAll(".exposures button");
    function chooseExposure(event) {
        const v = event.currentTarget.dataset.exposure;
        for (let i = 0; i < exposures.length; i = i + 1) {
            exposures[i].classList.toggle("on", exposures[i] === event.currentTarget);
        }
        post({ type: "hdrSet", name: "exposure", value: v });
    }
    for (let i = 0; i < exposures.length; i = i + 1) {
        exposures[i].addEventListener("click", chooseExposure);
    }
    const baseBtn = document.getElementById("hdr-model-base");
    const hdrBtn = document.getElementById("hdr-model-hdr");
    function chooseBase() {
        baseBtn.classList.add("on");
        hdrBtn.classList.remove("on");
        post({ type: "hdrSet", name: "model", value: "base" });
    }
    function chooseHdr() {
        hdrBtn.classList.add("on");
        baseBtn.classList.remove("on");
        post({ type: "hdrSet", name: "model", value: "hdr" });
    }
    baseBtn.addEventListener("click", chooseBase);
    hdrBtn.addEventListener("click", chooseHdr);
    return { state: state, sync: sendConfig };
}

function addLayer(container, info, post, makeSlider) {
    const key = info[0];
    const wrap = document.createElement("div");
    wrap.className = "control check";
    wrap.title = info[2];
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    function toggle() {
        post({ type: "hdrSet", name: "layer." + key, value: box.checked });
    }
    box.addEventListener("change", toggle);
    label.appendChild(box);
    label.appendChild(document.createTextNode(info[1]));
    wrap.appendChild(label);
    container.appendChild(wrap);
    if (info[3] !== null) {
        function setAmount(v) {
            post({ type: "hdrSet", name: "amount." + info[3], value: v });
        }
        function fmt(v) {
            return "×" + v.toFixed(2);
        }
        makeSlider(container, { label: "   amount", min: 0, max: 3, step: 0.01, value: 1, format: fmt, onInput: setAmount, title: info[2] });
    }
}

// ------------------------------------------------------------------ meters

function db(v) {
    return 10 * Math.log10(v + 1e-30);
}

export function drawHdrMeters(t) {
    const el = document.getElementById("hdr-meters");
    if (t === null || el === null) {
        return;
    }
    const rows = [
        ["Midtones (voiced)", db(t.meters.mid)],
        ["Shadows (turbulence)", db(t.meters.shadow)],
        ["Highlights (impact, cross-modes)", db(t.meters.high)]
    ];
    let html = "";
    for (let i = 0; i < rows.length; i = i + 1) {
        const v = rows[i][1];
        const w = Math.max(0, Math.min(100, (v + 90) / 80 * 100));
        html = html + '<div class="meter-row"><span>' + rows[i][0] + "</span> " + (v > -200 ? v.toFixed(1) + " dB" : "—") + '<div class="meter-bar"><i style="width:' + w.toFixed(1) + '%"></i></div></div>';
    }
    html = html + '<div class="meter-row"><span>Pressure above folds / lungs</span> ' + (t.layers.interaction ? (100 * t.p0Ratio).toFixed(1) + "%" : "off") + "</div>";
    html = html + '<div class="meter-row"><span>Jet noise centre</span> ' + (t.noiseGain > 0.001 ? Math.round(t.noiseCentre) + " Hz" : "quiet") + "</div>";
    html = html + '<div class="meter-row"><span>Cross-modes</span> ' + t.cross.map(function k(f) { return (f / 1000).toFixed(1); }).join(" · ") + " kHz</div>";
    html = html + '<div class="meter-row"><span>Breath pressure</span> ' + (t.layers.living ? (100 * t.ps).toFixed(1) + "%" : "fixed") + "</div>";
    html = html + '<div class="meter-row"><span>Model playing</span> ' + (t.model === "hdr" ? "HDR" : "Physical (A/B)") + "</div>";
    el.innerHTML = html;
}

// ------------------------------------------------------------------ spectrogram

const COLORS = [[0, 0, 0], [24, 8, 40], [70, 12, 70], [140, 30, 60], [210, 80, 40], [245, 160, 50], [255, 230, 140], [255, 255, 255]];

function colour(u) {
    const x = Math.max(0, Math.min(0.9999, u)) * (COLORS.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = COLORS[i];
    const b = COLORS[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function makeSpectrogram(canvas) {
    return { canvas: canvas, data: null, column: null };
}

export function drawSpectrogram(spec, analyser, sampleRate) {
    const canvas = spec.canvas;
    const w = Math.max(1, Math.floor(canvas.clientWidth));
    const h = Math.max(1, Math.floor(canvas.clientHeight));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        spec.data = null;
    }
    const ctx = canvas.getContext("2d");
    if (analyser === null) {
        return;
    }
    if (spec.data === null || spec.data.length !== analyser.frequencyBinCount) {
        spec.data = new Float32Array(analyser.frequencyBinCount);
        spec.column = ctx.createImageData(2, h);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
    }
    analyser.getFloatFrequencyData(spec.data);
    // scroll left by two pixels, draw a new column on the right
    ctx.drawImage(canvas, -2, 0);
    const col = spec.column;
    const bins = spec.data.length;
    const nyquist = sampleRate / 2;
    const lo = Math.log(50);
    const hi = Math.log(20000);
    for (let y = 0; y < h; y = y + 1) {
        const f = Math.exp(hi - (hi - lo) * (y / (h - 1)));
        const bin = Math.min(bins - 1, Math.round(f / nyquist * bins));
        const v = spec.data[bin];
        const u = (v + 140) / 120; // -140 .. -20 dB: a 120 dB window
        const c = colour(u);
        for (let x = 0; x < 2; x = x + 1) {
            const k = (y * 2 + x) * 4;
            col.data[k] = c[0];
            col.data[k + 1] = c[1];
            col.data[k + 2] = c[2];
            col.data[k + 3] = 255;
        }
    }
    ctx.putImageData(col, w - 2, 0);
    // frequency guides in a fixed margin (so they do not smear as it scrolls)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 26, h);
    ctx.fillStyle = "rgba(239,228,207,0.55)";
    ctx.font = "10px Georgia, serif";
    const marks = [100, 1000, 5000, 10000];
    for (let i = 0; i < marks.length; i = i + 1) {
        const y = (hi - Math.log(marks[i])) / (hi - lo) * (h - 1);
        ctx.fillText(marks[i] >= 1000 ? (marks[i] / 1000) + "k" : String(marks[i]), 3, y + 3);
    }
}
