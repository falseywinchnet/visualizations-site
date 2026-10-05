// Page: audio start-up, pad, keyboard, MIDI, controls, stage and inspector.

import { PRESETS, presetById } from "./engine/presets.js";
import { makeSingerConfig, anatomyFor, foldIntoRange } from "./engine/choir.js";
import { VOICE_TYPES, SECTIONS, SPEED_OF_SOUND, makeArticulation, areaFunction, lipRadius, segmentLengths } from "./engine/anatomy.js";
import { REGISTERS } from "./engine/glottis.js";
import { radiationPole } from "./engine/tract.js";
import { responseCurve, findFormants, makeFormantSlots } from "./engine/analysis.js";
import { vowelArticulation, noteToHz } from "./engine/singer.js";
import { VOWEL_SHAPES, CLASSIC_BODY } from "./engine/vowels.js";
import { ROLMO } from "./engine/song.js";
import { FUGUE } from "./engine/songs/fugue.js";
import { PASSACAGLIA } from "./engine/songs/passacaglia.js";
import { drawSongStage, drawScore, buildSongPanel, songTimeText, scoreSeekTime } from "./songview.js";

const SONGS = { passacaglia: PASSACAGLIA, fugue: FUGUE, rolmo: ROLMO };
const SONG_LEDES = {
    passacaglia: "A ground bass (A–G–F–E) and sixteen variations. Built from a study of bass sound design: a sub with its own breaths, a kick tuned to fall onto it, throats that talk in held vowels and quick V-sweeps, the throat lengthening to slide every formant down in the gaps, and a sygyt whistle held above.",
    fugue: "One original subject handled as a fugue for chant, overtones, upper voices and three throat basses: answer, countersubject, cantus firmus, stretto, inversion, chorale, canon, and two drops built on call and response between throats.",
    rolmo: "Monastic ritual music meets a bass drop. Every voice is a physical singer; the wobble is a monk’s throat orbiting through vowels at the tempo."
};

// ------------------------------------------------------------------ state

const state = {
    mode: "classic",
    audio: null,
    node: null,
    started: false,
    octave: 0,
    preset: PRESETS[0],
    config: null,
    globals: { vowel: 0.5, hum: 0.0, halftone: 0.0, harmonic: 10, effort: 1.0, glide: 0.15, hallMix: 0.3, hallTime: 3.5, voicing: "stack", master: 0.6, "osc.depth": 0.0, "osc.round": 0.0, "osc.rate": 0.25, "osc.rateUi": 0.32, "osc.spread": 0.5, "osc.mode": "free", "osc.shape": "sine" },
    classic: { voice: 0.5, glide: 0.5, vibrato: 0.0, vibratoRate: 0.5, delayMix: 0.8, delayRate: 0.5, unison: 1, detune: 0.0, spread: 0.0, aspiration: 0.5, volume: 0.1, level: 1.0 },
    telemetry: null,
    classicTelemetry: { vowel: 0.5, pitch: 0.5, active: false, amp: 0.0 },
    selected: 0,
    padDown: false,
    padPoint: { x: 0.5, y: 0.5 },
    padTrail: [],
    keysDown: {},
    mouths: [],
    inspectDirty: true,
    lastInspect: 0,
    song: null,
    songId: "passacaglia",
    songReady: false
};

const VOWEL_NAMES = ["ooh", "ow", "ah", "ayh", "eeh"];
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const TUNINGS = { none: "—", r1: "F1 follows pitch", overtone: "khöömei", sygyt: "sygyt", gyuto: "Gyuto chord" };
const PAD_LOW_NOTE = 36;
const DOT_COLORS = ["#6fb59a", "#e9a23b", "#d96a4f", "#9ab6e0", "#f2cf6b", "#c58fd1", "#8fd1c3", "#e6b8a2"];
const PAD_SPAN = 24;

function noteName(n) {
    const r = Math.round(n);
    const name = NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
    const cents = Math.round((n - r) * 100);
    if (cents === 0) {
        return name;
    }
    let sign = "+";
    if (cents < 0) {
        sign = "−";
    }
    return name + sign + Math.abs(cents) + "¢";
}

function $(id) {
    return document.getElementById(id);
}

// ------------------------------------------------------------------ audio

function post(message) {
    if (state.node !== null) {
        state.node.port.postMessage(message);
    }
}

async function startAudio() {
    if (state.started) {
        if (state.audio.state === "running") {
            await state.audio.suspend();
            $("power").textContent = "Resume sound";
            $("power").classList.remove("on");
        } else {
            await state.audio.resume();
            $("power").textContent = "Sound on";
            $("power").classList.add("on");
        }
        return;
    }
    const ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule("./worklet.js");
    const node = new AudioWorkletNode(ctx, "monk-processor", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    node.connect(limiter);
    limiter.connect(ctx.destination);
    node.port.onmessage = receiveTelemetry;
    state.audio = ctx;
    state.node = node;
    state.started = true;
    syncEngine();
    await ctx.resume();
    $("power").textContent = "Sound on";
    $("power").classList.add("on");
}

function syncEngine() {
    post({ type: "mode", mode: state.mode });
    const ck = Object.keys(state.classic);
    for (let i = 0; i < ck.length; i = i + 1) {
        post({ type: "classicParam", name: ck[i], value: state.classic[ck[i]] });
    }
    post({ type: "choirConfig", config: state.config });
    const gk = Object.keys(state.globals);
    for (let i = 0; i < gk.length; i = i + 1) {
        if (gk[i] !== "osc.rateUi") {
            post({ type: "choirGlobal", name: gk[i], value: state.globals[gk[i]] });
        }
    }
}

function receiveTelemetry(event) {
    const m = event.data;
    if (m.type === "songReady") {
        if (m.id !== state.songId) {
            return;
        }
        state.songReady = true;
        if (state.song.pendingPlay) {
            state.song.pendingPlay = false;
            post({ type: "songPlay" });
            state.song.playing = true;
        }
        updateSongButton();
        return;
    }
    if (m.type !== "telemetry") {
        return;
    }
    if (m.mode === "song") {
        state.song.telemetry = m;
        state.song.time = m.time;
        if (m.ended && state.song.playing) {
            state.song.playing = false;
            updateSongButton();
        }
        return;
    }
    if (m.mode === "classic") {
        state.classicTelemetry = m;
    } else {
        state.telemetry = m.singers;
        state.inspectDirty = true;
    }
}

async function ensureAudio() {
    if (!state.started) {
        await startAudio();
    } else if (state.audio.state !== "running") {
        await state.audio.resume();
        $("power").textContent = "Sound on";
        $("power").classList.add("on");
    }
}

// ------------------------------------------------------------------ notes

function noteOn(note, velocity) {
    ensureAudio();
    post({ type: "noteOn", note: note, velocity: velocity });
    markKey(note, true);
}

function noteOff(note) {
    post({ type: "noteOff", note: note });
    markKey(note, false);
}

// ------------------------------------------------------------------ mode

function setMode(mode) {
    state.mode = mode;
    const modes = ["classic", "choir", "song"];
    for (let i = 0; i < modes.length; i = i + 1) {
        $("mode-" + modes[i]).classList.toggle("on", mode === modes[i]);
        $("mode-" + modes[i]).setAttribute("aria-selected", String(mode === modes[i]));
    }
    $("classic-panel").classList.toggle("hidden", mode !== "classic");
    $("choir-panel").classList.toggle("hidden", mode !== "choir");
    $("inspector").classList.toggle("hidden", mode !== "choir");
    $("song-panel").classList.toggle("hidden", mode !== "song");
    document.querySelector(".play").classList.toggle("hidden", mode === "song");
    if (mode === "song") {
        state.song.playing = false;
        updateSongButton();
        if (!state.started) {
            $("song-play").disabled = false;
            $("song-play").textContent = "Play";
        }
    }
    post({ type: "mode", mode: mode });
    if (mode === "song" && state.started && !state.songReady) {
        post({ type: "songLoad", id: state.songId });
    }
    updatePadLabels();
    clearKeys();
}

function selectClassic() {
    setMode("classic");
}

function selectChoir() {
    setMode("choir");
}

function selectSong() {
    setMode("song");
}

// ------------------------------------------------------------------ song transport

function updateSongButton() {
    const b = $("song-play");
    if (state.started && !state.songReady) {
        b.disabled = true;
        b.textContent = "Preparing…";
        return;
    }
    b.disabled = false;
    b.textContent = state.song.playing ? "Pause" : "Play";
}

async function toggleSong() {
    await ensureAudio();
    if (!state.songReady) {
        post({ type: "songLoad", id: state.songId });
        updateSongButton();
        state.song.pendingPlay = true;
        return;
    }
    if (state.song.playing) {
        post({ type: "songStop" });
        state.song.playing = false;
    } else {
        post({ type: "songPlay" });
        state.song.playing = true;
    }
    updateSongButton();
}

function loadSongView(id) {
    state.songId = id;
    state.song = buildSongPanel(SONGS[id], seekSong);
    $("song-lede").textContent = SONG_LEDES[id];
    $("song-select").value = id;
}

function onSongSelect(event) {
    const id = event.target.value;
    if (state.song !== null && state.song.playing) {
        post({ type: "songStop" });
    }
    loadSongView(id);
    if (state.started) {
        state.songReady = false;
        updateSongButton();
        post({ type: "songLoad", id: id });
    }
}

function onScoreClick(event) {
    const r = $("score").getBoundingClientRect();
    seekSong(scoreSeekTime(state.song, (event.clientX - r.left) / r.width));
}

function seekSong(t) {
    state.song.time = t;
    post({ type: "songSeek", time: t });
    if (state.song.playing) {
        post({ type: "songPlay" });
    }
}

// ------------------------------------------------------------------ controls

function makeSlider(container, spec) {
    const wrap = document.createElement("div");
    wrap.className = "control";
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = spec.label;
    const out = document.createElement("output");
    label.appendChild(name);
    label.appendChild(out);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);
    input.setAttribute("aria-label", spec.label);
    if (spec.title) {
        wrap.title = spec.title;
    }
    function show() {
        out.textContent = spec.format(Number(input.value));
    }
    function changed() {
        show();
        spec.onInput(Number(input.value));
    }
    input.addEventListener("input", changed);
    show();
    wrap.appendChild(label);
    wrap.appendChild(input);
    container.appendChild(wrap);
    return input;
}

