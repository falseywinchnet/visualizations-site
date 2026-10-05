// The HDR tab's audio: one HDR voice and, for A/B, the physical voice it
// extends with the same body, register and gestures.

import { Singer, CONTROL_BLOCK } from "./singer.js?v=27da92ec4d";
import { HdrVoice, LAYERS } from "./hdr.js?v=59f003b9e2";
import { makeAnatomy } from "./anatomy.js?v=9500908dbe";
import { makeVoiceSource } from "./glottis.js?v=aa724f7289";
import { Hall } from "./choir.js?v=e293c30802";

function probeRms(voice) {
    const t = voice.anatomy.type;
    const VT = { basso: 43, bass: 48, baritone: 50, tenor: 55, countertenor: 62, alto: 62, mezzo: 65, soprano: 69, treble: 67 };
    const note = VT[t] !== undefined ? VT[t] : 50;
    voice.vibratoDepth = 0.0;
    voice.vowel = 0.5;
    voice.vowelTarget = 0.5;
    voice.noteOn(note, 0.85);
    const l = new Float32Array(CONTROL_BLOCK);
    const r = new Float32Array(CONTROL_BLOCK);
    let sum = 0.0;
    const blocks = Math.round(0.35 * voice.sampleRate / CONTROL_BLOCK);
    for (let b = 0; b < blocks; b = b + 1) {
        l.fill(0.0);
        r.fill(0.0);
        voice.render(l, r, 0, CONTROL_BLOCK);
        if (b > blocks / 3) {
            for (let i = 0; i < CONTROL_BLOCK; i = i + 1) {
                sum = sum + l[i] * l[i];
            }
        }
    }
    return sum;
}

export class HdrStage {
    constructor(sampleRate) {
        this.sr = sampleRate;
        this.type = "baritone";
        this.register = "chest";
        this.model = "hdr";
        this.held = [];
        this.padDown = false;
        this.settings = { vowel: 0.5, tip: 0.0, hum: 0.0, effort: 0.7, vibrato: 0.15, glide: 0.12 };
        this.hall = new Hall(sampleRate);
        this.hall.mix = 0.18;
        this.hall.setTime(2.2, 0.45);
        this.l = new Float32Array(CONTROL_BLOCK);
        this.r = new Float32Array(CONTROL_BLOCK);
        this.build();
    }

    build() {
        // Loudness-match the A/B: sing the same "ah" on both models silently
        // and scale the HDR voice to the physical one's RMS, so a comparison
        // is not won by level.
        const probeHdr = new HdrVoice(this.sr, makeAnatomy(this.type), this.register, 4242);
        const probeBase = new Singer(this.sr, makeAnatomy(this.type), this.register, 4242);
        const ratio = Math.sqrt(probeRms(probeBase) / Math.max(probeRms(probeHdr), 1e-20));
        this.hdr = new HdrVoice(this.sr, makeAnatomy(this.type), this.register, 4242);
        this.base = new Singer(this.sr, makeAnatomy(this.type), this.register, 4242);
        this.hdr.level = this.hdr.level * Math.min(4.0, Math.max(0.25, ratio));
        this.applySettings(this.hdr);
        this.applySettings(this.base);
    }

    applySettings(v) {
        const st = this.settings;
        v.vowelTarget = st.vowel;
        v.stopTipTarget = st.tip;
        v.humTarget = st.hum;
        v.effort = st.effort;
        v.vibratoDepth = st.vibrato;
        v.glideRate = 1.0 / Math.max(st.glide, 0.005) * 2.0;
        v.vowelGlide = 0.05;
    }

    configure(type, register) {
        const playing = this.held.length > 0 || this.padDown;
        const note = this.currentNote;
        const layers = this.hdr.layers;
        const amount = this.hdr.amount;
        const exposure = this.hdr.exposure;
        this.type = type;
        this.register = register;
        this.build();
        this.hdr.layers = layers;
        this.hdr.amount = amount;
        this.hdr.exposure = exposure;
        if (playing && note !== undefined) {
            this.hdr.noteOn(note, 0.85);
            this.base.noteOn(note, 0.85);
        }
    }

