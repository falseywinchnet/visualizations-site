// The ensemble: independent physical singers, each with its own body,
// register, key offset, timing and place in the room, plus a hall.
//
// A chorus effect here is not a modulated delay: it is several bodies with
// independent glottal jitter, vibrato, pitch wander and onsets, whose small
// disagreements are what a real choir sounds like.

import { Singer, CONTROL_BLOCK, hzToNote } from "./singer.js";
import { makeAnatomy, VOICE_TYPES } from "./anatomy.js";
import { REGISTERS } from "./glottis.js";
import { CLASSIC_BODY } from "./vowels.js";

export const MAX_SINGERS = 24;

export function makeSingerConfig(type, register, interval) {
    return {
        type: type,               // key of VOICE_TYPES or "classic"
        register: register,       // key of REGISTERS
        interval: interval,       // semitones from the played note
        octave: "auto",           // "auto" folds into the singer's range, or a number of octaves
        pan: 0.0,
        level: 1.0,
        tuning: "none",           // none | r1 | overtone | sygyt | gyuto
        harmonic: 10,
        vibratoRate: 5.2,
        vibratoDepth: 0.2,        // semitones
        detune: 0.0,              // cents
        driftCents: 5.0,
        onset: 0.0,               // seconds
        epilarynx: 0.3,
        larynx: 0.0,
        effort: 0.6,
        lengthScale: 1.0          // individual body size around the type
    };
}

export function anatomyFor(cfg) {
    if (cfg.type === "classic") {
        return { type: "classic", pharynx: CLASSIC_BODY.pharynx * cfg.lengthScale, oral: CLASSIC_BODY.oral * cfg.lengthScale, areaScale: cfg.lengthScale * cfg.lengthScale, nasal: CLASSIC_BODY.nasal * cfg.lengthScale };
    }
    return makeAnatomy(cfg.type, cfg.lengthScale);
}

export function rangeFor(type) {
    if (type === "classic") {
        return { low: 98.0, high: 392.0 };
    }
    const t = VOICE_TYPES[type];
    return { low: t.f0Low, high: t.f0High };
}

// Fold a note into a singer's comfortable range by octaves.
export function foldIntoRange(note, type) {
    const r = rangeFor(type);
    const lo = hzToNote(r.low) + 2.0;
    const hi = hzToNote(r.high) - 4.0;
    let n = note;
    while (n < lo) {
        n = n + 12.0;
    }
    while (n > hi && n - 12.0 >= lo) {
        n = n - 12.0;
    }
    return n;
}

// Feedback-delay-network hall: 8 lines, Hadamard mixing, per-line decay and
// high-frequency damping, short pre-delay. Stereo from alternating lines.
const FDN_LENGTHS = [1559, 1877, 2311, 2633, 3089, 3449, 3907, 4271];

export class Hall {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.lines = [];
        this.pos = [];
        this.len = [];
        this.gain = new Float64Array(8);
        this.damp = new Float64Array(8);
        this.state = new Float64Array(8);
        this.out = new Float64Array(8);
        const scale = sampleRate / 48000.0;
        for (let i = 0; i < 8; i = i + 1) {
            const n = Math.round(FDN_LENGTHS[i] * scale * 1.3);
            this.lines.push(new Float32Array(n + 1));
            this.len.push(n);
            this.pos.push(0);
        }
        this.preLen = Math.round(0.025 * sampleRate);
        this.pre = new Float32Array(this.preLen + 1);
        this.prePos = 0;
        this.mix = 0.3;
        this.setTime(3.5, 0.45);
    }

    setTime(rt60, damping) {
        this.rt60 = rt60;
        this.damping = damping;
        for (let i = 0; i < 8; i = i + 1) {
            this.gain[i] = Math.pow(10.0, -3.0 * this.len[i] / (rt60 * this.sampleRate));
            this.damp[i] = damping;
        }
    }

    process(l, r, n) {
        const lines = this.lines;
        const out = this.out;
        const h = 1.0 / Math.sqrt(8.0);
        const wet = this.mix;
        for (let k = 0; k < n; k = k + 1) {
            const input = 0.5 * (l[k] + r[k]);
            const delayed = this.pre[this.prePos];
            this.pre[this.prePos] = input;
            this.prePos = this.prePos + 1;
            if (this.prePos > this.preLen) {
                this.prePos = 0;
            }
            for (let i = 0; i < 8; i = i + 1) {
                const raw = lines[i][this.pos[i]];
                this.state[i] = raw + this.damp[i] * (this.state[i] - raw);
                out[i] = this.state[i] * this.gain[i];
            }
            // Fast Walsh-Hadamard transform of out (8 points), in place.
            let a0 = out[0] + out[1], a1 = out[0] - out[1], a2 = out[2] + out[3], a3 = out[2] - out[3];
            let a4 = out[4] + out[5], a5 = out[4] - out[5], a6 = out[6] + out[7], a7 = out[6] - out[7];
            const b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
            const b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
            const m0 = (b0 + b4) * h, m1 = (b1 + b5) * h, m2 = (b2 + b6) * h, m3 = (b3 + b7) * h;
            const m4 = (b0 - b4) * h, m5 = (b1 - b5) * h, m6 = (b2 - b6) * h, m7 = (b3 - b7) * h;
            const wetL = out[0] + out[2] + out[4] + out[6];
            const wetR = out[1] + out[3] + out[5] + out[7];
            lines[0][this.pos[0]] = m0 + delayed;
            lines[1][this.pos[1]] = m1 - delayed;
            lines[2][this.pos[2]] = m2 + delayed;
            lines[3][this.pos[3]] = m3 - delayed;
            lines[4][this.pos[4]] = m4 + delayed;
            lines[5][this.pos[5]] = m5 - delayed;
            lines[6][this.pos[6]] = m6 + delayed;
            lines[7][this.pos[7]] = m7 - delayed;
            for (let i = 0; i < 8; i = i + 1) {
                this.pos[i] = this.pos[i] + 1;
                if (this.pos[i] >= this.len[i]) {
                    this.pos[i] = 0;
                }
            }
            l[k] = l[k] + wet * 0.35 * wetL;
            r[k] = r[k] + wet * 0.35 * wetR;
        }
    }
}