function makeSelect(container, spec) {
    const wrap = document.createElement("div");
    wrap.className = "control";
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = spec.label;
    label.appendChild(name);
    const select = document.createElement("select");
    for (let i = 0; i < spec.options.length; i = i + 1) {
        const o = document.createElement("option");
        o.value = spec.options[i][0];
        o.textContent = spec.options[i][1];
        select.appendChild(o);
    }
    select.value = spec.value;
    function changed() {
        spec.onInput(select.value);
    }
    select.addEventListener("change", changed);
    wrap.appendChild(label);
    wrap.appendChild(select);
    container.appendChild(wrap);
    return select;
}

function fmtFixed2(v) { return v.toFixed(2); }
function fmtPercent(v) { return Math.round(v * 100) + "%"; }
function fmtInt(v) { return String(Math.round(v)); }
function fmtCents(v) { return Math.round(v) + "¢"; }
function fmtSeconds(v) { return v.toFixed(1) + " s"; }

function classicSetter(name) {
    function set(value) {
        state.classic[name] = value;
        post({ type: "classicParam", name: name, value: value });
    }
    return set;
}

function formatVoice(v) {
    const scale = 0.75 + 0.5 * v;
    return "formants ×" + scale.toFixed(2);
}

function formatVibratoRate(v) {
    return "×" + Math.pow(4.0, v * 2.0 - 1.0).toFixed(2);
}

function formatEcho(v) {
    return Math.round(310 * (0.1 + 1.9 * v) / 1.0) + " ms";
}

function buildClassicControls() {
    const c = $("classic-controls");
    makeSlider(c, { label: "Voice", min: 0, max: 1, step: 0.01, value: state.classic.voice, format: formatVoice, onInput: classicSetter("voice"), title: "Scales all formants: 0 baritone, 1 soprano-like" });
    makeSlider(c, { label: "Glide", min: 0, max: 1, step: 0.01, value: state.classic.glide, format: fmtFixed2, onInput: classicSetter("glide") });
    makeSlider(c, { label: "Vibrato", min: 0, max: 1, step: 0.01, value: state.classic.vibrato, format: fmtFixed2, onInput: classicSetter("vibrato") });
    makeSlider(c, { label: "Vibrato rate", min: 0, max: 1, step: 0.01, value: state.classic.vibratoRate, format: formatVibratoRate, onInput: classicSetter("vibratoRate") });
    makeSlider(c, { label: "Echo amount", min: 0, max: 1, step: 0.01, value: state.classic.delayMix, format: fmtPercent, onInput: classicSetter("delayMix") });
    makeSlider(c, { label: "Echo time", min: 0, max: 1, step: 0.01, value: state.classic.delayRate, format: formatEcho, onInput: classicSetter("delayRate") });
    makeSlider(c, { label: "Unison monks", min: 1, max: 10, step: 1, value: state.classic.unison, format: fmtInt, onInput: classicSetter("unison") });
    makeSlider(c, { label: "Unison detune", min: 0, max: 50, step: 1, value: state.classic.detune, format: fmtCents, onInput: classicSetter("detune") });
    makeSlider(c, { label: "Unison voice spread", min: 0, max: 0.5, step: 0.01, value: state.classic.spread, format: fmtFixed2, onInput: classicSetter("spread") });
    makeSlider(c, { label: "Breath", min: 0, max: 1, step: 0.01, value: state.classic.aspiration, format: fmtFixed2, onInput: classicSetter("aspiration") });
    makeSlider(c, { label: "Level", min: 0, max: 1, step: 0.01, value: state.classic.level, format: fmtPercent, onInput: classicSetter("level") });
}

function choirSetter(name) {
    function set(value) {
        state.globals[name] = value;
        post({ type: "choirGlobal", name: name, value: value });
        if (name === "vowel") {
            state.padPoint.y = value;
        }
    }
    return set;
}

function formatVowel(v) {
    const pos = v * 4;
    const i = Math.round(pos);
    if (Math.abs(pos - i) < 0.18) {
        return VOWEL_NAMES[i];
    }
    return VOWEL_NAMES[Math.floor(pos)] + "–" + VOWEL_NAMES[Math.min(4, Math.floor(pos) + 1)];
}

function formatHarmonic(v) {
    return "#" + Math.round(v);
}

const choirInputs = {};

