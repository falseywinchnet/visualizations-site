// One physical singer: body + register + articulation + pitch behaviour,
// driving a Glottis into a Tract, resampled to the audio rate.
//
// Nothing here pitch-shifts or formant-shifts a recording. A soprano differs
// from a basso because her tube is shorter (with a shorter pharynx), her folds
// close differently, and she moves her jaw differently at high pitch.
//
// Formant tuning behaviours (all are feedback: the singer listens to the
// resonance it is producing, computed exactly from its current tube by
// analysis.js, and moves one articulator to bring it onto a target):
//   r1      high voices: when F0 rises past F1, open the jaw so F1 follows F0
//   overtone (khöömei): move the tongue body so resonance 2 sits on n * F0
//   sygyt   tongue tip sealed behind the teeth; the tongue body moves the
//           clustered F2/F3 resonance onto n * F0
//   gyuto   low chant: jaw puts F1 on the 5th harmonic, tongue puts F2 on the
//           10th (the emphasis reported for Gyuto chant)

import {
    SECTIONS, SPEED_OF_SOUND, MAX_NASAL_SECTIONS, makeArticulation, copyArticulation,
    areaFunction, nasalAreas, velumJunction, velumArea, lipRadius, ARTICULATION_KEYS, VOICE_TYPES
} from "./anatomy.js?v=9500908dbe";
import { Tract, radiationPole, SECTION_LOSS } from "./tract.js?v=711fe62fc7";
import { Glottis, makeVoiceSource, copyVoiceSource } from "./glottis.js?v=e11d9ec07d";
import { scanPeaks } from "./analysis.js?v=887637021b";
import { VOWEL_SHAPES } from "./vowels.js?v=260f005eba";

export const CONTROL_BLOCK = 64;
const FIT_KEYS = ["tonguePos", "tongueHeight", "jaw", "lipAperture", "lipProtrusion"];

// Articulation paths along which the tuning behaviours move. Each was
// checked (.dev/render_test.mjs) to move the tracked resonance monotonically.
// Khöömei: rounded-back to spread-front tongue/lip gesture, F2 ~ 690..1840 Hz
// for a baritone. Sygyt: tongue tip sealed behind the teeth, the tongue body
// moves the sharp clustered resonance ~ 910..1770 Hz.
export const KHOOMEI_PATH = [
    { tonguePos: 0.43, tongueHeight: 0.8, jaw: 0.22, lipAperture: 0.17, lipProtrusion: 0.7, tipPos: 0.9, tipClose: 0.0, velum: 0.0, larynx: 0.0, epilarynx: 0.6 },
    { tonguePos: 0.82, tongueHeight: 0.8, jaw: 0.22, lipAperture: 0.32, lipProtrusion: 0.1, tipPos: 0.9, tipClose: 0.0, velum: 0.0, larynx: 0.0, epilarynx: 0.6 }
];
export const SYGYT_PATH = [
    { tonguePos: 0.48, tongueHeight: 0.64, jaw: 0.2, lipAperture: 0.18, lipProtrusion: 0.5, tipPos: 0.92, tipClose: 0.92, velum: 0.0, larynx: 0.0, epilarynx: 0.6 },
    { tonguePos: 0.8, tongueHeight: 0.8, jaw: 0.2, lipAperture: 0.18, lipProtrusion: 0.5, tipPos: 0.92, tipClose: 0.92, velum: 0.0, larynx: 0.0, epilarynx: 0.6 }
];
const OPEN_AH = { tonguePos: 0.3, tongueHeight: 0.7, jaw: 1.0, lipAperture: 1.0, lipProtrusion: 0.0 };

function mixInto(out, a, b, t) {
    for (let k = 0; k < ARTICULATION_KEYS.length; k = k + 1) {
        const key = ARTICULATION_KEYS[k];
        out[key] = a[key] + (b[key] - a[key]) * t;
    }
    return out;
}

function clamp(x, lo, hi) {
    if (x < lo) {
        return lo;
    }
    if (x > hi) {
        return hi;
    }
    return x;
}