export class Choir {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.members = [];
        this.held = [];
        this.voicing = "stack";   // stack: every singer sings note+interval; chord: split held notes
        this.vowel = 0.5;
        this.hum = 0.0;
        this.bend = 0.0;
        this.halftone = 0.0;
        this.harmonic = 10;
        this.effortScale = 1.0;
        this.glide = 0.15;        // seconds per semitone-ish feel, mapped to glide rate
        this.master = 0.5;
        this.hall = new Hall(sampleRate);
        this.mixL = new Float32Array(CONTROL_BLOCK);
        this.mixR = new Float32Array(CONTROL_BLOCK);
        this.padActive = false;
        this.padNote = 48.0;
        this.seedCounter = 1;
    }

    configure(config) {
        const keep = this.members;
        this.members = [];
        for (let i = 0; i < config.singers.length && i < MAX_SINGERS; i = i + 1) {
            const cfg = Object.assign(makeSingerConfig("baritone", "chest", 0), config.singers[i]);
            let singer = null;
            if (i < keep.length && keep[i].cfg.type === cfg.type && keep[i].cfg.lengthScale === cfg.lengthScale) {
                singer = keep[i].singer;
            } else {
                this.seedCounter = this.seedCounter + 1;
                singer = new Singer(this.sampleRate, anatomyFor(cfg), cfg.register, 1000 + 7919 * this.seedCounter + i);
            }
            this.applyConfig(singer, cfg);
            this.members.push({ singer: singer, cfg: cfg });
        }
        if (config.voicing !== undefined) {
            this.voicing = config.voicing;
        }
        if (config.hall !== undefined) {
            this.hall.mix = config.hall.mix;
            this.hall.setTime(config.hall.rt60, config.hall.damping);
        }
        this.retarget(false);
    }

    applyConfig(singer, cfg) {
        singer.setRegister(cfg.register);
        singer.pan = cfg.pan;
        singer.level = cfg.level;
        singer.tuning = cfg.tuning;
        singer.harmonic = cfg.harmonic;
        singer.vibratoRate = cfg.vibratoRate;
        singer.vibratoDepth = cfg.vibratoDepth;
        singer.detune = cfg.detune;
        singer.driftCents = cfg.driftCents;
        singer.onsetDelay = cfg.onset;
        singer.epilarynx = cfg.epilarynx;
        singer.larynx = cfg.larynx;
        singer.effort = cfg.effort;
        this.applyGlobals(singer, cfg);
    }

    applyGlobals(singer, cfg) {
        singer.vowelTarget = this.vowel;
        singer.humTarget = this.hum;
        singer.bend = this.bend;
        singer.glideRate = 1.0 / Math.max(this.glide, 0.005) * 2.0;
        if (cfg.tuning === "overtone" || cfg.tuning === "sygyt") {
            singer.harmonic = this.harmonic;
        }
        const base = REGISTERS[cfg.register].vent;
        singer.sourceTarget.vent = Math.max(base, this.halftone);
        singer.effort = Math.min(1.0, cfg.effort * this.effortScale);
    }

    setGlobal(name, value) {
        if (name === "vowel") {
            this.vowel = value;
        } else if (name === "hum") {
            this.hum = value;
        } else if (name === "bend") {
            this.bend = value;
        } else if (name === "halftone") {
            this.halftone = value;
        } else if (name === "harmonic") {
            this.harmonic = value;
        } else if (name === "effort") {
            this.effortScale = value;
        } else if (name === "glide") {
            this.glide = value;
        } else if (name === "master") {
            this.master = value;
        } else if (name === "hallMix") {
            this.hall.mix = value;
        } else if (name === "hallTime") {
            this.hall.setTime(value, this.hall.damping);
        } else if (name === "voicing") {
            this.voicing = value;
            this.retarget(false);
        }
        for (let i = 0; i < this.members.length; i = i + 1) {
            this.applyGlobals(this.members[i].singer, this.members[i].cfg);
        }
    }

    noteFor(member, note) {
        const cfg = member.cfg;
        const n = note + cfg.interval;
        if (cfg.octave === "auto") {
            return foldIntoRange(n, cfg.type);
        }
        return n + 12.0 * cfg.octave;
    }

    // Recompute every singer's target from the held notes (or the pad).
    retarget(fresh) {
        const notes = [];
        if (this.padActive) {
            notes.push(this.padNote);
        } else {
            for (let i = 0; i < this.held.length; i = i + 1) {
                notes.push(this.held[i].note);
            }
        }
        if (notes.length === 0) {
            for (let i = 0; i < this.members.length; i = i + 1) {
                this.members[i].singer.noteOff();
            }
            return;
        }
        if (this.voicing === "chord" && notes.length > 1) {
            const sorted = notes.slice().sort(compareNumbers);
            const order = [];
            for (let i = 0; i < this.members.length; i = i + 1) {
                order.push(i);
            }
            const members = this.members;
            order.sort(function compareRange(a, b) {
                return rangeCentre(members[a].cfg.type) - rangeCentre(members[b].cfg.type);
            });
            for (let k = 0; k < order.length; k = k + 1) {
                const idx = Math.min(sorted.length - 1, Math.floor(k * sorted.length / order.length));
                const m = this.members[order[k]];
                this.sing(m, foldIntoRange(sorted[idx], m.cfg.type));
            }
            return;
        }
        // stack voicing: the most recent note, each singer at its interval
        const top = notes[notes.length - 1];
        for (let i = 0; i < this.members.length; i = i + 1) {
            const m = this.members[i];
            this.sing(m, this.noteFor(m, top));
        }
    }

    sing(member, note) {
        member.singer.noteOn(note, this.velocity === undefined ? 0.85 : this.velocity);
    }

    noteOn(note, velocity) {
        this.velocity = velocity;
        this.noteOffInternal(note);
        this.held.push({ note: note, velocity: velocity });
        this.retarget(true);
    }

    noteOffInternal(note) {
        const kept = [];
        for (let i = 0; i < this.held.length; i = i + 1) {
            if (this.held[i].note !== note) {
                kept.push(this.held[i]);
            }
        }
        this.held = kept;
    }

    noteOff(note) {
        this.noteOffInternal(note);
        this.retarget(false);
    }

    allNotesOff() {
        this.held = [];
        this.padActive = false;
        this.retarget(false);
    }

    pad(note, down) {
        this.padNote = note;
        const was = this.padActive;
        this.padActive = down;
        if (down || was) {
            this.retarget(!was);
        }
    }

    process(outL, outR, n) {
        let offset = 0;
        while (offset < n) {
            const m = Math.min(CONTROL_BLOCK, n - offset);
            const l = this.mixL;
            const r = this.mixR;
            l.fill(0.0, 0, m);
            r.fill(0.0, 0, m);
            for (let i = 0; i < this.members.length; i = i + 1) {
                const s = this.members[i].singer;
                if (s.isAwake()) {
                    s.render(l, r, 0, m);
                }
            }
            const g = this.master * 0.8 / Math.sqrt(Math.max(1, this.members.length));
            for (let k = 0; k < m; k = k + 1) {
                l[k] = l[k] * g;
                r[k] = r[k] * g;
            }
            this.hall.process(l, r, m);
            for (let k = 0; k < m; k = k + 1) {
                outL[offset + k] = softClip(l[k]);
                outR[offset + k] = softClip(r[k]);
            }
            offset = offset + m;
        }
    }

    telemetry() {
        const out = [];
        for (let i = 0; i < this.members.length; i = i + 1) {
            const s = this.members[i].singer;
            out.push({
                f0: s.f0, env: s.envelope, jaw: s.art.jaw, lip: s.art.lipAperture,
                protrusion: s.art.lipProtrusion, tongue: s.art.tonguePos, tongueHeight: s.art.tongueHeight,
                velum: s.art.velum, length: s.length, F1: s.measuredF1, F2: s.measuredF2,
                vent: s.source.vent, oq: s.source.oq, gate: s.gate,
                tipPos: s.art.tipPos, tipClose: s.art.tipClose, epilarynx: s.art.epilarynx, larynx: s.art.larynx,
                tuning: s.tuning, harmonic: s.harmonic
            });
        }
        return out;
    }
}

function compareNumbers(a, b) {
    return a - b;
}

function rangeCentre(type) {
    const r = rangeFor(type);
    return Math.sqrt(r.low * r.high);
}

function softClip(x) {
    if (x > 1.5) {
        return 1.0;
    }
    if (x < -1.5) {
        return -1.0;
    }
    return x - (4.0 / 27.0) * x * x * x;
}