function buildChoirControls() {
    const c = $("choir-controls");
    choirInputs.vowel = makeSlider(c, { label: "Vowel", min: 0, max: 1, step: 0.005, value: state.globals.vowel, format: formatVowel, onInput: choirSetter("vowel") });
    choirInputs.hum = makeSlider(c, { label: "Om (close to hum)", min: 0, max: 1, step: 0.01, value: state.globals.hum, format: fmtPercent, onInput: choirSetter("hum"), title: "Lips close and the velum opens: the 'm' of Om, through the nose" });
    choirInputs.halftone = makeSlider(c, { label: "Half tone (ventricular)", min: 0, max: 1, step: 0.01, value: state.globals.halftone, format: fmtPercent, onInput: choirSetter("halftone"), title: "False folds close every second glottal pulse: the sub-octave" });
    choirInputs.harmonic = makeSlider(c, { label: "Overtone harmonic", min: 5, max: 16, step: 1, value: state.globals.harmonic, format: formatHarmonic, onInput: choirSetter("harmonic"), title: "For khöömei and sygyt singers" });
    choirInputs.effort = makeSlider(c, { label: "Effort", min: 0.4, max: 1.6, step: 0.01, value: state.globals.effort, format: fmtFixed2, onInput: choirSetter("effort"), title: "Louder phonation seals the folds faster: brighter, not just louder" });
    choirInputs.glide = makeSlider(c, { label: "Glide", min: 0.01, max: 0.6, step: 0.01, value: state.globals.glide, format: fmtFixed2, onInput: choirSetter("glide") });
    choirInputs.hallMix = makeSlider(c, { label: "Hall", min: 0, max: 1, step: 0.01, value: state.globals.hallMix, format: fmtPercent, onInput: choirSetter("hallMix") });
    choirInputs.hallTime = makeSlider(c, { label: "Hall time", min: 0.8, max: 9, step: 0.1, value: state.globals.hallTime, format: fmtSeconds, onInput: choirSetter("hallTime") });
    choirInputs.master = makeSlider(c, { label: "Volume", min: 0, max: 1.5, step: 0.01, value: state.globals.master, format: fmtPercent, onInput: choirSetter("master") });
    choirInputs.voicing = makeSelect(c, { label: "Several keys held", options: [["stack", "newest note leads"], ["chord", "split the chord"]], value: state.globals.voicing, onInput: choirSetter("voicing") });
    const head = document.createElement("h3");
    head.className = "sub";
    head.textContent = "Vowel orbit";
    head.title = "Each singer's mouth circles through vowel space on its own period";
    c.appendChild(head);
    choirInputs["osc.depth"] = makeSlider(c, { label: "Orbit size (vowels)", min: 0, max: 0.5, step: 0.01, value: state.globals["osc.depth"], format: fmtFixed2, onInput: choirSetter("osc.depth"), title: "How far along ooh–ow–ah–ayh–eeh each mouth swings" });
    choirInputs["osc.round"] = makeSlider(c, { label: "Orbit size (rounding)", min: 0, max: 1, step: 0.01, value: state.globals["osc.round"], format: fmtFixed2, onInput: choirSetter("osc.round"), title: "Lip rounding, a quarter cycle out of phase: the orbit becomes an ellipse" });
    choirInputs["osc.rateUi"] = makeSlider(c, { label: "Speed", min: 0, max: 1, step: 0.005, value: state.globals["osc.rateUi"], format: formatOscRate, onInput: setOscRate });
    choirInputs["osc.spread"] = makeSlider(c, { label: "Period spread", min: 0, max: 1, step: 0.01, value: state.globals["osc.spread"], format: fmtFixed2, onInput: choirSetter("osc.spread"), title: "In free mode: how different the singers' periods are" });
    choirInputs["osc.mode"] = makeSelect(c, { label: "Periods", options: [["free", "each singer free"], ["ratio", "polyrhythm ratios"], ["sync", "all together"]], value: state.globals["osc.mode"], onInput: choirSetter("osc.mode") });
    choirInputs["osc.shape"] = makeSelect(c, { label: "Motion", options: [["sine", "smooth (sine)"], ["triangle", "even (triangle)"], ["ramp", "yoi (ramp)"], ["step", "held vowels (step)"]], value: state.globals["osc.shape"], onInput: choirSetter("osc.shape") });
}

function oscRateFromUi(u) {
    return 0.05 * Math.pow(160.0, u);
}

function formatOscRate(u) {
    const r = oscRateFromUi(u);
    if (r < 1.0) {
        return (1.0 / r).toFixed(1) + " s period";
    }
    return r.toFixed(1) + " per s";
}

function setOscRate(u) {
    state.globals["osc.rateUi"] = u;
    state.globals["osc.rate"] = oscRateFromUi(u);
    post({ type: "choirGlobal", name: "osc.rate", value: oscRateFromUi(u) });
}

function setGlobalInput(name, value) {
    state.globals[name] = value;
    if (choirInputs[name] !== undefined) {
        choirInputs[name].value = String(value);
        choirInputs[name].dispatchEvent(new Event("input"));
    }
}

// ------------------------------------------------------------------ presets and singer table

function loadPreset(id) {
    const p = presetById(id);
    state.preset = p;
    const singers = [];
    for (let i = 0; i < p.singers.length; i = i + 1) {
        singers.push(Object.assign({}, p.singers[i]));
    }
    state.config = { singers: singers, voicing: p.voicing, hall: p.hall };
    $("preset-note").textContent = p.note;
    setGlobalInput("voicing", p.voicing);
    setGlobalInput("hallMix", p.hall.mix);
    setGlobalInput("hallTime", p.hall.rt60);
    state.selected = 0;
    state.mouths = [];
    post({ type: "allOff" });
    post({ type: "choirConfig", config: state.config });
    buildSingerTable();
    updatePadLabels();
    state.inspectDirty = true;
}

function onPresetChange(event) {
    loadPreset(event.target.value);
}

function buildPresetSelect() {
    const sel = $("preset");
    for (let i = 0; i < PRESETS.length; i = i + 1) {
        const o = document.createElement("option");
        o.value = PRESETS[i].id;
        o.textContent = PRESETS[i].name;
        sel.appendChild(o);
    }
    sel.addEventListener("change", onPresetChange);
}

function pushConfig() {
    post({ type: "choirConfig", config: state.config });
    state.inspectDirty = true;
}

function typeOptions() {
    const out = [["classic", "Classic monk body"]];
    const keys = Object.keys(VOICE_TYPES);
    for (let i = 0; i < keys.length; i = i + 1) {
        out.push([keys[i], VOICE_TYPES[keys[i]].label]);
    }
    return out;
}

function registerOptions() {
    const out = [];
    const keys = Object.keys(REGISTERS);
    for (let i = 0; i < keys.length; i = i + 1) {
        out.push([keys[i], REGISTERS[keys[i]].label]);
    }
    return out;
}

function tuningOptions() {
    const out = [];
    const keys = Object.keys(TUNINGS);
    for (let i = 0; i < keys.length; i = i + 1) {
        out.push([keys[i], TUNINGS[keys[i]]]);
    }
    return out;
}

function cellSelect(options, value, onChange) {
    const s = document.createElement("select");
    for (let i = 0; i < options.length; i = i + 1) {
        const o = document.createElement("option");
        o.value = options[i][0];
        o.textContent = options[i][1];
        s.appendChild(o);
    }
    s.value = value;
    s.addEventListener("change", onChange);
    return s;
}

function makeRowHandler(index, field, kind) {
    function handle(event) {
        let v = event.target.value;
        if (kind === "number") {
            v = Number(v);
        }
        if (field === "octave" && v !== "auto") {
            v = Number(v);
        }
        state.config.singers[index][field] = v;
        if (field === "register" && v === "falsetto" && state.config.singers[index].tuning === "none") {
            state.config.singers[index].tuning = "r1";
        }
        pushConfig();
        if (field === "type" || field === "register") {
            buildSingerTable();
        }
    }
    return handle;
}

