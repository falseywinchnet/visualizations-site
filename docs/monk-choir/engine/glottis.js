// Glottal source with physically meaningful register controls.
//
// One glottal cycle (phase 0..1) is an opening/closing flow pulse:
//   opening   0 .. Oq*Sk        u = (1 - cos(pi t/To)) / 2
//   closing   Oq*Sk .. Oq       u = cos(pi/2 * t/Tc)       (abrupt closure)
//   closed    Oq .. 1           u = 0
// Oq (open quotient) and Sk (skew: share of the open phase spent opening) set
// the register. The return phase Qa, the time the folds take to seal after
// the main closure, acts as a first-order low-pass on the flow with time
// constant Qa * T0: abrupt sealing (pressed, loud) keeps high harmonics,
// slow sealing (falsetto, soft) removes them. Leak is flow through a glottis
// that never fully closes. Breath is turbulence noise, modulated by flow.
//
// Ventricular folds (dzo-ke, kargyraa): the false folds above the glottis
// vibrate at half the glottal rate and partially occlude every second pulse.
// This is the physical origin of the sub-octave ("half") tone. ventRatio sets
// how many glottal cycles one ventricular cycle spans: 2 is the sub-octave
// (kargyraa, the Sardinian bassu), 1 has both pairs of folds moving in step
// (a doubled, harder pulse, as reported for the Sardinian contra), 3 gives
// a sub-twelfth (the fundamental divided by three).
//
// Direction: +1 is ordinary exhaled voice. -1 is voice on the in-breath
// (ingressive), as in Inuit breath games: the flow reverses and, in this
// model, the pulse is mirrored in time (the folds are pushed apart from
// above, so they open abruptly and close gradually), with more turbulence
// and less stable cycles. The mirrored pulse is our modelling assumption.
//
// Voicing 0..1 scales the vibrating pulse; without it the folds stand apart
// and the breath is only turbulence (the "h" of a whispered or breathed step).
//
// The glottal opening also sets the reflection at the glottal end of the
// tract: while the folds are open, acoustic energy leaks into the trachea, so
// formant bandwidths widen in breathy and falsetto voices and narrow in
// pressed voice. That is computed here per tick.

export const REGISTERS = {
    chest: { label: "Chest (modal)", oq: 0.5, skew: 0.72, qa: 0.06, leak: 0.02, breath: 0.025, jitter: 0.004, shimmer: 0.03, vent: 0.0 },
    pressed: { label: "Pressed (khöömei)", oq: 0.33, skew: 0.8, qa: 0.02, leak: 0.0, breath: 0.012, jitter: 0.003, shimmer: 0.02, vent: 0.0 },
    head: { label: "Head / mixed", oq: 0.62, skew: 0.68, qa: 0.12, leak: 0.05, breath: 0.045, jitter: 0.004, shimmer: 0.03, vent: 0.0 },
    falsetto: { label: "Falsetto", oq: 0.85, skew: 0.58, qa: 0.3, leak: 0.16, breath: 0.09, jitter: 0.005, shimmer: 0.035, vent: 0.0 },
    breathy: { label: "Breathy", oq: 0.78, skew: 0.62, qa: 0.25, leak: 0.28, breath: 0.2, jitter: 0.006, shimmer: 0.04, vent: 0.0 },
    ventricular: { label: "Ventricular (dzo-ke / kargyraa)", oq: 0.42, skew: 0.75, qa: 0.035, leak: 0.01, breath: 0.03, jitter: 0.005, shimmer: 0.04, vent: 0.75 },
    fry: { label: "Strohbass / fry", oq: 0.28, skew: 0.8, qa: 0.03, leak: 0.0, breath: 0.02, jitter: 0.04, shimmer: 0.15, vent: 0.3 },
    // Not a voice: the steel reed of a jaw harp (khomus), plucked in front
    // of the mouth. A narrow, abrupt, very steady pulse; the player's mouth
    // chooses its harmonics exactly as a throat singer's does.
    reed: { label: "Jaw-harp reed (khomus)", oq: 0.1, skew: 0.5, qa: 0.004, leak: 0.0, breath: 0.001, jitter: 0.0005, shimmer: 0.004, vent: 0.0 }
};

// Extra turbulence when the folds stand apart (breath-only steps).
export const UNVOICED_BREATH = 0.35;

export function makeVoiceSource(registerKey) {
    const r = REGISTERS[registerKey];
    return {
        oq: r.oq, skew: r.skew, qa: r.qa, leak: r.leak, breath: r.breath,
        jitter: r.jitter, shimmer: r.shimmer, vent: r.vent,
        ventRatio: 2, direction: 1.0, voicing: 1.0
    };
}

export function copyVoiceSource(src, dst) {
    dst.oq = src.oq;
    dst.skew = src.skew;
    dst.qa = src.qa;
    dst.leak = src.leak;
    dst.breath = src.breath;
    dst.jitter = src.jitter;
    dst.shimmer = src.shimmer;
    dst.vent = src.vent;
    dst.ventRatio = src.ventRatio;
    dst.direction = src.direction;
    dst.voicing = src.voicing;
    return dst;
}