// Exponential approach with separate rise and fall time constants.
function approachAsym(x, target, dt, riseTau, fallTau) {
    let tau = fallTau;
    if (target > x) {
        tau = riseTau;
    }
    return x + (target - x) * (1.0 - Math.exp(-dt / tau));
}

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2.0 * p1 + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3);
}

// Vowel axis 0..1 through ooh, ow, ah, ayh, eeh, interpolated in articulation
// space (the classic engine interpolates in formant space instead).
export function vowelArticulation(vowel, out) {
    const pos = clamp(vowel, 0.0, 1.0) * 4.0;
    let seg = Math.floor(pos);
    if (seg > 3) {
        seg = 3;
    }
    const t = pos - seg;
    const i0 = Math.max(seg - 1, 0);
    const i1 = seg;
    const i2 = seg + 1;
    const i3 = Math.min(seg + 2, 4);
    for (let k = 0; k < FIT_KEYS.length; k = k + 1) {
        const key = FIT_KEYS[k];
        const v = catmullRom(VOWEL_SHAPES[i0][key], VOWEL_SHAPES[i1][key], VOWEL_SHAPES[i2][key], VOWEL_SHAPES[i3][key], t);
        out[key] = v;
    }
    out.tonguePos = clamp(out.tonguePos, 0.18, 0.86);
    out.tongueHeight = clamp(out.tongueHeight, 0.0, 0.97);
    out.jaw = clamp(out.jaw, 0.0, 1.0);
    out.lipAperture = clamp(out.lipAperture, 0.03, 1.0);
    out.lipProtrusion = clamp(out.lipProtrusion, 0.0, 1.0);
    return out;
}

// Periodic shapes on phase (cycles), range -1..1.
//   sine, triangle, ramp (slow rise, snap back: "yoi"), step (held ends
//   with quick moves between them).
export function oscillatorWave(shape, phase) {
    const p = phase - Math.floor(phase);
    if (shape === "triangle") {
        if (p < 0.5) {
            return 4.0 * p - 1.0;
        }
        return 3.0 - 4.0 * p;
    }
    if (shape === "ramp") {
        if (p < 0.85) {
            return -1.0 + 2.0 * p / 0.85;
        }
        return 1.0 - 2.0 * (p - 0.85) / 0.15;
    }
    if (shape === "step") {
        const s = Math.sin(2.0 * Math.PI * p);
        return Math.tanh(4.0 * s) / Math.tanh(4.0);
    }
    return Math.sin(2.0 * Math.PI * p);
}

export function noteToHz(note) {
    return 440.0 * Math.pow(2.0, (note - 69.0) / 12.0);
}

export function hzToNote(hz) {
    return 69.0 + 12.0 * Math.log2(hz / 440.0);
}

// Second-order Butterworth low-pass (bilinear), used before decimation.
function designLowpass(cutoff, rate, c) {
    const k = Math.tan(Math.PI * Math.min(cutoff, 0.49 * rate) / rate);
    const q = Math.SQRT1_2;
    const norm = 1.0 / (1.0 + k / q + k * k);
    c.b0 = k * k * norm;
    c.b1 = 2.0 * c.b0;
    c.b2 = c.b0;
    c.a1 = 2.0 * (k * k - 1.0) * norm;
    c.a2 = (1.0 - k / q + k * k) * norm;
}