function makeRemoveHandler(index) {
    function remove() {
        if (state.config.singers.length <= 1) {
            return;
        }
        state.config.singers.splice(index, 1);
        if (state.selected >= state.config.singers.length) {
            state.selected = state.config.singers.length - 1;
        }
        state.mouths = [];
        pushConfig();
        buildSingerTable();
    }
    return remove;
}

function makeSelectHandler(index) {
    function choose() {
        state.selected = index;
        state.inspectDirty = true;
        highlightRow();
    }
    return choose;
}

function addSinger() {
    if (state.config.singers.length >= 24) {
        return;
    }
    const last = state.config.singers[state.config.singers.length - 1];
    const s = Object.assign(makeSingerConfig("baritone", "chest", 0), { pan: Math.random() * 1.6 - 0.8, detune: (Math.random() - 0.5) * 12, onset: Math.random() * 0.1 });
    if (last !== undefined) {
        s.type = last.type;
        s.register = last.register;
        s.interval = last.interval;
        s.tuning = last.tuning;
    }
    state.config.singers.push(s);
    state.mouths = [];
    pushConfig();
    buildSingerTable();
}

function buildSingerTable() {
    const table = $("singer-table");
    table.innerHTML = "";
    const head = document.createElement("tr");
    const titles = ["", "Body", "Register", "Interval", "Octave", "Tuning", "Level", "Pan", ""];
    for (let i = 0; i < titles.length; i = i + 1) {
        const th = document.createElement("th");
        th.textContent = titles[i];
        head.appendChild(th);
    }
    table.appendChild(head);
    const singers = state.config.singers;
    for (let i = 0; i < singers.length; i = i + 1) {
        const s = singers[i];
        const tr = document.createElement("tr");
        tr.addEventListener("click", makeSelectHandler(i));
        const idx = document.createElement("td");
        idx.textContent = String(i + 1);
        tr.appendChild(idx);
        const t1 = document.createElement("td");
        t1.appendChild(cellSelect(typeOptions(), s.type, makeRowHandler(i, "type", "text")));
        tr.appendChild(t1);
        const t2 = document.createElement("td");
        t2.appendChild(cellSelect(registerOptions(), s.register, makeRowHandler(i, "register", "text")));
        tr.appendChild(t2);
        const t3 = document.createElement("td");
        const iv = document.createElement("input");
        iv.type = "number";
        iv.min = "-24";
        iv.max = "36";
        iv.step = "1";
        iv.value = String(s.interval);
        iv.title = "Semitones from the played note";
        iv.addEventListener("change", makeRowHandler(i, "interval", "number"));
        t3.appendChild(iv);
        tr.appendChild(t3);
        const t4 = document.createElement("td");
        t4.appendChild(cellSelect([["auto", "auto"], ["-2", "−2"], ["-1", "−1"], ["0", "0"], ["1", "+1"], ["2", "+2"]], String(s.octave), makeRowHandler(i, "octave", "text")));
        tr.appendChild(t4);
        const t5 = document.createElement("td");
        t5.appendChild(cellSelect(tuningOptions(), s.tuning, makeRowHandler(i, "tuning", "text")));
        tr.appendChild(t5);
        const t6 = document.createElement("td");
        const lv = document.createElement("input");
        lv.type = "range";
        lv.min = "0";
        lv.max = "4";
        lv.step = "0.05";
        lv.value = String(s.level);
        lv.addEventListener("input", makeRowHandler(i, "level", "number"));
        t6.appendChild(lv);
        tr.appendChild(t6);
        const t7 = document.createElement("td");
        const pv = document.createElement("input");
        pv.type = "range";
        pv.min = "-1";
        pv.max = "1";
        pv.step = "0.05";
        pv.value = String(s.pan);
        pv.addEventListener("input", makeRowHandler(i, "pan", "number"));
        t7.appendChild(pv);
        tr.appendChild(t7);
        const t8 = document.createElement("td");
        const rm = document.createElement("button");
        rm.className = "remove";
        rm.textContent = "×";
        rm.title = "Remove singer";
        rm.addEventListener("click", makeRemoveHandler(i));
        t8.appendChild(rm);
        tr.appendChild(t8);
        table.appendChild(tr);
    }
    $("singer-count").textContent = "(" + singers.length + ")";
    highlightRow();
}

function highlightRow() {
    const rows = $("singer-table").querySelectorAll("tr");
    for (let i = 1; i < rows.length; i = i + 1) {
        rows[i].classList.toggle("selected", i - 1 === state.selected);
    }
    $("inspect-name").textContent = "singer " + (state.selected + 1);
}

// ------------------------------------------------------------------ pad

function padMode() {
    if (state.mode === "classic") {
        return "classic";
    }
    if (state.preset.pad === "harmonic") {
        return "harmonic";
    }
    return "vowel";
}

function updatePadLabels() {
    const m = padMode();
    if (m === "classic") {
        $("pad-x-label").textContent = "pitch C3 → C4";
        $("pad-y-label").textContent = "vowel ooh → eeh ↑";
    } else if (m === "harmonic") {
        $("pad-x-label").textContent = "drone pitch C2 → C4";
        $("pad-y-label").textContent = "overtone harmonic ↑";
    } else {
        $("pad-x-label").textContent = "pitch C2 → C4";
        $("pad-y-label").textContent = "vowel ooh → eeh ↑";
    }
}

function padPointFromEvent(event) {
    const r = $("pad").getBoundingClientRect();
    let x = (event.clientX - r.left) / r.width;
    let y = 1.0 - (event.clientY - r.top) / r.height;
    x = Math.min(1, Math.max(0, x));
    y = Math.min(1, Math.max(0, y));
    return { x: x, y: y };
}

function harmonicForY(y) {
    return Math.round(5 + y * 11);
}

function applyPad(phase, p) {
    state.padPoint = p;
    state.padTrail.push({ x: p.x, y: p.y, t: performance.now() });
    if (state.padTrail.length > 60) {
        state.padTrail.shift();
    }
    const m = padMode();
    if (m === "classic") {
        post({ type: "classicPad", phase: phase, x: p.x, y: p.y });
        return;
    }
    const note = PAD_LOW_NOTE + PAD_SPAN * p.x;
    if (m === "harmonic") {
        const h = harmonicForY(p.y);
        if (h !== state.globals.harmonic) {
            setGlobalInput("harmonic", h);
        }
    } else {
        state.globals.vowel = p.y;
        post({ type: "choirGlobal", name: "vowel", value: p.y });
        if (choirInputs.vowel) {
            choirInputs.vowel.value = String(p.y);
            choirInputs.vowel.dispatchEvent(new Event("input"));
        }
    }
    post({ type: "choirPad", note: note, down: phase !== "up" });
}

function padDown(event) {
    ensureAudio();
    state.padDown = true;
    $("pad").setPointerCapture(event.pointerId);
    applyPad("down", padPointFromEvent(event));
}

function padMove(event) {
    if (!state.padDown) {
        return;
    }
    applyPad("move", padPointFromEvent(event));
}

function padUp(event) {
    if (!state.padDown) {
        return;
    }
    state.padDown = false;
    applyPad("up", padPointFromEvent(event));
}

