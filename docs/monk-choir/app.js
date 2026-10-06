// Page: audio start-up, pad, keyboard, MIDI, controls, stage and inspector.

import { PRESETS, presetById } from "./engine/presets.js?v=b361b40e76";
import { makeSingerConfig, anatomyFor, foldIntoRange } from "./engine/choir.js?v=4bc8bf7bb1";
import { VOICE_TYPES, SECTIONS, SPEED_OF_SOUND, makeArticulation, areaFunction, lipRadius, segmentLengths, nasalAreas, velumJunction, velumArea } from "./engine/anatomy.js?v=9500908dbe";
import { MouthMap, MAP_STEPS, MELODIES, ORNAMENTS, PATTERNS, STYLES, isMapTuning, isHarmonicTuning } from "./engine/throat.js?v=fe3040c8de";
import { makeBranchShape, prepareBranch, branchMagnitudeDb } from "./engine/branch.js?v=0f96a77061";
import { REGISTERS } from "./engine/glottis.js?v=0fdd116a83";
import { radiationPole } from "./engine/tract.js?v=dcd3b7ef73";
import { responseCurve, findFormants, makeFormantSlots } from "./engine/analysis.js?v=0ada426f71";
import { vowelArticulation, noteToHz, Singer } from "./engine/singer.js?v=9b9f347a8e";
import { VOWEL_SHAPES, CLASSIC_BODY } from "./engine/vowels.js?v=260f005eba";
import { ROLMO } from "./engine/song.js?v=e49e4b97a0";
import { FUGUE } from "./engine/songs/fugue.js?v=b5027baa3f";
import { PASSACAGLIA } from "./engine/songs/passacaglia.js?v=8df5d5be15";
import { STEPPE } from "./engine/songs/steppe.js?v=8a12da2d87";
import { TENORE } from "./engine/songs/tenore.js?v=8ae6bf56eb";
import { OM } from "./engine/songs/om.js?v=873747865d";
import { drawSongStage, drawScore, buildSongPanel, songTimeText, scoreSeekTime } from "./songview.js?v=796a5dfe4d";
import { buildHdrPanel, drawHdrMeters, makeSpectrogram, drawSpectrogram } from "./hdrview.js?v=759f7d561e";
import { ROOMS, MATERIALS, eyring, defaultRoomSettings } from "./engine/room.js?v=8963a58369";

const SONGS = { passacaglia: PASSACAGLIA, fugue: FUGUE, rolmo: ROLMO, steppe: STEPPE, tenore: TENORE, om: OM };
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
    startPromise: null,   // the audio start in progress
    pending: [],          // messages posted while the engine loads
    padDown: false,
    padPoint: { x: 0.5, y: 0.5 },
    padTrail: [],
    keysDown: {},
    mouths: [],
    inspectDirty: true,
    lastInspect: 0,
    song: null,
    hdr: null,
    hdrTelemetry: null,
    analyser: null,
    spectrogram: null,
    songId: "passacaglia",
    songReady: false,
    room: defaultRoomSettings()
};

const VOWEL_NAMES = ["ooh", "ow", "ah", "ayh", "eeh"];
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const TUNINGS = { none: "—", r1: "F1 follows pitch", overtone: "khöömei", sygyt: "sygyt", gyuto: "Gyuto chord", labial: "labial map", nasal: "nasal map", throat: "throat map", vowel: "kargyraa vowel walk", focus: "two-constriction focus" };
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
    } else if (state.startPromise !== null) {
        // the engine is still loading: keep the message (a first key press)
        state.pending.push(message);
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
    // One start only, however many clicks and key presses arrive meanwhile.
    if (state.startPromise === null) {
        state.startPromise = openAudio();
    }
    await state.startPromise;
}