export class Singer {
    constructor(sampleRate, anatomy, registerKey, seed) {
        this.sampleRate = sampleRate;
        this.anatomy = anatomy;
        this.glottis = new Glottis(seed);
        this.tract = new Tract();
        this.source = makeVoiceSource(registerKey);
        this.sourceTarget = makeVoiceSource(registerKey);
        this.registerKey = registerKey;
        this.effort = 0.6;
        this.level = 1.0;
        this.pan = 0.0;
        this.seed = seed;

        this.vowel = 0.5;
        this.vowelTarget = 0.5;
        this.vowelGlide = 0.06; // seconds
        this.hum = 0.0;
        this.humTarget = 0.0;
        // Consonant closures: lips (p, b, m), tongue tip (t, d, n), velum (n, m).
        this.stopLip = 0.0;
        this.stopLipTarget = 0.0;
        this.stopTip = 0.0;
        this.stopTipTarget = 0.0;
        this.velumOpen = 0.0;
        this.velumOpenTarget = 0.0;
        // Vowel-space oscillator: an orbit around the vowel target. One axis
        // runs along the vowel line (ooh..eeh), the other is lip rounding.
        this.oscRate = 0.0;    // Hz
        this.oscDepth = 0.0;   // vowel-axis amplitude (0..0.5)
        this.oscRound = 0.0;   // rounding-axis amplitude (0..1)
        this.oscPhase = 0.0;   // cycles
        this.oscShape = "sine";
        this.oscValue = 0.0;
        this.vowelEff = 0.5;
        this.epilarynx = 0.3;
        this.larynx = 0.0;
        // Throat-length gesture: larynx height and extra lip protrusion move
        // smoothly toward targets. Lowering the larynx and pushing the lips
        // out lengthens the tube, so every formant slides down together.
        this.larynxTarget = 0.0;
        this.larynxGlide = 0.25;
        this.protrusionAdd = 0.0;
        this.protrusionTarget = 0.0;
        this.base = makeArticulation();
        this.art = makeArticulation();
        this.posture = null; // optional articulation that replaces the vowel

        this.tuning = "none";
        this.harmonic = 8;
        this.pathQ = 0.4;      // position along the overtone / gyuto path
        this.r1Mix = 0.0;      // soprano vowel modification toward open "ah"
        this.tuneLip = 0.0;    // gyuto lip-aperture offset for F1
        this.lastTuning = "none";
        this.peaks = new Float64Array(8);
        this.tuneCounter = seed % 4; // stagger the analysis across singers
        this.measuredF1 = 0.0;
        this.measuredF2 = 0.0;

        this.note = 48.0;
        this.noteTarget = 48.0;
        this.glideRate = 40.0; // semitones per second
        this.bend = 0.0;
        this.vibratoRate = 5.2;
        this.vibratoDepth = 0.25; // semitones
        this.vibratoPhase = (seed % 997) / 997.0;
        this.vibratoOnset = 0.0;
        this.drift = 0.0;
        this.driftCents = 6.0;
        this.detune = 0.0; // cents
        this.randomState = (seed * 2654435761) >>> 0;

        this.gate = false;
        this.velocity = 1.0;
        this.envelope = 0.0;
        this.attack = 0.08;
        this.release = 0.25;
        this.onsetDelay = 0.0;
        this.delayCounter = 0;
        this.silentBlocks = 1000;

        this.areas = new Float64Array(SECTIONS);
        this.nasal = new Float64Array(MAX_NASAL_SECTIONS);
        this.nasalCount = 24;
        this.seg = { pharynx: 0, oral: 0, lips: 0, total: 0 };
        this.length = 17.0;
        this.tickRate = SECTIONS * SPEED_OF_SOUND / 17.0;
        this.tickAcc = 0.0;
        this.prevOut = 0.0;
        this.curOut = 0.0;
        this.prevFlow = 0.0;
        this.lp = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
        this.lpX1 = 0.0;
        this.lpX2 = 0.0;
        this.lpY1 = 0.0;
        this.lpY2 = 0.0;
        this.lpRate = 0.0;
        this.calibration = 1.0;
        this.f0 = 110.0;
        this.calibrate();
    }

    rand() {
        let x = this.randomState;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.randomState = x >>> 0;
        return this.randomState / 4294967296.0;
    }

    setAnatomy(anatomy) {
        this.anatomy = anatomy;
        this.calibrate();
    }

    setRegister(registerKey) {
        this.registerKey = registerKey;
        this.sourceTarget = makeVoiceSource(registerKey);
    }