function drawPad() {
    const canvas = $("pad");
    const ctx = fitCanvas(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#2a1b14");
    g.addColorStop(1, "#1a1310");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const m = padMode();
    ctx.font = "12px Georgia, serif";
    ctx.lineWidth = 1;
    if (m === "harmonic") {
        for (let k = 5; k <= 16; k = k + 1) {
            const y = h - ((k - 5) / 11) * h;
            ctx.strokeStyle = "rgba(242,207,107,0.16)";
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.fillStyle = "rgba(239,228,207,0.45)";
            ctx.fillText("#" + k, 6, Math.min(h - 5, Math.max(30, y - 4)));
        }
    } else {
        for (let i = 0; i < 5; i = i + 1) {
            const y = h - (i / 4) * h;
            ctx.strokeStyle = "rgba(242,207,107,0.14)";
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.fillStyle = "rgba(239,228,207,0.5)";
            ctx.fillText(VOWEL_NAMES[i], 6, Math.min(h - 5, Math.max(30, y - 4)));
        }
    }
    let octaves = 1;
    if (m !== "classic") {
        octaves = 2;
    }
    for (let k = 0; k <= 12 * octaves; k = k + 1) {
        const x = (k / (12 * octaves)) * w;
        const white = [0, 2, 4, 5, 7, 9, 11].indexOf(k % 12) >= 0;
        ctx.strokeStyle = white ? "rgba(239,228,207,0.07)" : "rgba(239,228,207,0.03)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        if (k % 12 === 0) {
            ctx.fillStyle = "rgba(239,228,207,0.45)";
            let base = 48;
            if (m !== "classic") {
                base = PAD_LOW_NOTE;
            }
            ctx.fillText(noteName(base + k), Math.min(w - 26, x + 4), 14);
        }
    }
    const now = performance.now();
    for (let i = 1; i < state.padTrail.length; i = i + 1) {
        const a = state.padTrail[i - 1];
        const b = state.padTrail[i];
        const age = (now - b.t) / 900;
        if (age > 1) {
            continue;
        }
        ctx.strokeStyle = "rgba(233,162,59," + (0.5 * (1 - age)).toFixed(3) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x * w, (1 - a.y) * h);
        ctx.lineTo(b.x * w, (1 - b.y) * h);
        ctx.stroke();
    }
    if (m === "vowel" && state.telemetry !== null) {
        for (let i = 0; i < state.telemetry.length; i = i + 1) {
            const t = state.telemetry[i];
            if (t.env < 0.03 || t.vowel === undefined) {
                continue;
            }
            const note = 69 + 12 * Math.log2(t.f0 / 440);
            const sx = Math.min(1, Math.max(0, (note - PAD_LOW_NOTE) / PAD_SPAN));
            ctx.beginPath();
            ctx.arc(sx * w, (1 - t.vowel) * h, 3 + 3 * t.env, 0, Math.PI * 2);
            ctx.fillStyle = DOT_COLORS[i % DOT_COLORS.length];
            ctx.globalAlpha = 0.85;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
    let px = state.padPoint.x;
    let py = state.padPoint.y;
    if (m === "classic" && !state.padDown) {
        px = state.classicTelemetry.pitch;
        py = state.classicTelemetry.vowel;
    }
    ctx.beginPath();
    ctx.arc(px * w, (1 - py) * h, state.padDown ? 11 : 7, 0, Math.PI * 2);
    ctx.fillStyle = state.padDown ? "#f2cf6b" : "rgba(242,207,107,0.5)";
    ctx.fill();
}

// ------------------------------------------------------------------ keyboard

const KEY_MAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16 };
const BASE_NOTE = 48;

function buildKeyboard() {
    const kb = $("keyboard");
    kb.innerHTML = "";
    const whiteCount = 15;
    const whites = [0, 2, 4, 5, 7, 9, 11];
    let wi = 0;
    for (let n = 0; n <= 24; n = n + 1) {
        const pc = n % 12;
        const isWhite = whites.indexOf(pc) >= 0;
        const key = document.createElement("div");
        key.className = "key " + (isWhite ? "white" : "black");
        key.dataset.offset = String(n);
        if (isWhite) {
            key.style.left = (wi / whiteCount * 100) + "%";
            key.style.width = (100 / whiteCount) + "%";
            if (pc === 0) {
                const lab = document.createElement("span");
                lab.className = "label";
                lab.textContent = "C" + (3 + Math.floor(n / 12));
                key.appendChild(lab);
            }
            wi = wi + 1;
        } else {
            key.style.left = ((wi - 0.32) / whiteCount * 100) + "%";
            key.style.width = (0.64 * 100 / whiteCount) + "%";
        }
        key.addEventListener("pointerdown", keyPointerDown);
        key.addEventListener("pointerup", keyPointerUp);
        key.addEventListener("pointerleave", keyPointerUp);
        kb.appendChild(key);
    }
}

function keyNote(el) {
    return BASE_NOTE + 12 * state.octave + Number(el.dataset.offset);
}

function keyPointerDown(event) {
    event.preventDefault();
    const el = event.currentTarget;
    el.dataset.playing = String(keyNote(el));
    noteOn(keyNote(el), 0.85);
}

function keyPointerUp(event) {
    const el = event.currentTarget;
    if (el.dataset.playing !== undefined && el.dataset.playing !== "") {
        noteOff(Number(el.dataset.playing));
        el.dataset.playing = "";
    }
}

function markKey(note, down) {
    const offset = note - BASE_NOTE - 12 * state.octave;
    const el = document.querySelector('.key[data-offset="' + offset + '"]');
    if (el !== null) {
        el.classList.toggle("down", down);
    }
}

function clearKeys() {
    const keys = document.querySelectorAll(".key.down");
    for (let i = 0; i < keys.length; i = i + 1) {
        keys[i].classList.remove("down");
    }
    state.keysDown = {};
    post({ type: "allOff" });
}

function keyDown(event) {
    if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") {
        return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }
    const k = event.key.toLowerCase();
    if (k === "z" || k === "x") {
        clearKeys();
        if (k === "z") {
            state.octave = Math.max(-2, state.octave - 1);
        } else {
            state.octave = Math.min(2, state.octave + 1);
        }
        return;
    }
    if (k === " " && state.mode === "song") {
        event.preventDefault();
        toggleSong();
        return;
    }
    if (KEY_MAP[k] === undefined || event.repeat || state.mode === "song") {
        return;
    }
    const note = BASE_NOTE + 12 * state.octave + KEY_MAP[k];
    state.keysDown[k] = note;
    noteOn(note, 0.85);
}

function keyUp(event) {
    const k = event.key.toLowerCase();
    if (state.keysDown[k] === undefined) {
        return;
    }
    noteOff(state.keysDown[k]);
    delete state.keysDown[k];
}

// ------------------------------------------------------------------ MIDI

function onMidiMessage(event) {
    const d = event.data;
    const status = d[0] & 0xf0;
    if (status === 0x90 && d[2] > 0) {
        noteOn(d[1], d[2] / 127);
    } else if (status === 0x80 || (status === 0x90 && d[2] === 0)) {
        noteOff(d[1]);
    } else if (status === 0xe0) {
        const bend = (((d[2] << 7) | d[1]) - 8192) / 8192;
        post({ type: "classicParam", name: "bend", value: bend * 2.0 });
        post({ type: "choirGlobal", name: "bend", value: bend * 2.0 });
    } else if (status === 0xb0) {
        const v = d[2] / 127;
        if (d[1] === 1) {
            post({ type: "classicParam", name: "vibrato", value: v });
        } else if (d[1] === 5) {
            post({ type: "classicParam", name: "glide", value: v });
        } else if (d[1] === 12) {
            post({ type: "classicParam", name: "delayMix", value: v });
        } else if (d[1] === 13) {
            post({ type: "classicParam", name: "voice", value: v });
        } else if (d[1] === 74) {
            post({ type: "classicParam", name: "vowel", value: v });
            setGlobalInput("vowel", v);
        }
    }
}