    set(name, value) {
        if (name === "model") {
            this.model = value;
            return;
        }
        if (name.indexOf("layer.") === 0) {
            this.hdr.layers[name.substring(6)] = value;
            return;
        }
        if (name.indexOf("amount.") === 0) {
            this.hdr.amount[name.substring(7)] = value;
            return;
        }
        if (name === "exposure") {
            const e = this.hdr.exposure;
            e.mid = value === "fused" || value === "mid" ? 1.0 : 0.0;
            e.shadow = value === "fused" || value === "shadow" ? 1.0 : 0.0;
            e.high = value === "fused" || value === "high" ? 1.0 : 0.0;
            // a solo layer is quiet; lift it so its detail can be heard
            const lift = value === "shadow" ? 6.0 : (value === "high" ? 8.0 : 1.0);
            e.mid = e.mid * (value === "mid" ? 1.0 : 1.0);
            e.shadow = e.shadow * lift;
            e.high = e.high * lift;
            return;
        }
        if (name === "hall") {
            this.hall.mix = value;
            return;
        }
        this.settings[name] = value;
        this.applySettings(this.hdr);
        this.applySettings(this.base);
    }

    noteOn(note) {
        this.held = this.held.filter(function other(n) { return n !== note; });
        this.held.push(note);
        this.currentNote = note;
        this.hdr.noteOn(note, 0.85);
        this.base.noteOn(note, 0.85);
    }

    noteOff(note) {
        this.held = this.held.filter(function other(n) { return n !== note; });
        if (this.held.length > 0) {
            this.noteOn(this.held[this.held.length - 1]);
        } else if (!this.padDown) {
            this.hdr.noteOff();
            this.base.noteOff();
        }
    }

    pad(note, vowel, down) {
        this.settings.vowel = vowel;
        this.applySettings(this.hdr);
        this.applySettings(this.base);
        if (down) {
            this.padDown = true;
            this.currentNote = note;
            this.hdr.noteOn(note, 0.85);
            this.base.noteOn(note, 0.85);
        } else {
            this.padDown = false;
            if (this.held.length === 0) {
                this.hdr.noteOff();
                this.base.noteOff();
            }
        }
    }

    allOff() {
        this.held = [];
        this.padDown = false;
        this.hdr.noteOff();
        this.base.noteOff();
    }

    process(outL, outR, n) {
        let done = 0;
        const voice = this.model === "hdr" ? this.hdr : this.base;
        while (done < n) {
            const m = Math.min(CONTROL_BLOCK, n - done);
            const l = this.l;
            const r = this.r;
            l.fill(0.0, 0, m);
            r.fill(0.0, 0, m);
            if (voice.isAwake()) {
                voice.render(l, r, 0, m);
            }
            for (let k = 0; k < m; k = k + 1) {
                l[k] = l[k] * 0.35;
                r[k] = r[k] * 0.35;
            }
            this.hall.process(l, r, m);
            for (let k = 0; k < m; k = k + 1) {
                outL[done + k] = Math.tanh(l[k]);
                outR[done + k] = Math.tanh(r[k]);
            }
            done = done + m;
        }
    }

    telemetry() {
        const v = this.model === "hdr" ? this.hdr : this.base;
        const h = this.hdr;
        return {
            model: this.model,
            f0: v.f0, env: v.envelope, jaw: v.art.jaw, lip: v.art.lipAperture, protrusion: v.art.lipProtrusion,
            velum: v.art.velum, length: v.length, oq: v.source.oq,
            meters: { mid: h.meter.mid, shadow: h.meter.shadow, high: h.meter.high },
            ps: h.ps, p0Ratio: h.p0Ratio, noiseCentre: h.noiseCentre, noiseGain: h.noiseGain,
            cross: h.crossFreq.slice(), layers: Object.assign({}, h.layers)
        };
    }
}

export { LAYERS, makeVoiceSource };