    // Output gain so that different bodies sound equally loud: sing a short
    // "ah" in chest voice at the middle of the body's range on a scratch
    // glottis and tract, and normalize its RMS. Registers and efforts keep
    // their physical loudness differences relative to this reference.
    calibrate() {
        const art = makeArticulation();
        vowelArticulation(0.5, art);
        const L = areaFunction(this.anatomy, art, this.areas, this.seg);
        const rate = SECTIONS * SPEED_OF_SOUND / L;
        const nc = nasalAreas(this.anatomy, this.seg, this.nasal);
        this.nasalCount = nc;
        const tract = new Tract();
        const glottis = new Glottis(12345);
        const src = makeVoiceSource("chest");
        const pole = radiationPole(lipRadius(this.areas), rate, SPEED_OF_SOUND);
        tract.setShape(this.areas, nc, this.nasal, velumJunction(this.seg), 0.0, pole, 0.5, 0);
        const lp = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
        designLowpass(0.45 * this.sampleRate, rate, lp);
        let f0 = 130.0;
        const t = VOICE_TYPES[this.anatomy.type];
        if (t !== undefined) {
            f0 = Math.sqrt(t.f0Low * t.f0High);
        }
        const ticks = Math.round(0.2 * rate);
        const skip = Math.round(0.05 * rate);
        let prevFlow = 0.0;
        let x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0;
        let sum = 0.0;
        for (let i = 0; i < ticks; i = i + 1) {
            glottis.tick(f0, rate, src, 0.6, 1.0);
            const flow = tract.tick(glottis.flow, glottis.reflection);
            const radiated = flow - prevFlow;
            prevFlow = flow;
            const y = lp.b0 * radiated + lp.b1 * x1 + lp.b2 * x2 - lp.a1 * y1 - lp.a2 * y2;
            x2 = x1; x1 = radiated; y2 = y1; y1 = y;
            if (i >= skip) {
                sum = sum + y * y;
            }
        }
        const rms = Math.sqrt(sum / (ticks - skip));
        this.calibration = 0.25 / Math.max(rms, 1e-9);
    }

    noteOn(note, velocity) {
        const wasSounding = this.gate || this.envelope > 0.01;
        this.noteTarget = note;
        if (!wasSounding) {
            this.note = note - 0.6 * this.rand(); // a small scoop into the note
            this.vibratoOnset = 0.0;
            this.delayCounter = Math.round(this.onsetDelay * this.sampleRate / CONTROL_BLOCK);
        }
        this.velocity = velocity;
        this.gate = true;
        this.silentBlocks = 0;
    }

    noteOff() {
        this.gate = false;
    }

    isAwake() {
        return this.gate || this.envelope > 1e-4 || this.silentBlocks < 200;
    }