async function enableMidi() {
    if (navigator.requestMIDIAccess === undefined) {
        $("midi-button").textContent = "No MIDI here";
        return;
    }
    try {
        const access = await navigator.requestMIDIAccess();
        let count = 0;
        const inputs = access.inputs.values();
        let it = inputs.next();
        while (!it.done) {
            it.value.onmidimessage = onMidiMessage;
            count = count + 1;
            it = inputs.next();
        }
        $("midi-button").textContent = "MIDI · " + count;
        $("midi-button").classList.add("on");
        ensureAudio();
    } catch (err) {
        $("midi-button").textContent = "MIDI blocked";
    }
}

// ------------------------------------------------------------------ drawing helpers

function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

// A seated monk in flat woodblock style. The mouth is the singer's actual
// jaw opening, lip aperture and rounding; the nose glows when the velum opens.
function drawMonk(ctx, cx, ground, size, mouth, active, selected, hue) {
    const headR = 0.36 * size;
    const headY = ground - 1.55 * size;
    // sound rings
    if (active > 0.02) {
        for (let k = 1; k <= 3; k = k + 1) {
            const r = headR * (1.2 + 0.55 * k + 0.25 * ((performance.now() / 600 + k * 0.33) % 1));
            ctx.strokeStyle = "rgba(242,207,107," + (0.18 * active / k).toFixed(3) + ")";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, headY + headR * 0.3, r, -0.6, 0.6);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, headY + headR * 0.3, r, Math.PI - 0.6, Math.PI + 0.6);
            ctx.stroke();
        }
    }
    // robe: a broad seated bell
    ctx.fillStyle = hue.robe;
    ctx.beginPath();
    ctx.moveTo(cx - 0.95 * size, ground);
    ctx.quadraticCurveTo(cx - 0.9 * size, ground - 1.05 * size, cx - 0.42 * size, ground - 1.18 * size);
    ctx.lineTo(cx + 0.42 * size, ground - 1.18 * size);
    ctx.quadraticCurveTo(cx + 0.9 * size, ground - 1.05 * size, cx + 0.95 * size, ground);
    ctx.closePath();
    ctx.fill();
    // shawl over one shoulder
    ctx.fillStyle = hue.shawl;
    ctx.beginPath();
    ctx.moveTo(cx - 0.42 * size, ground - 1.18 * size);
    ctx.lineTo(cx - 0.05 * size, ground - 1.18 * size);
    ctx.lineTo(cx + 0.7 * size, ground - 0.15 * size);
    ctx.lineTo(cx + 0.35 * size, ground);
    ctx.lineTo(cx - 0.2 * size, ground);
    ctx.quadraticCurveTo(cx - 0.75 * size, ground - 0.7 * size, cx - 0.42 * size, ground - 1.18 * size);
    ctx.fill();
    // folded hands
    ctx.fillStyle = hue.skin;
    ctx.beginPath();
    ctx.ellipse(cx, ground - 0.42 * size, 0.2 * size, 0.1 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    // neck and head
    ctx.fillStyle = hue.skin;
    ctx.fillRect(cx - 0.11 * size, headY + headR * 0.7, 0.22 * size, 0.25 * size);
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.98, headY + headR * 0.05, headR * 0.16, headR * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + headR * 0.98, headY + headR * 0.05, headR * 0.16, headR * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    // highlight on the shaved head
    ctx.fillStyle = "rgba(255,240,215,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.3, headY - headR * 0.45, headR * 0.35, headR * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // closed eyes
    ctx.strokeStyle = "#3a2516";
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.beginPath();
    ctx.arc(cx - headR * 0.36, headY - headR * 0.02, headR * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + headR * 0.36, headY - headR * 0.02, headR * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // nose: glows with nasal flow
    ctx.fillStyle = "rgba(242,207,107," + (0.9 * mouth.velum * active).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.22, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    const open = Math.max(0.02, mouth.jaw * active);
    const width = headR * (0.18 + 0.4 * mouth.lip * (1.0 - 0.45 * mouth.protrusion));
    const height = headR * (0.03 + 0.4 * open) * (0.4 + 0.6 * Math.min(1, mouth.lip * 1.6));
    ctx.fillStyle = "#3a160f";
    ctx.beginPath();
    ctx.ellipse(cx, headY + headR * 0.5, width, Math.max(height, headR * 0.025), 0, 0, Math.PI * 2);
    ctx.fill();
    if (mouth.protrusion > 0.35) {
        ctx.strokeStyle = "rgba(140,47,34,0.8)";
        ctx.lineWidth = Math.max(1, headR * 0.06 * mouth.protrusion);
        ctx.stroke();
    }
    if (selected) {
        ctx.strokeStyle = "#f2cf6b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 0.6 * size, ground + 5);
        ctx.lineTo(cx + 0.6 * size, ground + 5);
        ctx.stroke();
    }
}

const HUES = [
    { robe: "#8c2f22", shawl: "#d98c2b", skin: "#c99263" },
    { robe: "#7a2a20", shawl: "#e3a23f", skin: "#b98256" },
    { robe: "#933826", shawl: "#c97d24", skin: "#d1a074" },
    { robe: "#6e251c", shawl: "#e9b04f", skin: "#a8744b" }
];

function smoothMouth(i, target) {
    if (state.mouths[i] === undefined) {
        state.mouths[i] = { jaw: target.jaw, lip: target.lip, protrusion: target.protrusion, velum: target.velum, active: target.active };
    }
    const m = state.mouths[i];
    const k = 0.35;
    m.jaw = m.jaw + (target.jaw - m.jaw) * k;
    m.lip = m.lip + (target.lip - m.lip) * k;
    m.protrusion = m.protrusion + (target.protrusion - m.protrusion) * k;
    m.velum = m.velum + (target.velum - m.velum) * k;
    m.active = m.active + (target.active - m.active) * k;
    return m;
}

const stageLayout = [];

function drawStage() {
    const canvas = $("stage");
    const ctx = fitCanvas(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    // floor
    ctx.fillStyle = "rgba(233,162,59,0.06)";
    ctx.fillRect(0, h - 26, w, 26);
    stageLayout.length = 0;
    if (state.mode === "song") {
        drawSongStage(ctx, w, h, state.song, drawMonk, smoothMouth, HUES);
        const sec = state.song.sections[state.song.telemetry !== null ? state.song.telemetry.section : 0];
        $("stage-caption").textContent = sec.name + ". " + sec.text;
        return;
    }
    if (state.mode === "classic") {
        const t = state.classicTelemetry;
        const art = makeArticulation();
        vowelArticulation(t.vowel, art);
        const active = t.active ? 1 : 0;
        const mouth = smoothMouth(0, { jaw: art.jaw, lip: art.lipAperture, protrusion: art.lipProtrusion, velum: 0, active: active });
        drawMonk(ctx, w / 2, h - 18, Math.min(110, h * 0.55), mouth, mouth.active, false, HUES[0]);
        const pitch = 48 + 12 * t.pitch;
        let caption = "One monk. Vowel " + formatVowel(t.vowel) + ".";
        if (t.active) {
            caption = "Singing " + noteName(pitch) + " on “" + formatVowel(t.vowel) + "”.";
        }
        $("stage-caption").textContent = caption;
        return;
    }
    const singers = state.config.singers;
    const n = singers.length;
    const tel = state.telemetry;
    let rows = 1;
    if (n > 8 || (n > 3 && w / n < 80)) {
        rows = 2;
    }
    const perRow = Math.ceil(n / rows);
    let sounding = 0;
    stageLayout.length = n;
    // Back row first so the front row overlaps it.
    for (let pass = 0; pass < 2; pass = pass + 1) {
        for (let i = 0; i < n; i = i + 1) {
            let row = 1;
            if (rows === 2 && i % 2 === 1) {
                row = 0;
            }
            if ((pass === 0 && row !== 0) || (pass === 1 && row !== 1)) {
                continue;
            }
            let col = i;
            let slots = n;
            if (rows === 2) {
                col = Math.floor(i / 2);
                slots = perRow;
            }
            let x = (col + 0.5) / slots * w;
            const frontSize = Math.min(w / slots * 0.42, h * 0.32);
            let ground = h - 18;
            let depth = 1.0;
            if (row === 0) {
                x = x + w / (2 * slots);
                if (x > w - frontSize * 0.5) {
                    x = x - w / slots;
                }
                ground = h - 18 - 0.75 * frontSize;
                depth = 0.8;
            }
            let length = 17;
            let target = { jaw: 0.2, lip: 0.4, protrusion: 0.2, velum: 0, active: 0 };
            if (tel !== null && tel[i] !== undefined) {
                const s = tel[i];
                length = s.length;
                target = { jaw: s.jaw, lip: s.lip, protrusion: s.protrusion, velum: s.velum, active: Math.min(1, s.env * 1.2) };
                if (s.env > 0.05) {
                    sounding = sounding + 1;
                }
            }
            const bodySize = Math.pow(length / 17.0, 1.4);
            const size = frontSize * bodySize * depth;
            const mouth = smoothMouth(i, target);
            drawMonk(ctx, x, ground, size, mouth, mouth.active, i === state.selected, HUES[i % HUES.length]);
            stageLayout[i] = { x: x, y: ground - size, r: size };
        }
    }
    let caption = n + " singers. Click one to look inside.";
    if (tel !== null && sounding > 0) {
        const pitches = [];
        for (let i = 0; i < tel.length && pitches.length < 10; i = i + 1) {
            if (tel[i].env > 0.05) {
                const name = noteName(69 + 12 * Math.log2(tel[i].f0 / 440));
                if (pitches.indexOf(name.replace(/[+−]\d+¢/, "")) < 0) {
                    pitches.push(name.replace(/[+−]\d+¢/, ""));
                }
            }
        }
        caption = sounding + " of " + n + " singing: " + pitches.join(" · ");
    }
    $("stage-caption").textContent = caption;
}

function stageClick(event) {
    if (state.mode !== "choir") {
        return;
    }
    const r = $("stage").getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    let best = -1;
    let bestD = 1e9;
    for (let i = 0; i < stageLayout.length; i = i + 1) {
        const d = Math.hypot(x - stageLayout[i].x, y - stageLayout[i].y);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    if (best >= 0) {
        state.selected = best;
        state.inspectDirty = true;
        highlightRow();
    }
}

// ------------------------------------------------------------------ inspector

const inspectAreas = new Float64Array(SECTIONS);
const inspectSeg = {};
const inspectCurve = new Float64Array(240);
const inspectSlots = makeFormantSlots(4);

function drawInspector() {
    if (state.mode !== "choir") {
        return;
    }
    const now = performance.now();
    if (!state.inspectDirty || now - state.lastInspect < 66) {
        return;
    }
    state.inspectDirty = false;
    state.lastInspect = now;
    const cfg = state.config.singers[state.selected];
    if (cfg === undefined) {
        return;
    }
    const anatomy = anatomyFor(Object.assign(makeSingerConfig(cfg.type, cfg.register, 0), cfg));
    const art = makeArticulation();
    let tel = null;
    if (state.telemetry !== null && state.telemetry[state.selected] !== undefined) {
        tel = state.telemetry[state.selected];
        art.jaw = tel.jaw;
        art.lipAperture = tel.lip;
        art.lipProtrusion = tel.protrusion;
        art.tonguePos = tel.tongue;
        art.tongueHeight = tel.tongueHeight;
        art.velum = tel.velum;
        art.tipPos = tel.tipPos;
        art.tipClose = tel.tipClose;
        art.epilarynx = tel.epilarynx;
        art.larynx = tel.larynx;
    } else {
        vowelArticulation(state.globals.vowel, art);
    }
    const L = areaFunction(anatomy, art, inspectAreas, inspectSeg);
    const tickRate = SECTIONS * SPEED_OF_SOUND / L;
    const pole = radiationPole(lipRadius(inspectAreas), tickRate, SPEED_OF_SOUND);
    drawTube(L, art);
    const maxHz = 4000;
    responseCurve(inspectAreas, tickRate, 0.95, pole, maxHz, inspectCurve.length, inspectCurve);
    const found = findFormants(inspectAreas, tickRate, 0.95, pole, maxHz, 3, inspectSlots);
    let f0 = 0;
    if (tel !== null) {
        f0 = tel.f0;
    }
    drawSpectrum(maxHz, f0, tel, cfg);
    const reg = REGISTERS[cfg.register];
    const rows = [
        ["Body", cfg.type === "classic" ? "classic monk" : VOICE_TYPES[cfg.type].label],
        ["Tract", L.toFixed(1) + " cm"],
        ["Pitch", f0 > 0 ? noteName(69 + 12 * Math.log2(f0 / 440)) + " · " + f0.toFixed(1) + " Hz" : "—"],
        ["Register", reg.label],
        ["F1", found > 0 ? inspectSlots[0].f.toFixed(0) + " Hz" : "—"],
        ["F2", found > 1 ? inspectSlots[1].f.toFixed(0) + " Hz" : "—"],
        ["F3", found > 2 ? inspectSlots[2].f.toFixed(0) + " Hz" : "—"],
        ["Open quotient", tel !== null ? tel.oq.toFixed(2) : reg.oq.toFixed(2)],
        ["Half tone", tel !== null ? Math.round(tel.vent * 100) + "%" : Math.round(reg.vent * 100) + "%"],
        ["Vowel orbit", tel !== null && tel.oscRate > 0 && (state.globals["osc.depth"] > 0 || state.globals["osc.round"] > 0) ? (1 / tel.oscRate).toFixed(2) + " s period" : "still"],
        ["Tuning", TUNINGS[cfg.tuning] + (cfg.tuning === "overtone" || cfg.tuning === "sygyt" ? " #" + state.globals.harmonic : "")]
    ];
    const dl = $("readout");
    dl.innerHTML = "";
    for (let i = 0; i < rows.length; i = i + 1) {
        const dt = document.createElement("dt");
        dt.textContent = rows[i][0];
        const dd = document.createElement("dd");
        dd.textContent = rows[i][1];
        dl.appendChild(dt);
        dl.appendChild(dd);
    }
}

function drawTube(L, art) {
    const canvas = $("tube");
    const ctx = fitCanvas(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const mid = h * 0.55;
    const left = 34;
    const right = w - 34;
    const scaleX = (right - left) / 20.0; // 20 cm across
    const scaleR = h * 0.17;
    ctx.fillStyle = "rgba(140,47,34,0.85)";
    ctx.beginPath();
    for (let i = 0; i < SECTIONS; i = i + 1) {
        const x = left + (i + 0.5) / SECTIONS * L * scaleX;
        const r = Math.sqrt(inspectAreas[i] / Math.PI) * scaleR;
        if (i === 0) {
            ctx.moveTo(x, mid - r);
        } else {
            ctx.lineTo(x, mid - r);
        }
    }
    for (let i = SECTIONS - 1; i >= 0; i = i - 1) {
        const x = left + (i + 0.5) / SECTIONS * L * scaleX;
        const r = Math.sqrt(inspectAreas[i] / Math.PI) * scaleR;
        ctx.lineTo(x, mid + r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e9a23b";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // velum and nasal port
    const vx = left + inspectSeg.pharynx * scaleX;
    ctx.strokeStyle = "rgba(239,228,207,0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(vx, 8);
    ctx.lineTo(vx, h - 16);
    ctx.stroke();
    ctx.setLineDash([]);
    if (art.velum > 0.02) {
        ctx.fillStyle = "rgba(242,207,107," + (0.3 + 0.6 * art.velum).toFixed(2) + ")";
        ctx.fillRect(vx - 3, 8, 6, mid - 8 - Math.sqrt(inspectAreas[Math.min(SECTIONS - 1, Math.round(inspectSeg.pharynx / L * SECTIONS))] / Math.PI) * scaleR);
    }
    ctx.fillStyle = "rgba(239,228,207,0.6)";
    ctx.font = "11px Georgia, serif";
    ctx.fillText("glottis", 4, h - 4);
    ctx.fillText("velum", vx - 14, h - 4);
    const lipX = left + L * scaleX;
    ctx.fillText("lips · " + L.toFixed(1) + " cm", Math.min(w - 80, lipX - 30), h - 4);
}

function drawSpectrum(maxHz, f0, tel, cfg) {
    const canvas = $("spectrum");
    const ctx = fitCanvas(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    let peak = -1e9;
    for (let i = 0; i < inspectCurve.length; i = i + 1) {
        peak = Math.max(peak, inspectCurve[i]);
    }
    const range = 45;
    function yOf(db) {
        return 10 + (1 - Math.max(0, db - (peak - range)) / range) * (h - 28);
    }
    function xOf(f) {
        return 6 + f / maxHz * (w - 12);
    }
    function curveAt(f) {
        const p = f / maxHz * (inspectCurve.length - 1);
        const i = Math.min(inspectCurve.length - 2, Math.floor(p));
        const t = p - i;
        return inspectCurve[i] * (1 - t) + inspectCurve[i + 1] * t;
    }
    // harmonics of the voice, weighted by the tube
    if (f0 > 20) {
        for (let k = 1; k * f0 < maxHz; k = k + 1) {
            const f = k * f0;
            ctx.strokeStyle = "rgba(111,181,154,0.55)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xOf(f), h - 18);
            ctx.lineTo(xOf(f), yOf(curveAt(f) - 12 * Math.log2(k)));
            ctx.stroke();
        }
    }
    ctx.strokeStyle = "#e9a23b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < inspectCurve.length; i = i + 1) {
        const f = maxHz * i / (inspectCurve.length - 1);
        if (i === 0) {
            ctx.moveTo(xOf(f), yOf(inspectCurve[i]));
        } else {
            ctx.lineTo(xOf(f), yOf(inspectCurve[i]));
        }
    }
    ctx.stroke();
    // tuning targets
    const targets = [];
    if (f0 > 20) {
        if (cfg.tuning === "overtone" || cfg.tuning === "sygyt") {
            targets.push(state.globals.harmonic * f0);
        } else if (cfg.tuning === "gyuto") {
            targets.push(5 * f0);
            targets.push(10 * f0);
        } else if (cfg.tuning === "r1") {
            targets.push(1.1 * f0);
        }
    }
    ctx.strokeStyle = "#f2cf6b";
    ctx.setLineDash([4, 3]);
    for (let i = 0; i < targets.length; i = i + 1) {
        ctx.beginPath();
        ctx.moveTo(xOf(targets[i]), 6);
        ctx.lineTo(xOf(targets[i]), h - 18);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239,228,207,0.55)";
    ctx.font = "11px Georgia, serif";
    for (let f = 0; f <= maxHz; f = f + 1000) {
        ctx.fillText(f === 0 ? "0" : (f / 1000) + " kHz", Math.min(w - 34, xOf(f) + 2), h - 4);
    }
}

// ------------------------------------------------------------------ decomposition table

function buildFitTable() {
    const table = $("fit-table");
    const head = document.createElement("tr");
    const titles = ["Vowel", "Classic F1 / F2 / F3", "Tube F1 / F2 / F3", "Tongue place", "Tongue height", "Jaw", "Lips open", "Lips rounded"];
    for (let i = 0; i < titles.length; i = i + 1) {
        const th = document.createElement("th");
        th.textContent = titles[i];
        head.appendChild(th);
    }
    table.appendChild(head);
    for (let v = 0; v < VOWEL_SHAPES.length; v = v + 1) {
        const s = VOWEL_SHAPES[v];
        const tr = document.createElement("tr");
        const cells = [
            s.name,
            s.target.join(" / "),
            s.fitted[0].toFixed(0) + " / " + s.fitted[1].toFixed(0) + " / " + s.fitted[2].toFixed(0),
            s.tonguePos.toFixed(2), s.tongueHeight.toFixed(2), s.jaw.toFixed(2), s.lipAperture.toFixed(2), s.lipProtrusion.toFixed(2)
        ];
        for (let i = 0; i < cells.length; i = i + 1) {
            const td = document.createElement("td");
            td.textContent = cells[i];
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    const art = makeArticulation();
    vowelArticulation(0.5, art);
    const seg = segmentLengths(CLASSIC_BODY, art, {});
    $("fit-body").textContent = "The body that fits: pharynx " + CLASSIC_BODY.pharynx.toFixed(1) + " cm, mouth " + CLASSIC_BODY.oral.toFixed(1) + " cm, " + seg.total.toFixed(1) + " cm in all on “ah” (an adult man’s tract is typically about 17 cm). Formant fits within 1.6%; the tongue/jaw/lip values are one solution among several, since three formants do not fix a mouth shape uniquely.";
}

// ------------------------------------------------------------------ loop and start

function frame() {
    if (state.mode === "song") {
        drawScore($("score"), fitCanvas($("score")), state.song);
        $("song-time").textContent = songTimeText(state.song.time);
        const items = $("song-sections").children;
        const now = state.song.telemetry !== null ? state.song.telemetry.section : 0;
        for (let i = 0; i < items.length; i = i + 1) {
            items[i].classList.toggle("now", i === now);
        }
    } else {
        drawPad();
    }
    drawStage();
    drawInspector();
    requestAnimationFrame(frame);
}

function init() {
    buildClassicControls();
    buildChoirControls();
    buildPresetSelect();
    buildKeyboard();
    buildFitTable();
    loadPreset(PRESETS[0].id);
    $("mode-classic").addEventListener("click", selectClassic);
    $("mode-choir").addEventListener("click", selectChoir);
    $("mode-song").addEventListener("click", selectSong);
    loadSongView("passacaglia");
    $("song-play").addEventListener("click", toggleSong);
    $("song-select").addEventListener("change", onSongSelect);
    $("score").addEventListener("click", onScoreClick);
    $("power").addEventListener("click", startAudio);
    $("midi-button").addEventListener("click", enableMidi);
    $("add-singer").addEventListener("click", addSinger);
    $("pad").addEventListener("pointerdown", padDown);
    $("pad").addEventListener("pointermove", padMove);
    $("pad").addEventListener("pointerup", padUp);
    $("pad").addEventListener("pointercancel", padUp);
    $("stage").addEventListener("click", stageClick);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    setMode("classic");
    requestAnimationFrame(frame);
}

init();

export { foldIntoRange, noteToHz };