export class Glottis {
    constructor(seed) {
        this.phase = 0.0;
        this.parity = 0;
        this.cycleCount = 0;  // glottal cycles, for the ventricular ratio
        this.cycleRate = 1.0;   // jitter factor for this cycle
        this.cycleAmp = 1.0;    // shimmer factor for this cycle
        this.returnState = 0.0;
        this.noiseState = (seed >>> 0) || 1;
        this.noiseLow = 0.0;
        this.noiseHigh = 0.0;
        this.flow = 0.0;
        this.reflection = 0.97;
        this.opening = 0.0;
    }

    random() {
        // xorshift32 -> [0, 1)
        let x = this.noiseState;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.noiseState = x >>> 0;
        return this.noiseState / 4294967296.0;
    }

    gaussianish() {
        return (this.random() + this.random() + this.random() - 1.5) * 2.0;
    }

    startCycle(src) {
        this.parity = 1 - this.parity;
        const ratio = src.ventRatio >= 1 ? src.ventRatio : 2;
        this.cycleCount = (this.cycleCount + 1) % 6;
        let jitter = src.jitter;
        let shimmer = src.shimmer;
        if (src.direction < 0.0) {
            jitter = jitter * 2.5;
            shimmer = shimmer * 1.8;
        }
        this.cycleRate = 1.0 + jitter * this.gaussianish();
        this.cycleAmp = 1.0 + shimmer * this.gaussianish();
        // The ventricular folds also pull the glottal cycles within one of
        // their own cycles early and late: a second route to the
        // sub-harmonic. (With ratio 2 this alternates exactly as before.)
        if (src.vent > 0.0 && ratio > 1) {
            const k = this.cycleCount % ratio;
            this.cycleRate = this.cycleRate * (1.0 + 0.06 * src.vent * Math.cos(2.0 * Math.PI * (k + 1) / ratio));
        }
    }

    // Advance one tick. f0 in Hz, tickRate in Hz, effort 0..1, amp >= 0.
    // Sets this.flow and this.reflection.
    tick(f0, tickRate, src, effort, amp) {
        this.phase = this.phase + f0 * this.cycleRate / tickRate;
        if (this.phase >= 1.0) {
            this.phase = this.phase - Math.floor(this.phase);
            this.startCycle(src);
        }
        const p = this.phase;
        const oq = src.oq;
        let u = 0.0;
        if (src.direction >= 0.0) {
            const tOpen = oq * src.skew;
            if (p < tOpen) {
                u = 0.5 * (1.0 - Math.cos(Math.PI * p / tOpen));
            } else if (p < oq) {
                u = Math.cos(0.5 * Math.PI * (p - tOpen) / (oq - tOpen));
            }
        } else {
            // in-breath: the same pulse mirrored in time
            const tSnap = oq * (1.0 - src.skew);
            if (p < tSnap) {
                u = Math.sin(0.5 * Math.PI * p / tSnap);
            } else if (p < oq) {
                u = 0.5 * (1.0 + Math.cos(Math.PI * (p - tSnap) / (oq - tSnap)));
            }
        }
        if (src.vent > 0.0) {
            const ratio = src.ventRatio >= 1 ? src.ventRatio : 2;
            const position = ((this.cycleCount % ratio) + p) / ratio;
            const s = Math.sin(Math.PI * position);
            u = u * (1.0 - src.vent * s * s);
        }
        u = u * src.voicing;
        // Louder phonation seals the folds faster.
        const qa = src.qa * (1.45 - 0.9 * effort);
        const ta = Math.max(qa / f0, 1.0 / tickRate);
        const a = Math.exp(-1.0 / (ta * tickRate));
        this.returnState = (1.0 - a) * u + a * this.returnState;
        // Unvoiced: the folds stand apart and the breath streams through.
        const opening = this.returnState + src.leak + 0.35 * (1.0 - src.voicing);
        this.opening = opening;
        // Turbulence at the glottis, scaled by the flow through it. It is
        // shaped to fall above ~2.5 kHz; the mouth's radiation lifts it back
        // to roughly flat. (The first version subtracted a low-passed copy,
        // a high-pass that radiation then lifted again: most of a falsetto's
        // energy sat above 5 kHz and chest-voice HNR measured 4 dB. Same
        // shaping and level as the HDR voice; see .dev/test_hdr.mjs.)
        const white = this.random() * 2.0 - 1.0;
        this.noiseLow = this.noiseLow + (white - this.noiseLow) * (1.0 - Math.exp(-2.0 * Math.PI * 2500.0 / tickRate));
        let breath = src.breath + UNVOICED_BREATH * (1.0 - src.voicing);
        if (src.direction < 0.0) {
            breath = breath * 1.8;
        }
        const noise = this.noiseLow * breath * 0.2 * (0.2 + opening);
        this.flow = src.direction * amp * this.cycleAmp * (opening + noise);
        let r = 0.985 - 0.6 * opening;
        if (r < 0.35) {
            r = 0.35;
        }
        this.reflection = r;
    }
}