    // Articulation for this control block: vowel or posture or tuning path,
    // then vowel modification, then the hum.
    updateArticulation(dt) {
        // Entering or leaving the Gyuto gesture continues from the current
        // mouth instead of jumping to a new one.
        if (this.tuning !== this.lastTuning) {
            if (this.lastTuning === "gyuto") {
                this.vowel = 0.5 * this.pathQ;
            } else if (this.tuning === "gyuto") {
                this.pathQ = clamp(2.0 * this.vowel, 0.0, 1.0);
            }
            this.lastTuning = this.tuning;
        }
        const vg = 1.0 - Math.exp(-dt / Math.max(this.vowelGlide, 0.002));
        this.vowel = this.vowel + (this.vowelTarget - this.vowel) * vg;
        this.hum = this.hum + (this.humTarget - this.hum) * (1.0 - Math.exp(-dt / 0.05));
        // Closures form fast and open more slowly, which also tames the
        // pressure release after a seal.
        this.stopLip = approachAsym(this.stopLip, this.stopLipTarget, dt, 0.01, 0.03);
        this.stopTip = approachAsym(this.stopTip, this.stopTipTarget, dt, 0.01, 0.03);
        this.velumOpen = approachAsym(this.velumOpen, this.velumOpenTarget, dt, 0.015, 0.04);
        const lk = 1.0 - Math.exp(-dt / Math.max(this.larynxGlide, 0.005));
        this.larynx = this.larynx + (this.larynxTarget - this.larynx) * lk;
        this.protrusionAdd = this.protrusionAdd + (this.protrusionTarget - this.protrusionAdd) * lk;
        if (this.tuning === "overtone") {
            mixInto(this.base, KHOOMEI_PATH[0], KHOOMEI_PATH[1], this.pathQ);
        } else if (this.tuning === "gyuto") {
            // Between "ooh" and "ah" on the vowel axis; the lips trim F1.
            vowelArticulation(0.5 * this.pathQ, this.base);
            this.base.tipPos = 0.88;
            this.base.tipClose = 0.0;
            this.base.velum = 0.0;
        } else if (this.tuning === "sygyt") {
            mixInto(this.base, SYGYT_PATH[0], SYGYT_PATH[1], this.pathQ);
        } else if (this.posture !== null) {
            copyArticulation(this.posture, this.base);
        } else {
            this.advanceOscillator(dt);
            this.vowelEff = clamp(this.vowel + this.oscDepth * this.oscValue, 0.0, 1.0);
            vowelArticulation(this.vowelEff, this.base);
            if (this.oscRound > 0.0) {
                // quarter cycle out of phase with the vowel axis: an ellipse
                const r = this.oscRound * oscillatorWave(this.oscShape, this.oscPhase + 0.25);
                this.base.lipProtrusion = clamp(this.base.lipProtrusion + 0.6 * r, 0.0, 1.0);
                this.base.lipAperture = clamp(this.base.lipAperture * (1.0 - 0.45 * r), 0.03, 1.0);
            }
            this.base.tipPos = 0.88;
            this.base.tipClose = 0.0;
            this.base.velum = 0.0;
        }
        if (this.tuning !== "overtone" && this.tuning !== "sygyt") {
            this.base.epilarynx = this.epilarynx;
        }
        this.base.larynx = this.larynx;
        copyArticulation(this.base, this.art);
        if (this.protrusionAdd !== 0.0) {
            this.art.lipProtrusion = clamp(this.art.lipProtrusion + this.protrusionAdd, 0.0, 1.0);
        }
        if (this.r1Mix > 0.0) {
            const m = this.r1Mix;
            this.art.tonguePos = this.art.tonguePos + (OPEN_AH.tonguePos - this.art.tonguePos) * m;
            this.art.tongueHeight = this.art.tongueHeight + (OPEN_AH.tongueHeight - this.art.tongueHeight) * m;
            this.art.jaw = this.art.jaw + (OPEN_AH.jaw - this.art.jaw) * m;
            this.art.lipAperture = this.art.lipAperture + (OPEN_AH.lipAperture - this.art.lipAperture) * m;
            this.art.lipProtrusion = this.art.lipProtrusion + (OPEN_AH.lipProtrusion - this.art.lipProtrusion) * m;
        }
        if (this.tuneLip !== 0.0) {
            // applied in every mode so it fades out rather than vanishing
            this.art.lipAperture = clamp(this.art.lipAperture + this.tuneLip, 0.04, 1.0);
        }
        if (this.hum > 0.0) {
            this.art.lipAperture = this.art.lipAperture * (1.0 - this.hum);
            this.art.velum = Math.max(this.art.velum, 0.9 * this.hum);
        }
        if (this.stopLip > 0.001) {
            // Sealed lips still leak a little (the cheeks and walls yield).
            this.art.lipAperture = Math.max(0.012, this.art.lipAperture * (1.0 - this.stopLip));
        }
        if (this.stopTip > 0.001) {
            this.art.tipPos = 0.9;
            this.art.tipClose = Math.max(this.art.tipClose, this.stopTip);
        }
        if (this.velumOpen > 0.001) {
            this.art.velum = Math.max(this.art.velum, 0.9 * this.velumOpen);
        }
    }

    advanceOscillator(dt) {
        if (this.oscRate <= 0.0 || (this.oscDepth <= 0.0 && this.oscRound <= 0.0)) {
            this.oscValue = 0.0;
            return;
        }
        this.oscPhase = this.oscPhase + this.oscRate * dt;
        this.oscPhase = this.oscPhase - Math.floor(this.oscPhase);
        this.oscValue = oscillatorWave(this.oscShape, this.oscPhase);
    }