async function openAudio() {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule("./worklet.js?v=220e1d3392");
    const node = new AudioWorkletNode(ctx, "monk-processor", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    node.connect(limiter);
    limiter.connect(ctx.destination);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.0;
    analyser.minDecibels = -150;
    analyser.maxDecibels = 0;
    node.connect(analyser);
    state.analyser = analyser;
    node.port.onmessage = receiveTelemetry;
    state.audio = ctx;
    state.node = node;
    state.started = true;
    syncEngine();
    for (let i = 0; i < state.pending.length; i = i + 1) {
        node.port.postMessage(state.pending[i]);
    }
    state.pending = [];
    await ctx.resume();
    $("power").textContent = "Sound on";
    $("power").classList.add("on");
}

function syncEngine() {
    post({ type: "mode", mode: state.mode });
    post({ type: "room", settings: state.room });
    if (state.hdr !== null) {
        state.hdr.sync();
    }
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
    if (m.mode === "hdr") {
        state.hdrTelemetry = m;
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
    state.lastNote = note;
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
    const modes = ["classic", "choir", "song", "hdr"];
    for (let i = 0; i < modes.length; i = i + 1) {
        $("mode-" + modes[i]).classList.toggle("on", mode === modes[i]);
        $("mode-" + modes[i]).setAttribute("aria-selected", String(mode === modes[i]));
    }
    $("classic-panel").classList.toggle("hidden", mode !== "classic");
    $("choir-panel").classList.toggle("hidden", mode !== "choir");
    $("inspector").classList.toggle("hidden", mode !== "choir");
    $("song-panel").classList.toggle("hidden", mode !== "song");
    $("hdr-panel").classList.toggle("hidden", mode !== "hdr");
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

function selectHdr() {
    setMode("hdr");
}

// ------------------------------------------------------------------ room

function buildRoomBar() {
    const preset = $("room-preset");
    const classic = document.createElement("option");
    classic.value = "classic";
    classic.textContent = "Classic hall (reverb only)";
    preset.appendChild(classic);
    const keys = Object.keys(ROOMS);
    for (let i = 0; i < keys.length; i = i + 1) {
        const o = document.createElement("option");
        o.value = keys[i];
        o.textContent = ROOMS[keys[i]].label;
        preset.appendChild(o);
    }
    preset.value = state.room.preset;
    const floor = $("room-floor");
    const floors = [["room", "as built"], ["stone", "stone"], ["dais", "wooden dais"], ["carpet", "carpet"], ["earth", "earth / grass"]];
    for (let i = 0; i < floors.length; i = i + 1) {
        const o = document.createElement("option");
        o.value = floors[i][0];
        o.textContent = floors[i][1];
        floor.appendChild(o);
    }
    floor.value = state.room.floor;
    preset.addEventListener("change", onRoomPreset);
    floor.addEventListener("change", onRoomChange);
    $("room-posture").addEventListener("change", onRoomChange);
    $("room-distance").addEventListener("input", onRoomDistance);
    $("room-distance").addEventListener("change", onRoomChange);
    onRoomPreset();
}

function onRoomPreset() {
    const p = $("room-preset").value;
    if (p !== "classic") {
        $("room-distance").value = String(ROOMS[p].listenerDistance);
    }
    onRoomDistance();
    onRoomChange();
}

function onRoomDistance() {
    $("room-distance-out").textContent = Number($("room-distance").value).toFixed(1) + " m";
}

function onRoomChange() {
    state.room = {
        preset: $("room-preset").value,
        floor: $("room-floor").value,
        posture: $("room-posture").value,
        distance: Number($("room-distance").value)
    };
    const disabled = state.room.preset === "classic";
    $("room-floor").disabled = disabled;
    $("room-posture").disabled = disabled;
    $("room-distance").disabled = disabled;
    if (disabled) {
        $("room-info").textContent = "The original feedback-delay hall.";
    } else {
        const r = Object.assign({}, ROOMS[state.room.preset]);
        if (state.room.floor !== "room") {
            r.floor = state.room.floor;
        }
        const t = eyring(r);
        const floorName = MATERIALS[r.floor].label.toLowerCase();
        if (r.walls === "open") {
            $("room-info").textContent = "No walls or ceiling: the direct sound and the " + floorName + " floor's reflection only. Move the singers between seated and standing to hear the floor's comb notches move.";
        } else {
            $("room-info").textContent = r.dims.join(" × ") + " m, " + floorName + " floor · decay " + (0.5 * (t[2] + t[3])).toFixed(1) + " s mid, " + t[0].toFixed(1) + " s low, " + t[5].toFixed(1) + " s high" + (r.floor === "dais" ? " · the dais rings at 38, 54, 72 Hz…" : "");
        }
    }
    post({ type: "room", settings: state.room });
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
        refreshMonkPanel();
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
    refreshMonkPanel();
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
        singers.push(copySinger(p.singers[i]));
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

// The preset's "own" overrides are an object: copy it so edits stay per monk.
function copySinger(src) {
    const s = Object.assign({}, src);
    s.own = Object.assign({}, makeSingerConfig("baritone", "chest", 0).own, src.own || {});
    return s;
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
    const titles = ["", "Body", "Register", "Interval", "Octave", "Tuning", "Level", "Pan", "Pitch", ""];
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
        lv.max = "10";
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
        const tp = document.createElement("td");
        tp.className = "pitch-badge";
        tp.textContent = pitchBadge(s);
        if (s.pitchMode !== undefined && s.pitchMode !== "follow") {
            tp.classList.add("own");
        }
        tr.appendChild(tp);
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
    refreshMonkPanel();
}

// ------------------------------------------------------------------ the selected monk's own controls

const KEY_MODES = [["major", "major"], ["minor", "minor"], ["dorian", "dorian"], ["phrygian", "phrygian"], ["mixolydian", "mixolydian"], ["pentatonic major", "pentatonic major"], ["pentatonic minor", "pentatonic minor"]];
const KEY_MODE_SHORT = { major: "maj", minor: "min", dorian: "dor", phrygian: "phr", mixolydian: "mix", "pentatonic major": "pent maj", "pentatonic minor": "pent min" };

function orbitRateToUi(r) {
    return Math.max(0, Math.min(1, Math.log(r / 0.05) / Math.log(160.0)));
}

// What the monk does when it follows the ensemble, for each own control.
const OWN_CONTROLS = [
    { key: "vowel", label: "Vowel", min: 0, max: 1, step: 0.005, format: formatVowel, ensemble: function (cfg) { return state.globals.vowel; } },
    { key: "hum", label: "Om (close to hum)", min: 0, max: 1, step: 0.01, format: fmtPercent, ensemble: function (cfg) { return state.globals.hum; } },
    { key: "halftone", label: "Half tone", min: 0, max: 1, step: 0.01, format: fmtPercent, ensemble: function (cfg) { return state.globals.halftone; } },
    { key: "effort", label: "Effort", min: 0.2, max: 1, step: 0.01, format: fmtFixed2, ensemble: function (cfg) { return Math.min(1, cfg.effort * state.globals.effort); } },
    { key: "vibrato", label: "Vibrato (semitones)", min: 0, max: 1, step: 0.01, format: fmtFixed2, ensemble: function (cfg) { return cfg.vibratoDepth; } },
    { key: "orbitDepth", label: "Orbit size", min: 0, max: 0.5, step: 0.01, format: fmtFixed2, ensemble: function (cfg) { return cfg.oscDepth !== null && cfg.oscDepth !== undefined ? cfg.oscDepth : state.globals["osc.depth"]; } },
    { key: "orbitRate", label: "Orbit speed", min: 0, max: 1, step: 0.005, format: formatOscRate, ui: true, ensemble: function (cfg) { return state.globals["osc.rate"]; } },
    { key: "harmonic", label: "Overtone harmonic", min: 2, max: 16, step: 1, format: formatHarmonic, ensemble: function (cfg) { return isHarmonicTuning(cfg.tuning) ? state.globals.harmonic : cfg.harmonic; } }
];

const monkInputs = {};

function pitchBadge(cfg) {
    if (cfg.pitchMode === "lock") {
        return "🔒 " + noteName(cfg.lockNote) + (cfg.drone ? " drone" : "");
    }
    if (cfg.pitchMode === "key") {
        return NOTE_NAMES[cfg.keyTonic] + " " + KEY_MODE_SHORT[cfg.keyMode];
    }
    return "follows";
}

function selectedSinger() {
    return state.config.singers[state.selected];
}

function sendSinger(field, value) {
    post({ type: "singerSet", index: state.selected, field: field, value: value });
}

function noteOptions() {
    const out = [];
    for (let n = 24; n <= 84; n = n + 1) {
        out.push([String(n), noteName(n)]);
    }
    return out;
}

function tonicOptions() {
    const out = [];
    for (let k = 0; k < 12; k = k + 1) {
        out.push([String(k), NOTE_NAMES[k]]);
    }
    return out;
}

function makeOwnControl(container, spec) {
    const wrap = document.createElement("div");
    wrap.className = "control own-control";
    const label = document.createElement("label");
    const name = document.createElement("span");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.title = "Give this monk its own value; unticked, it follows the ensemble";
    name.appendChild(box);
    name.appendChild(document.createTextNode(" " + spec.label));
    const out = document.createElement("output");
    label.appendChild(name);
    label.appendChild(out);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.setAttribute("aria-label", spec.label + " (this monk)");
    function engineValue(v) {
        if (spec.ui) {
            return oscRateFromUi(v);
        }
        return v;
    }
    function moved() {
        out.textContent = spec.format(Number(input.value));
        const cfg = selectedSinger();
        if (cfg === undefined || !box.checked) {
            return;
        }
        cfg.own[spec.key] = engineValue(Number(input.value));
        sendSinger("own." + spec.key, cfg.own[spec.key]);
    }
    function toggled() {
        const cfg = selectedSinger();
        if (cfg === undefined) {
            return;
        }
        input.disabled = !box.checked;
        wrap.classList.toggle("following", !box.checked);
        if (box.checked) {
            moved();
        } else {
            cfg.own[spec.key] = null;
            sendSinger("own." + spec.key, null);
            refreshMonkPanel();
        }
        buildSingerTable();
    }
    input.addEventListener("input", moved);
    box.addEventListener("change", toggled);
    wrap.appendChild(label);
    wrap.appendChild(input);
    container.appendChild(wrap);
    monkInputs[spec.key] = { box: box, input: input, out: out, wrap: wrap, spec: spec };
}

function setPitchField(field, value) {
    const cfg = selectedSinger();
    if (cfg === undefined) {
        return;
    }
    cfg[field] = value;
    sendSinger(field, value);
    refreshMonkPanel();
    buildSingerTable();
}

function onPitchMode(mode) {
    const cfg = selectedSinger();
    if (cfg === undefined) {
        return;
    }
    if (mode === "lock" && cfg.pitchMode !== "lock") {
        // lock onto what it is singing now, or the last played note
        let n = state.lastNote !== undefined ? state.lastNote : 48;
        const t = state.telemetry !== null ? state.telemetry[state.selected] : undefined;
        if (t !== undefined && t.env > 0.05) {
            n = Math.round(69 + 12 * Math.log2(t.f0 / 440));
        }
        cfg.lockNote = Math.max(24, Math.min(84, n));
        sendSinger("lockNote", cfg.lockNote);
    }
    if (mode === "key" && cfg.pitchMode !== "key" && state.lastNote !== undefined) {
        cfg.keyTonic = ((state.lastNote % 12) + 12) % 12;
        sendSinger("keyTonic", cfg.keyTonic);
    }
    setPitchField("pitchMode", mode);
}

function buildMonkPanel() {
    const c = $("monk-controls");
    monkInputs.pitchMode = makeSelect(c, { label: "Pitch", options: [["follow", "follows the keys"], ["lock", "locked on a note"], ["key", "follows, in its own key"]], value: "follow", onInput: onPitchMode });
    monkInputs.lockNote = makeSelect(c, { label: "Locked note", options: noteOptions(), value: "48", onInput: function (v) { setPitchField("lockNote", Number(v)); } });
    const droneWrap = document.createElement("div");
    droneWrap.className = "control check";
    const droneLabel = document.createElement("label");
    const drone = document.createElement("input");
    drone.type = "checkbox";
    droneLabel.appendChild(drone);
    droneLabel.appendChild(document.createTextNode("Drone: keep singing with no key held"));
    droneWrap.appendChild(droneLabel);
    c.appendChild(droneWrap);
    drone.addEventListener("change", function () { setPitchField("drone", drone.checked); });
    monkInputs.drone = drone;
    monkInputs.droneWrap = droneWrap;
    monkInputs.keyTonic = makeSelect(c, { label: "Key", options: tonicOptions(), value: "0", onInput: function (v) { setPitchField("keyTonic", Number(v)); } });
    monkInputs.keyMode = makeSelect(c, { label: "Scale", options: KEY_MODES, value: "minor", onInput: function (v) { setPitchField("keyMode", v); } });
    for (let i = 0; i < OWN_CONTROLS.length; i = i + 1) {
        makeOwnControl(c, OWN_CONTROLS[i]);
    }
    buildThroatControls($("throat-controls"));
    $("monk-reset").addEventListener("click", resetMonk);
    $("monk-all-follow").addEventListener("click", allFollow);
}

function resetMonk() {
    const cfg = selectedSinger();
    if (cfg === undefined) {
        return;
    }
    const keys = Object.keys(cfg.own);
    for (let i = 0; i < keys.length; i = i + 1) {
        cfg.own[keys[i]] = null;
    }
    cfg.pitchMode = "follow";
    cfg.drone = false;
    pushConfig();
    refreshMonkPanel();
    buildSingerTable();
}

function allFollow() {
    const singers = state.config.singers;
    for (let s = 0; s < singers.length; s = s + 1) {
        const keys = Object.keys(singers[s].own);
        for (let i = 0; i < keys.length; i = i + 1) {
            singers[s].own[keys[i]] = null;
        }
        singers[s].pitchMode = "follow";
        singers[s].drone = false;
    }
    pushConfig();
    refreshMonkPanel();
    buildSingerTable();
}

// ------------------------------------------------------------------ the selected monk's throat

const throatInputs = {};

function ornRateFromUi(u) {
    return 0.5 * Math.pow(70.0, u);
}

function ornRateToUi(r) {
    return Math.max(0, Math.min(1, Math.log(r / 0.5) / Math.log(70.0)));
}

function fmtHz(v) { return v.toFixed(1) + " Hz"; }
function fmtSteps(v) { return v.toFixed(1) + " steps/s"; }
function fmtPhrase(v) { return v < 0.5 ? "never breathes" : v.toFixed(1) + " s"; }
function fmtSigned(v) { return (v > 0 ? "+" : "") + v.toFixed(2); }

function setThroatField(field, value) {
    const cfg = selectedSinger();
    if (cfg === undefined) {
        return;
    }
    cfg[field] = value;
    sendSinger(field, value);
    if (field === "register" || field === "tuning") {
        buildSingerTable();
    } else {
        refreshMonkPanel();
    }
    state.inspectDirty = true;
}

// A slider bound to one field of the selected monk. toUi/fromUi map a
// non-linear field onto the slider.
function makeThroatSlider(container, spec) {
    const input = makeSlider(container, { label: spec.label, min: spec.min, max: spec.max, step: spec.step, value: spec.min, format: spec.format, title: spec.title, onInput: moved });
    function moved(v) {
        let value = v;
        if (spec.fromUi !== undefined) {
            value = spec.fromUi(v);
        }
        setThroatField(spec.field, value);
    }
    throatInputs[spec.field] = { input: input, spec: spec };
    return input;
}

function makeThroatSelect(container, spec) {
    const select = makeSelect(container, { label: spec.label, options: spec.options, value: String(spec.options[0][0]), onInput: chosen });
    if (spec.title) {
        select.parentElement.title = spec.title;
    }
    function chosen(v) {
        let value = v;
        if (spec.nullable && v === "") {
            value = null;
        } else if (spec.numeric) {
            value = Number(v);
        }
        setThroatField(spec.field, value);
    }
    throatInputs[spec.field] = { input: select, spec: spec, select: true };
    return select;
}

function rangeOptions(lo, hi) {
    const out = [];
    for (let k = lo; k <= hi; k = k + 1) {
        out.push([String(k), "#" + k]);
    }
    return out;
}

function keyedOptions(table) {
    const out = [];
    const keys = Object.keys(table);
    for (let i = 0; i < keys.length; i = i + 1) {
        const v = table[keys[i]];
        out.push([keys[i], typeof v === "string" ? v : v.label]);
    }
    return out;
}

function buildThroatControls(c) {
    const styleOptions = [["", "apply a style…"]].concat(keyedOptions(STYLES));
    throatInputs.style = makeSelect(c, { label: "Style", options: styleOptions, value: "", onInput: applyStyle });
    throatInputs.style.parentElement.title = "Sets register, gesture and mechanics together; adjust them below afterwards";
    makeThroatSelect(c, { field: "register", label: "Register", options: registerOptions() });
    makeThroatSelect(c, { field: "tuning", label: "Gesture / tuning", options: tuningOptions(), title: "What the mouth does: khöömei and sygyt listen to one resonance; the map gestures choose from the singer's own map of mouth shapes, through lips and nose" });
    makeThroatSelect(c, { field: "larynxModel", label: "Larynx", options: [["pulse", "drawn pulse"], ["folds", "self-oscillating folds"]], title: "Drawn pulse: the glottal flow is a prescribed shape. Self-oscillating: vocal folds and false folds are masses on springs moved by the air; pitch, closure and the false folds' locking emerge" });
    makeThroatSlider(c, { field: "lungs", label: "Lung pressure (folds)", min: 0.5, max: 1.6, step: 0.01, format: fmtPercent, title: "Self-oscillating folds only: below a threshold the folds stop; more pressure is louder and brighter" });
    makeThroatSlider(c, { field: "ventGap", label: "False-fold gap (folds)", min: -0.03, max: 0.1, step: 0.005, format: formatGap, title: "How close the false folds are held when drawn in (the half tone or the ventricular register draws them in)" });
    makeThroatSelect(c, { field: "ventTension", label: "False-fold tension (folds)", numeric: true, nullable: true, options: [["", "by pitch (measured)"], ["-0.7", "very slack"], ["-0.55", "slack"], ["-0.4", "medium"], ["-0.25", "firm"], ["-0.1", "tight"]], title: "Their own frequency relative to half the pitch; the air through their gap stiffens them, so locking needs them slacker than f0/2" });
    makeThroatSelect(c, { field: "ventRatio", label: "Ventricular folds", numeric: true, options: [["1", "in step (1 : 1)"], ["2", "sub-octave (1 : 2)"], ["3", "sub-twelfth (1 : 3)"]], title: "Glottal cycles per cycle of the false folds; heard when the half tone is up or the register is ventricular" });
    makeThroatSlider(c, { field: "press", label: "Press", min: 0, max: 1, step: 0.01, format: fmtPercent, title: "Longer closed phase, faster sealing, no leak: sharper resonances and a stronger overtone" });
    makeThroatSlider(c, { field: "larynx", label: "Larynx (low ↔ high)", min: -1, max: 1, step: 0.01, format: fmtSigned, title: "Lowering the larynx lengthens the throat: darker, every resonance lower" });
    makeThroatSlider(c, { field: "epilarynx", label: "Twang (epilarynx)", min: 0, max: 1, step: 0.01, format: fmtPercent, title: "Narrowing just above the folds: a ring near 3 kHz and a source that hears the tube" });
    makeThroatSelect(c, { field: "gyutoH1", label: "Gyuto: F1 on harmonic", numeric: true, options: rangeOptions(3, 8) });
    makeThroatSelect(c, { field: "gyutoH2", label: "Gyuto: F2 on harmonic", numeric: true, options: rangeOptions(6, 16) });
    const melodyOptions = keyedOptions(MELODIES).concat([["custom", "custom…"]]);
    throatInputs.melodySelect = makeSelect(c, { label: "Overtone melody", options: melodyOptions, value: "", onInput: chooseMelody });
    const wrap = document.createElement("div");
    wrap.className = "control";
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = "Harmonics (custom)";
    label.appendChild(name);
    const text = document.createElement("input");
    text.type = "text";
    text.placeholder = "6 8 9 10 12";
    text.className = "text-input";
    text.addEventListener("change", typedMelody);
    wrap.appendChild(label);
    wrap.appendChild(text);
    c.appendChild(wrap);
    throatInputs.melodyText = text;
    makeThroatSlider(c, { field: "melodyRate", label: "Melody speed", min: 0.3, max: 6, step: 0.05, format: fmtSteps });
    makeThroatSelect(c, { field: "melodyOffset", label: "Melody starts", numeric: true, options: [["0", "on step 1"], ["-1", "1 step late"], ["-2", "2 steps late"], ["-3", "3 steps late"], ["-4", "4 steps late"], ["2", "2 steps early"]], title: "Offset against other monks: a canon" });
    makeThroatSelect(c, { field: "ornament", label: "Ornament", options: keyedOptions(ORNAMENTS) });
    makeThroatSlider(c, { field: "ornRate", label: "Ornament rate", min: 0, max: 1, step: 0.005, format: formatOrnRate, fromUi: ornRateFromUi, toUi: ornRateToUi, title: "Trill 5–9 Hz, gallop 2–3 Hz, lip flutter and tongue trill 15–30 Hz" });
    makeThroatSlider(c, { field: "ornDepth", label: "Ornament depth", min: 0, max: 1, step: 0.01, format: fmtPercent });
    makeThroatSlider(c, { field: "phrase", label: "Breathe every", min: 0, max: 15, step: 0.1, format: fmtPhrase, fromUi: phraseFromUi, title: "Phrase length; the singer stops, takes an audible in-breath and starts again with the overtone climbing into place" });
    makeThroatSlider(c, { field: "breathGap", label: "Breath length", min: 0.3, max: 2, step: 0.05, format: fmtSeconds });
    makeThroatSelect(c, { field: "pattern", label: "Breath game", options: keyedOptions(PATTERNS), title: "Short motifs on the out-breath and the in-breath, voiced and breathed" });
    makeThroatSlider(c, { field: "patternRate", label: "Game speed", min: 2, max: 12, step: 0.1, format: fmtSteps });
    makeThroatSelect(c, { field: "patternOffset", label: "Game starts", numeric: true, options: [["0", "on step 1"], ["1", "1 step later"], ["2", "2 steps later"], ["3", "3 steps later"]], title: "Offset against a partner" });
}

function phraseFromUi(v) {
    if (v < 0.5) {
        return 0.0;
    }
    return v;
}

function formatGap(v) {
    return v.toFixed(3) + " cm²";
}

function formatOrnRate(u) {
    return ornRateFromUi(u).toFixed(1) + " Hz";
}

function chooseMelody(v) {
    if (v === "custom") {
        throatInputs.melodyText.focus();
        return;
    }
    setThroatField("melody", v);
}

function typedMelody() {
    setThroatField("melody", throatInputs.melodyText.value.trim());
}

function applyStyle(key) {
    const cfg = selectedSinger();
    if (cfg === undefined || STYLES[key] === undefined) {
        return;
    }
    // a style starts from an ordinary throat, so nothing carries over
    const plain = makeSingerConfig(cfg.type, "chest", 0);
    const reset = ["register", "tuning", "ventRatio", "press", "gyutoH1", "gyutoH2", "melody", "melodyRate", "melodyOffset", "ornament", "ornRate", "ornDepth", "phrase", "breathGap", "pattern", "patternRate", "patternOffset", "larynx", "epilarynx", "larynxModel", "lungs", "ventGap", "ventTension"];
    for (let i = 0; i < reset.length; i = i + 1) {
        cfg[reset[i]] = plain[reset[i]];
    }
    const set = STYLES[key].set;
    const fields = Object.keys(set);
    for (let i = 0; i < fields.length; i = i + 1) {
        cfg[fields[i]] = set[fields[i]];
    }
    throatInputs.style.value = "";
    pushConfig();
    buildSingerTable();
}

function refreshThroat(cfg) {
    const fields = Object.keys(throatInputs);
    for (let i = 0; i < fields.length; i = i + 1) {
        const t = throatInputs[fields[i]];
        if (t.spec === undefined) {
            continue;
        }
        let v = cfg[t.spec.field];
        if (t.spec.toUi !== undefined) {
            v = t.spec.toUi(v);
        }
        if (v === null || v === undefined) {
            v = "";
        }
        t.input.value = String(v);
        if (!t.select) {
            const out = t.input.parentElement.querySelector("output");
            out.textContent = t.spec.format(Number(t.input.value));
        }
    }
    const custom = MELODIES[cfg.melody] === undefined;
    throatInputs.melodySelect.value = custom ? "custom" : cfg.melody;
    throatInputs.melodyText.value = custom ? cfg.melody : MELODIES[cfg.melody].steps.join(" ");
    const harmonicLine = isHarmonicTuning(cfg.tuning);
    showControl(throatInputs.gyutoH1.input, cfg.tuning === "gyuto");
    showControl(throatInputs.gyutoH2.input, cfg.tuning === "gyuto");
    showControl(throatInputs.melodySelect, harmonicLine);
    showControl(throatInputs.melodyText, harmonicLine);
    showControl(throatInputs.melodyRate.input, harmonicLine && cfg.melody !== "");
    showControl(throatInputs.melodyOffset.input, harmonicLine && cfg.melody !== "");
    showControl(throatInputs.ornRate.input, cfg.ornament !== "none");
    showControl(throatInputs.ornDepth.input, cfg.ornament !== "none");
    showControl(throatInputs.breathGap.input, cfg.phrase >= 0.5);
    showControl(throatInputs.patternRate.input, cfg.pattern !== "none");
    showControl(throatInputs.patternOffset.input, cfg.pattern !== "none");
    const foldsOn = cfg.larynxModel === "folds";
    showControl(throatInputs.lungs.input, foldsOn);
    showControl(throatInputs.ventGap.input, foldsOn);
    showControl(throatInputs.ventTension.input, foldsOn);
}

function showControl(input, on) {
    input.parentElement.classList.toggle("hidden", !on);
}

// Show the selected monk's settings; following controls show the ensemble's value.
function refreshMonkPanel() {
    const cfg = selectedSinger();
    if (cfg === undefined || monkInputs.pitchMode === undefined) {
        return;
    }
    $("monk-name").textContent = "monk " + (state.selected + 1) + " (" + cfg.type + ", " + cfg.register + ")";
    monkInputs.pitchMode.value = cfg.pitchMode;
    monkInputs.lockNote.value = String(Math.round(cfg.lockNote));
    monkInputs.drone.checked = cfg.drone === true;
    monkInputs.keyTonic.value = String(cfg.keyTonic);
    monkInputs.keyMode.value = cfg.keyMode;
    monkInputs.lockNote.parentElement.classList.toggle("hidden", cfg.pitchMode !== "lock");
    monkInputs.droneWrap.classList.toggle("hidden", cfg.pitchMode !== "lock");
    monkInputs.keyTonic.parentElement.classList.toggle("hidden", cfg.pitchMode !== "key");
    monkInputs.keyMode.parentElement.classList.toggle("hidden", cfg.pitchMode !== "key");
    for (let i = 0; i < OWN_CONTROLS.length; i = i + 1) {
        const spec = OWN_CONTROLS[i];
        const c = monkInputs[spec.key];
        const own = cfg.own[spec.key];
        const mine = own !== null && own !== undefined;
        let v = mine ? own : spec.ensemble(cfg);
        if (spec.ui) {
            v = orbitRateToUi(v);
        }
        c.box.checked = mine;
        c.input.disabled = !mine;
        c.wrap.classList.toggle("following", !mine);
        c.input.value = String(v);
        c.out.textContent = spec.format(Number(c.input.value));
    }
    refreshThroat(cfg);
}

// ------------------------------------------------------------------ pad

function padMode() {
    if (state.mode === "classic") {
        return "classic";
    }
    if (state.mode === "hdr") {
        return "vowel";
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
    if (state.mode === "hdr") {
        post({ type: "hdrPad", note: note, vowel: p.y, down: phase !== "up" });
        return;
    }
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
    if (state.mode === "hdr") {
        const t = state.hdrTelemetry;
        let target = { jaw: 0.2, lip: 0.4, protrusion: 0.2, velum: 0, active: 0 };
        if (t !== null) {
            target = { jaw: t.jaw, lip: t.lip, protrusion: t.protrusion, velum: t.velum, active: Math.min(1, t.env * 1.2) };
        }
        const mouth = smoothMouth(0, target);
        const size = Math.min(110, h * 0.55) * Math.pow((t !== null ? t.length : 17) / 17.0, 1.2);
        drawMonk(ctx, w / 2, h - 18, size, mouth, mouth.active, false, HUES[1]);
        if (t !== null && t.model === "hdr" && t.layers.living) {
            // the breath: a slow glow that follows lung pressure
            ctx.fillStyle = "rgba(111,181,154," + Math.max(0, Math.min(0.5, (t.ps - 0.9) * 2.5)).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(w / 2, h - 18 - size * 0.6, size * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
        $("stage-caption").textContent = t !== null && t.env > 0.05 ? (t.model === "hdr" ? "HDR voice · " : "Physical voice · ") + noteName(69 + 12 * Math.log2(t.f0 / 440)) + " · tract " + t.length.toFixed(1) + " cm" : "Play the pad or keys. Switch Physical / HDR to compare.";
        return;
    }
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
            const cfg = state.config.singers[i];
            if (cfg !== undefined && cfg.pitchMode !== undefined && cfg.pitchMode !== "follow") {
                ctx.font = "11px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillStyle = cfg.pitchMode === "lock" ? "#f2cf6b" : "#9ab6e0";
                ctx.fillText(pitchBadge(cfg), x, ground - 1.95 * size - 6);
                ctx.textAlign = "start";
            }
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
const inspectNasal = new Float64Array(64);
const inspectBranch = makeBranchShape();

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
    if (art.velum > 0.02) {
        // velum open: the whole branched tube, heard at lips plus nostrils
        const nc = nasalAreas(anatomy, inspectSeg, inspectNasal);
        const nosePole = radiationPole(Math.sqrt(inspectNasal[nc - 1] / Math.PI), tickRate, SPEED_OF_SOUND);
        prepareBranch(inspectBranch, inspectAreas, nc, inspectNasal, velumJunction(inspectSeg), velumArea(anatomy, art), pole, nosePole, 0.95);
        for (let i = 0; i < inspectCurve.length; i = i + 1) {
            const f = Math.max(1.0, maxHz * i / (inspectCurve.length - 1));
            inspectCurve[i] = branchMagnitudeDb(inspectBranch, f, tickRate);
        }
    }
    drawMouthMap(cfg, tel);
    let nasalPeaks = -1;
    if (art.velum > 0.02) {
        nasalPeaks = 0;
        for (let i = 2; i < inspectCurve.length - 1 && nasalPeaks < 3; i = i + 1) {
            if (inspectCurve[i] > inspectCurve[i - 1] && inspectCurve[i] >= inspectCurve[i + 1]) {
                inspectSlots[nasalPeaks].f = maxHz * i / (inspectCurve.length - 1);
                nasalPeaks = nasalPeaks + 1;
            }
        }
    }
    let found = 0;
    if (nasalPeaks < 0) {
        found = findFormants(inspectAreas, tickRate, 0.95, pole, maxHz, 3, inspectSlots);
    } else {
        found = nasalPeaks;
    }
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
        ["Tuning", TUNINGS[cfg.tuning] + (cfg.tuning === "gyuto" ? " (" + cfg.gyutoH1 + " / " + cfg.gyutoH2 + ")" : "")],
        ["Overtone", tel !== null && isHarmonicTuning(cfg.tuning) && f0 > 0 ? "#" + tel.harmonic + (tel.mapSub > 1 ? " of f0/" + tel.mapSub : "") + " = " + (tel.harmonic * f0 / Math.max(1, tel.mapSub)).toFixed(0) + " Hz" : "—"],
        ["Ventricular", tel !== null && tel.vent > 0.05 ? ["", "in step", "sub-octave", "sub-twelfth"][tel.ventRatio] + " · " + Math.round(tel.vent * 100) + "%" : "still"],
        ["Breath", tel === null ? "—" : (tel.direction > 0 ? "out" : "in") + (tel.voicing < 0.5 ? ", breath only" : "") + (tel.breathing ? " · breathing" : "")],
        ["Mouth map", isMapTuning(cfg.tuning) ? (tel !== null && !tel.mapReady ? "learning…" : "known") : "—"],
        ["Larynx", cfg.larynxModel === "folds" ? (tel !== null && tel.foldsHeard > 0 ? "folds at " + tel.foldsHeard.toFixed(1) + " Hz" + (tel.vent > 0.3 ? ", false folds touch on " + Math.round(100 * tel.ventContactRate) + "% of cycles" : "") : "self-oscillating folds") : "drawn pulse"]
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
        if (isHarmonicTuning(cfg.tuning) && tel !== null) {
            targets.push(tel.harmonic * f0 / Math.max(1, tel.mapSub));
        } else if (cfg.tuning === "gyuto") {
            targets.push(cfg.gyutoH1 * f0);
            targets.push(cfg.gyutoH2 * f0);
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

// ------------------------------------------------------------------ the singer's mouth map

const pageMap = { key: "", map: null, singer: null };

const MAP_AXES = {
    labial: ["lips: round → spread", "tongue: back → front"],
    nasal: ["tongue: back → front", "hidden mouth: small → large"],
    throat: ["tongue root: low → high", "mouth: small → open"],
    vowel: ["vowel: ooh → eeh", ""],
    focus: ["focus: low → high (both constrictions)", "back of the tongue: back → forward"]
};

// Build (once per body and gesture) the same map the singer uses, and show
// how strongly the current harmonic stands out over the gesture plane.
function drawMouthMap(cfg, tel) {
    const fig = $("map-figure");
    if (!isMapTuning(cfg.tuning)) {
        fig.classList.add("hidden");
        return;
    }
    fig.classList.remove("hidden");
    const key = cfg.type + "|" + cfg.lengthScale + "|" + cfg.tuning + "|" + cfg.larynx.toFixed(1) + "|" + cfg.epilarynx.toFixed(1);
    if (pageMap.key !== key) {
        const singer = new Singer(48000, anatomyFor(Object.assign(makeSingerConfig(cfg.type, cfg.register, 0), cfg)), cfg.register, 1);
        singer.tuning = cfg.tuning;
        singer.epilarynx = cfg.epilarynx;
        singer.larynxTarget = cfg.larynx;
        singer.updateMap();
        while (!singer.map.ready()) {
            singer.map.buildRow(singer);
        }
        pageMap.key = key;
        pageMap.map = singer.map;
        pageMap.singer = singer;
    }
    const map = pageMap.map;
    const canvas = $("mouthmap");
    const ctx = fitCanvas(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    let f0 = 110.0;
    let n = state.globals.harmonic;
    let sub = 1;
    if (tel !== null) {
        if (tel.f0 > 20) {
            f0 = tel.f0;
        }
        n = tel.harmonic;
        sub = Math.max(1, tel.mapSub);
    }
    const fs = f0 / sub;
    const nb = map.stepsB;
    const left = 30;
    const bottom = h - 22;
    const cw = (w - left - 8) / MAP_STEPS;
    const ch = (bottom - 8) / nb;
    for (let ia = 0; ia < MAP_STEPS; ia = ia + 1) {
        for (let ib = 0; ib < nb; ib = ib + 1) {
            const sc = map.score(ia * nb + ib, fs, n);
            const t = Math.max(0, Math.min(1, (sc + 5) / 30));
            ctx.fillStyle = "rgba(233,162,59," + (0.06 + 0.9 * t).toFixed(3) + ")";
            ctx.fillRect(left + ia * cw, bottom - (ib + 1) * ch, cw + 0.5, ch + 0.5);
        }
    }
    if (tel !== null && tel.pathQ !== undefined) {
        const x = left + tel.pathQ * (MAP_STEPS - 1) * cw + 0.5 * cw;
        const y = bottom - (nb > 1 ? tel.pathQB * (nb - 1) : 0) * ch - 0.5 * ch;
        ctx.strokeStyle = "#6fb59a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = "rgba(239,228,207,0.65)";
    ctx.font = "11px Georgia, serif";
    ctx.fillText(MAP_AXES[cfg.tuning][0], left, h - 6);
    ctx.save();
    ctx.translate(14, bottom);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(MAP_AXES[cfg.tuning][1], 0, 0);
    ctx.restore();
    $("map-caption").textContent = "Where harmonic #" + n + (sub > 1 ? " of f0/" + sub : "") + " (" + (n * fs).toFixed(0) + " Hz) stands out over its neighbours, by mouth shape (brighter = stronger). The ring is where the singer's mouth is now.";
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
    if (state.mode === "hdr") {
        drawSpectrogram(state.spectrogram, state.analyser, state.audio !== null ? state.audio.sampleRate : 48000);
        drawHdrMeters(state.hdrTelemetry);
    }
    drawStage();
    drawInspector();
    requestAnimationFrame(frame);
}

function init() {
    buildClassicControls();
    buildChoirControls();
    buildMonkPanel();
    buildPresetSelect();
    buildKeyboard();
    buildFitTable();
    loadPreset(PRESETS[0].id);
    $("mode-classic").addEventListener("click", selectClassic);
    $("mode-choir").addEventListener("click", selectChoir);
    $("mode-song").addEventListener("click", selectSong);
    $("mode-hdr").addEventListener("click", selectHdr);
    buildRoomBar();
    state.hdr = buildHdrPanel(post, makeSlider, makeSelect);
    state.spectrogram = makeSpectrogram($("hdr-spectrogram"));
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