    // Feedback formant tuning, run every few control blocks. The singer's
    // current tube is analysed exactly; resonance 1 or 2 is compared with its
    // target and one path variable is moved toward it.
    tuneFormants(dt) {
        const gain = Math.min(1.0, dt * 40.0);
        if (this.tuning === "none") {
            this.r1Mix = this.r1Mix * Math.exp(-dt / 0.15);
            this.tuneLip = this.tuneLip * Math.exp(-dt / 0.15);
            return;
        }
        // A closed or nasalised mouth has no oral resonance to listen to:
        // hold the tuning until it opens again (no wind-up during an Om).
        if (this.hum > 0.15 || this.stopLip > 0.15 || this.stopTip > 0.15 || this.velumOpen > 0.15) {
            return;
        }
        const rate = this.tickRate;
        const pole = radiationPole(lipRadius(this.areas), rate, SPEED_OF_SOUND);
        const found = scanPeaks(this.areas, rate, 0.95, pole, 90.0, 3000.0, 35.0, this.peaks, 4);
        if (found < 2) {
            return;
        }
        const f1 = this.peaks[0];
        const f2 = this.peaks[1];
        this.measuredF1 = f1;
        this.measuredF2 = f2;
        const f0 = this.f0;
        if (this.tuning === "r1") {
            const e = Math.log(1.1 * f0 / f1);
            this.r1Mix = clamp(this.r1Mix + 0.8 * e * gain, 0.0, 1.0);
        } else if (this.tuning === "overtone" || this.tuning === "sygyt") {
            const e = Math.log(this.harmonic * f0 / f2);
            this.pathQ = clamp(this.pathQ + 0.6 * e * gain, 0.0, 1.0);
        } else if (this.tuning === "gyuto") {
            const e2 = Math.log(10.0 * f0 / f2);
            this.pathQ = clamp(this.pathQ + 0.8 * e2 * gain, 0.0, 1.0);
            const e1 = Math.log(5.0 * f0 / f1);
            this.tuneLip = clamp(this.tuneLip + 0.5 * e1 * gain, -0.45, 0.45);
        }
    }

    updatePitch(dt) {
        const diff = this.noteTarget - this.note;
        const step = this.glideRate * dt;
        if (Math.abs(diff) <= step) {
            this.note = this.noteTarget;
        } else if (diff > 0.0) {
            this.note = this.note + step;
        } else {
            this.note = this.note - step;
        }
        // Vibrato grows in after the onset, with a little rate wander.
        this.vibratoOnset = Math.min(1.0, this.vibratoOnset + dt / 0.6);
        const wander = 1.0 + 0.08 * (this.rand() - 0.5);
        this.vibratoPhase = this.vibratoPhase + this.vibratoRate * wander * dt;
        if (this.vibratoPhase > 1.0) {
            this.vibratoPhase = this.vibratoPhase - 1.0;
        }
        const vib = this.vibratoDepth * this.vibratoOnset * Math.sin(2.0 * Math.PI * this.vibratoPhase);
        // Slow pitch wander: an Ornstein-Uhlenbeck process in cents with a
        // 1.5 s memory and driftCents standard deviation.
        const tau = 1.5;
        const gaussian = (this.rand() + this.rand() + this.rand() - 1.5) * 2.0;
        this.drift = this.drift - this.drift * dt / tau + this.driftCents * Math.sqrt(2.0 * dt / tau) * gaussian;
        const cents = this.detune + this.drift;
        this.f0 = noteToHz(this.note + this.bend + vib + cents / 100.0);
    }

    updateEnvelope(dt) {
        if (this.delayCounter > 0) {
            this.delayCounter = this.delayCounter - 1;
            return;
        }
        let target = 0.0;
        let tau = this.release;
        if (this.gate) {
            target = 1.0;
            tau = this.attack;
        }
        this.envelope = this.envelope + (target - this.envelope) * (1.0 - Math.exp(-dt / Math.max(tau, 0.002)));
    }

    updateSource(dt) {
        const k = 1.0 - Math.exp(-dt / 0.08);
        const s = this.source;
        const t = this.sourceTarget;
        s.oq = s.oq + (t.oq - s.oq) * k;
        s.skew = s.skew + (t.skew - s.skew) * k;
        s.qa = s.qa + (t.qa - s.qa) * k;
        s.leak = s.leak + (t.leak - s.leak) * k;
        s.breath = s.breath + (t.breath - s.breath) * k;
        s.jitter = t.jitter;
        s.shimmer = t.shimmer;
        s.vent = s.vent + (t.vent - s.vent) * k;
    }

    // Recompute the tube for this control block and hand it to the tract.
    updateShape(blockTicks) {
        const L = areaFunction(this.anatomy, this.art, this.areas, this.seg);
        this.length = L;
        this.tickRate = SECTIONS * SPEED_OF_SOUND / L;
        const nc = nasalAreas(this.anatomy, this.seg, this.nasal);
        this.nasalCount = nc;
        const vj = velumJunction(this.seg);
        const va = velumArea(this.anatomy, this.art);
        const lipPole = radiationPole(lipRadius(this.areas), this.tickRate, SPEED_OF_SOUND);
        const noseRadius = Math.sqrt(this.nasal[nc - 1] / Math.PI);
        const nosePole = radiationPole(noseRadius, this.tickRate, SPEED_OF_SOUND);
        this.tract.setShape(this.areas, nc, this.nasal, vj, va, lipPole, nosePole, blockTicks);
        if (Math.abs(this.tickRate - this.lpRate) > 1.0) {
            designLowpass(0.45 * this.sampleRate, this.tickRate, this.lp);
            this.lpRate = this.tickRate;
        }
    }

    // Render n samples (n <= CONTROL_BLOCK) adding into outL/outR at offset.
    render(outL, outR, offset, n) {
        const dt = n / this.sampleRate;
        this.updateEnvelope(dt);
        this.updatePitch(dt);
        this.updateSource(dt);
        this.updateArticulation(dt);
        this.tuneCounter = this.tuneCounter + 1;
        if (this.tuneCounter >= 4) {
            this.tuneFormants(dt * 4.0);
            this.tuneCounter = 0;
        }
        const ratio = this.tickRate / this.sampleRate;
        this.updateShape(Math.max(1, Math.round(n * ratio)));
        const tickRatio = this.tickRate / this.sampleRate;
        // A closed mouth with a closed velum lets pressure build above the
        // glottis, so the flow through the folds (and the voicing) drops.
        const occlusion = Math.max(this.stopLip, this.stopTip) * (1.0 - this.art.velum);
        const amp = this.envelope * (0.35 + 0.65 * this.velocityOrOne()) * (0.4 + 0.9 * this.effort) * (1.0 - 0.9 * occlusion);
        // Behind a seal the yielding walls absorb the trapped pressure.
        this.tract.loss = SECTION_LOSS * (1.0 - 0.006 * occlusion);
        const glottis = this.glottis;
        const tract = this.tract;
        const src = this.source;
        const f0 = this.f0;
        const rate = this.tickRate;
        const effort = this.effort;
        const lp = this.lp;
        const gain = this.calibration * this.level;
        const panL = Math.cos(0.25 * Math.PI * (this.pan + 1.0));
        const panR = Math.sin(0.25 * Math.PI * (this.pan + 1.0));
        let energy = 0.0;
        for (let i = 0; i < n; i = i + 1) {
            this.tickAcc = this.tickAcc + tickRatio;
            while (this.tickAcc >= 1.0) {
                this.tickAcc = this.tickAcc - 1.0;
                glottis.tick(f0, rate, src, effort, amp);
                const flow = tract.tick(glottis.flow, glottis.reflection);
                const radiated = flow - this.prevFlow;
                this.prevFlow = flow;
                const y = lp.b0 * radiated + lp.b1 * this.lpX1 + lp.b2 * this.lpX2 - lp.a1 * this.lpY1 - lp.a2 * this.lpY2;
                this.lpX2 = this.lpX1;
                this.lpX1 = radiated;
                this.lpY2 = this.lpY1;
                this.lpY1 = y;
                this.prevOut = this.curOut;
                this.curOut = y;
            }
            const s = (this.prevOut + (this.curOut - this.prevOut) * this.tickAcc) * gain;
            energy = energy + s * s;
            outL[offset + i] = outL[offset + i] + s * panL;
            outR[offset + i] = outR[offset + i] + s * panR;
        }
        if (energy < 1e-12 && !this.gate) {
            this.silentBlocks = this.silentBlocks + 1;
        } else {
            this.silentBlocks = 0;
        }
    }

    velocityOrOne() {
        if (this.velocity === undefined) {
            return 1.0;
        }
        return this.velocity;
    }
}

export { ARTICULATION_KEYS };
