// Accompanying instruments for the song. These are signal models built from
// how each instrument makes sound; they are not the waveguide physics of
// the singers.
//
// Ritual (Tibetan rol-mo) ensemble:
//   Dungchen  long telescopic horn, lip-buzzed: rich low pulse, a bell
//             formant, brightness rising with breath, and a rough
//             half-rate "growl" from uneven lip cycles. Played in pairs that
//             overlap so the drone never breaks.
//   Gyaling   double-reed shawm: buzzy narrow pulse, nasal formants, grace
//             notes from above, played in pairs in heterophony.
//   Rolmo     large cymbals: dense inharmonic modes, struck in accelerating
//             and decelerating patterns.
//   Nga       big frame drum on a stand, hit with a curved stick: membrane
//             modes (Bessel ratios) with a falling-pitch thump.
//   Drilbu    hand bell: a few long-ringing inharmonic modes with beating.
//   Dungkar   conch: a single lip-buzzed tone that scoops up into pitch.
// Tuvan ensemble (for the steppe pieces):
//   Tungur    shaman's frame drum: a wide, slack membrane (low Bessel modes,
//             short ring) and the slap of a soft beater; played in the
//             galloping rhythm.
//   Lute      two-course plucked lute (doshpuluur): plucked strings as
//             delay-line loops whose loss rises with frequency (the string
//             forgets its brightness first), through a small wooden body
//             (two resonances).
// Drop: kick, snare, hats, sub, riser, impact.

function clamp(x, lo, hi) {
    if (x < lo) {
        return lo;
    }
    if (x > hi) {
        return hi;
    }
    return x;
}

export function midiToHz(note) {
    return 440.0 * Math.pow(2.0, (note - 69.0) / 12.0);
}

function polyBlep(t, dt) {
    if (t < dt) {
        const x = t / dt;
        return x + x - x * x - 1.0;
    }
    if (t > 1.0 - dt) {
        const x = (t - 1.0) / dt;
        return x * x + x + x + 1.0;
    }
    return 0.0;
}

// RBJ biquad.
export class Biquad {
    constructor() {
        this.b0 = 1.0; this.b1 = 0.0; this.b2 = 0.0; this.a1 = 0.0; this.a2 = 0.0;
        this.x1 = 0.0; this.x2 = 0.0; this.y1 = 0.0; this.y2 = 0.0;
    }

    setCoefficients(b0, b1, b2, a0, a1, a2) {
        this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    }

    lowpass(f, q, sr) {
        const w = 2.0 * Math.PI * clamp(f, 10.0, 0.45 * sr) / sr;
        const alpha = Math.sin(w) / (2.0 * q);
        const c = Math.cos(w);
        this.setCoefficients((1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0, 1.0 + alpha, -2.0 * c, 1.0 - alpha);
    }

    highpass(f, q, sr) {
        const w = 2.0 * Math.PI * clamp(f, 10.0, 0.45 * sr) / sr;
        const alpha = Math.sin(w) / (2.0 * q);
        const c = Math.cos(w);
        this.setCoefficients((1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0, 1.0 + alpha, -2.0 * c, 1.0 - alpha);
    }

    bandpass(f, q, sr) {
        const w = 2.0 * Math.PI * clamp(f, 10.0, 0.45 * sr) / sr;
        const alpha = Math.sin(w) / (2.0 * q);
        const c = Math.cos(w);
        this.setCoefficients(alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * c, 1.0 - alpha);
    }

    peak(f, q, gainDb, sr) {
        const w = 2.0 * Math.PI * clamp(f, 10.0, 0.45 * sr) / sr;
        const A = Math.pow(10.0, gainDb / 40.0);
        const alpha = Math.sin(w) / (2.0 * q);
        const c = Math.cos(w);
        this.setCoefficients(1.0 + alpha * A, -2.0 * c, 1.0 - alpha * A, 1.0 + alpha / A, -2.0 * c, 1.0 - alpha / A);
    }

    process(x) {
        const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
        return y;
    }
}

class Noise {
    constructor(seed) {
        this.s = (seed >>> 0) || 1;
    }

    next() {
        let x = this.s;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.s = x >>> 0;
        return this.s / 2147483648.0 - 1.0;
    }
}

// A bank of decaying two-pole resonators, excited by impulses: modal synthesis.
class ModalBank {
    constructor(sr, freqs, t60s, gains) {
        const n = freqs.length;
        this.n = n;
        this.c1 = new Float64Array(n);
        this.c2 = new Float64Array(n);
        this.y1 = new Float64Array(n);
        this.y2 = new Float64Array(n);
        this.g = new Float64Array(n);
        this.freqs = Float64Array.from(freqs);
        this.sr = sr;
        for (let i = 0; i < n; i = i + 1) {
            const f = Math.min(freqs[i], 0.45 * sr);
            const r = Math.pow(0.001, 1.0 / (t60s[i] * sr));
            this.c1[i] = 2.0 * r * Math.cos(2.0 * Math.PI * f / sr);
            this.c2[i] = -r * r;
            this.g[i] = gains[i] * Math.sin(2.0 * Math.PI * f / sr);
        }
        this.active = false;
        this.quiet = 0;
    }

    // brightness 0..1 weights the upper modes
    strike(amp, brightness) {
        for (let i = 0; i < this.n; i = i + 1) {
            const tilt = Math.pow(i / this.n + 0.02, 1.0 - brightness) ;
            this.y1[i] = this.y1[i] + amp * this.g[i] * (0.25 + 0.75 * (1.0 - tilt * (1.0 - brightness)));
        }
        this.active = true;
        this.quiet = 0;
    }

    damp(factor) {
        for (let i = 0; i < this.n; i = i + 1) {
            this.y1[i] = this.y1[i] * factor;
            this.y2[i] = this.y2[i] * factor;
        }
    }

    tick() {
        if (!this.active) {
            return 0.0;
        }
        let out = 0.0;
        const n = this.n;
        for (let i = 0; i < n; i = i + 1) {
            const y = this.c1[i] * this.y1[i] + this.c2[i] * this.y2[i];
            this.y2[i] = this.y1[i];
            this.y1[i] = y;
            out = out + y;
        }
        if (Math.abs(out) < 1e-6) {
            this.quiet = this.quiet + 1;
            if (this.quiet > 4800) {
                this.active = false;
            }
        } else {
            this.quiet = 0;
        }
        return out;
    }
}

// Shared envelope: linear attack, hold at level, exponential release.
class Swell {
    constructor() {
        this.level = 0.0;
        this.target = 0.0;
        this.rate = 0.0;
    }

    set(target, seconds, sr) {
        this.target = target;
        this.rate = 1.0 / Math.max(1.0, seconds * sr);
    }

    tick() {
        this.level = this.level + (this.target - this.level) * this.rate * 4.0;
        return this.level;
    }
}

// ---------------------------------------------------------------- dungchen

export class Dungchen {
    constructor(sr, seed) {
        this.sr = sr;
        this.phase = 0.0;
        this.parity = 0;
        this.freq = 65.4;
        this.freqTarget = 65.4;
        this.env = new Swell();
        this.growl = 0.3;
        this.noise = new Noise(seed);
        this.lp = new Biquad();
        this.bell = new Biquad();
        this.bell2 = new Biquad();
        this.hp = new Biquad();
        this.bell.peak(480.0, 1.6, 9.0, sr);
        this.bell2.peak(1150.0, 2.5, 5.0, sr);
        this.hp.highpass(35.0, 0.7, sr);
        this.counter = 0;
        this.wobble = 0.0;
        this.level = 0.0;
    }

    // Begin (or continue) a tone; swells over `attack` seconds.
    play(note, level, attack, growl) {
        this.freqTarget = midiToHz(note);
        if (this.env.level < 0.01) {
            this.freq = this.freqTarget * 0.94; // lips settle up into the note
        }
        this.env.set(level, attack, this.sr);
        this.growl = growl;
    }

    bend(note) {
        this.freqTarget = midiToHz(note);
    }

    stop(release) {
        this.env.set(0.0, release, this.sr);
    }

    render(outL, outR, offset, n, panL, panR) {
        const sr = this.sr;
        for (let i = 0; i < n; i = i + 1) {
            const e = this.env.tick();
            if (e < 1e-5 && this.env.target === 0.0) {
                continue;
            }
            if ((this.counter & 63) === 0) {
                this.lp.lowpass(160.0 + 2600.0 * Math.pow(e, 1.6), 0.9, sr);
                this.wobble = 0.004 * this.noise.next();
            }
            this.counter = this.counter + 1;
            this.freq = this.freq + (this.freqTarget - this.freq) * 0.0006;
            const f = this.freq * (1.0 + this.wobble);
            const dt = f / sr;
            this.phase = this.phase + dt;
            if (this.phase >= 1.0) {
                this.phase = this.phase - 1.0;
                this.parity = 1 - this.parity;
            }
            // narrow lip pulse: saw minus a shifted saw
            let p2 = this.phase + 0.72;
            if (p2 >= 1.0) {
                p2 = p2 - 1.0;
            }
            const saw1 = 2.0 * this.phase - 1.0 - polyBlep(this.phase, dt);
            const saw2 = 2.0 * p2 - 1.0 - polyBlep(p2, dt);
            let x = saw1 - saw2;
            if (this.parity === 1) {
                x = x * (1.0 - this.growl * (0.6 - 0.3 * e));
            }
            x = x + 0.08 * e * this.noise.next();
            let y = this.lp.process(x * e);
            y = this.bell.process(y);
            y = this.bell2.process(y);
            y = this.hp.process(y) * 0.35;
            outL[offset + i] = outL[offset + i] + y * panL;
            outR[offset + i] = outR[offset + i] + y * panR;
        }
        this.level = this.env.level;
    }
}

// ---------------------------------------------------------------- gyaling

export class Gyaling {
    constructor(sr, seed, detuneCents) {
        this.sr = sr;
        this.phase = 0.0;
        this.freq = 261.6;
        this.freqTarget = 261.6;
        this.env = new Swell();
        this.noise = new Noise(seed);
        this.f1 = new Biquad();
        this.f2 = new Biquad();
        this.f3 = new Biquad();
        this.hp = new Biquad();
        this.f1.peak(1250.0, 2.2, 10.0, sr);
        this.f2.peak(2700.0, 3.0, 8.0, sr);
        this.f3.lowpass(5200.0, 0.7, sr);
        this.hp.highpass(220.0, 0.7, sr);
        this.detune = Math.pow(2.0, detuneCents / 1200.0);
        this.vibPhase = (seed % 100) / 100.0;
        this.grace = 0;
        this.graceTarget = 0.0;
        this.level = 0.0;
    }

    note(midi, level, graceSemis, graceSeconds) {
        this.freqTarget = midiToHz(midi) * this.detune;
        if (graceSemis !== 0) {
            this.freq = this.freqTarget * Math.pow(2.0, graceSemis / 12.0);
            this.grace = Math.round(graceSeconds * this.sr);
        } else if (this.env.level < 0.01) {
            this.freq = this.freqTarget;
        }
        this.env.set(level, 0.04, this.sr);
    }

    stop(release) {
        this.env.set(0.0, release, this.sr);
    }

    render(outL, outR, offset, n, panL, panR) {
        const sr = this.sr;
        for (let i = 0; i < n; i = i + 1) {
            const e = this.env.tick();
            if (e < 1e-5 && this.env.target === 0.0) {
                continue;
            }
            if (this.grace > 0) {
                this.grace = this.grace - 1;
            } else {
                this.freq = this.freq + (this.freqTarget - this.freq) * 0.004;
            }
            this.vibPhase = this.vibPhase + 5.6 / sr;
            const f = this.freq * (1.0 + 0.006 * e * Math.sin(2.0 * Math.PI * this.vibPhase));
            const dt = f / sr;
            this.phase = this.phase + dt;
            if (this.phase >= 1.0) {
                this.phase = this.phase - 1.0;
            }
            let p2 = this.phase + 0.3;
            if (p2 >= 1.0) {
                p2 = p2 - 1.0;
            }
            const x = (2.0 * this.phase - 1.0 - polyBlep(this.phase, dt)) - (2.0 * p2 - 1.0 - polyBlep(p2, dt));
            let y = this.f1.process(x + 0.05 * this.noise.next());
            y = this.f2.process(y);
            y = this.f3.process(y);
            y = this.hp.process(y) * e * 0.09;
            outL[offset + i] = outL[offset + i] + y * panL;
            outR[offset + i] = outR[offset + i] + y * panR;
        }
        this.level = this.env.level;
    }
}

// ---------------------------------------------------------------- conch / kangling

export class Conch {
    constructor(sr, seed, formant, roughness) {
        this.sr = sr;
        this.phase = 0.0;
        this.freq = 300.0;
        this.freqTarget = 300.0;
        this.env = new Swell();
        this.noise = new Noise(seed);
        this.f1 = new Biquad();
        this.lp = new Biquad();
        this.f1.peak(formant, 1.5, 10.0, sr);
        this.lp.lowpass(formant * 2.6, 0.8, sr);
        this.rough = roughness;
        this.parity = 0;
        this.level = 0.0;
        this.hold = 0;
    }

    call(midi, level, seconds) {
        this.freqTarget = midiToHz(midi);
        this.freq = this.freqTarget * 0.8; // scoop up
        this.env.set(level, 0.12, this.sr);
        this.hold = Math.round(seconds * this.sr);
    }

    render(outL, outR, offset, n, panL, panR) {
        const sr = this.sr;
        for (let i = 0; i < n; i = i + 1) {
            if (this.hold > 0) {
                this.hold = this.hold - 1;
                if (this.hold === 0) {
                    this.env.set(0.0, 0.5, sr);
                    this.freqTarget = this.freqTarget * 0.94; // breath falls away
                }
            }
            const e = this.env.tick();
            if (e < 1e-5 && this.env.target === 0.0) {
                continue;
            }
            this.freq = this.freq + (this.freqTarget - this.freq) * 0.0012;
            const dt = this.freq / sr;
            this.phase = this.phase + dt;
            if (this.phase >= 1.0) {
                this.phase = this.phase - 1.0;
                this.parity = 1 - this.parity;
            }
            let x = 2.0 * this.phase - 1.0 - polyBlep(this.phase, dt);
            if (this.parity === 1) {
                x = x * (1.0 - this.rough);
            }
            let y = this.f1.process(x + 0.06 * this.noise.next());
            y = this.lp.process(y) * e * 0.12;
            outL[offset + i] = outL[offset + i] + y * panL;
            outR[offset + i] = outR[offset + i] + y * panR;
        }
        this.level = this.env.level;
    }
}

// ---------------------------------------------------------------- struck: rolmo, nga, drilbu

export class Rolmo {
    constructor(sr, seed) {
        this.sr = sr;
        const rnd = new Noise(seed);
        const freqs = [];
        const t60 = [];
        const gains = [];
        for (let k = 0; k < 56; k = k + 1) {
            const f = 330.0 * Math.pow(k + 1, 1.32) * (1.0 + 0.06 * rnd.next());
            freqs.push(f);
            t60.push(clamp(5.5 * Math.pow(f / 400.0, -0.55), 0.35, 6.0));
            gains.push((0.6 + 0.4 * rnd.next()) / Math.sqrt(k + 1.0));
        }
        this.left = new ModalBank(sr, freqs, t60, gains);
        const freqs2 = [];
        for (let k = 0; k < freqs.length; k = k + 1) {
            freqs2.push(freqs[k] * (1.0 + 0.004 * rnd.next()));
        }
        this.right = new ModalBank(sr, freqs2, t60, gains);
        this.noise = new Noise(seed + 7);
        this.hp = new Biquad();
        this.hp.highpass(2500.0, 0.7, sr);
        this.burst = 0.0;
        this.level = 0.0;
        this.pending = [];
    }

    strike(amp, brightness, delaySamples) {
        this.pending.push({ at: delaySamples, amp: amp, brightness: brightness });
    }

    choke() {
        this.left.damp(0.15);
        this.right.damp(0.15);
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            for (let k = this.pending.length - 1; k >= 0; k = k - 1) {
                const p = this.pending[k];
                if (p.at <= 0) {
                    this.left.strike(p.amp, p.brightness);
                    this.right.strike(p.amp, p.brightness);
                    this.burst = Math.max(this.burst, p.amp);
                    this.level = Math.max(this.level, p.amp);
                    this.pending.splice(k, 1);
                } else {
                    p.at = p.at - 1;
                }
            }
            if (!this.left.active && this.burst < 1e-4) {
                continue;
            }
            const nb = this.hp.process(this.noise.next()) * this.burst;
            this.burst = this.burst * 0.9985;
            const l = (this.left.tick() * 0.05 + nb * 0.35);
            const r = (this.right.tick() * 0.05 + nb * 0.3);
            outL[offset + i] = outL[offset + i] + l;
            outR[offset + i] = outR[offset + i] + r;
        }
        this.level = this.level * 0.92;
    }
}

export class Nga {
    constructor(sr, f0) {
        this.sr = sr;
        const ratios = [1.0, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16, 3.5, 3.6, 4.06];
        const freqs = [];
        const t60 = [];
        const gains = [];
        for (let k = 0; k < ratios.length; k = k + 1) {
            freqs.push(f0 * ratios[k]);
            t60.push(1.6 / Math.pow(ratios[k], 1.2));
            gains.push(1.0 / (1.0 + k * 0.5));
        }
        this.bank = new ModalBank(sr, freqs, t60, gains);
        this.f0 = f0;
        this.thumpPhase = 0.0;
        this.thumpT = 1e9;
        this.thumpAmp = 0.0;
        this.level = 0.0;
        this.pending = [];
    }

    strike(amp, delaySamples) {
        this.pending.push({ at: delaySamples, amp: amp });
    }

    render(outL, outR, offset, n) {
        const sr = this.sr;
        for (let i = 0; i < n; i = i + 1) {
            for (let k = this.pending.length - 1; k >= 0; k = k - 1) {
                const p = this.pending[k];
                if (p.at <= 0) {
                    this.bank.strike(p.amp, 0.25);
                    this.thumpT = 0.0;
                    this.thumpAmp = p.amp;
                    this.level = Math.max(this.level, p.amp);
                    this.pending.splice(k, 1);
                } else {
                    p.at = p.at - 1;
                }
            }
            let y = this.bank.tick() * 0.25;
            if (this.thumpT < 0.4) {
                const f = this.f0 * (1.0 + 0.6 * Math.exp(-this.thumpT / 0.05));
                this.thumpPhase = this.thumpPhase + f / sr;
                y = y + this.thumpAmp * 0.5 * Math.sin(2.0 * Math.PI * this.thumpPhase) * Math.exp(-this.thumpT / 0.18);
                this.thumpT = this.thumpT + 1.0 / sr;
            }
            outL[offset + i] = outL[offset + i] + y;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.93;
    }
}

export class Tungur {
    constructor(sr, f0, seed) {
        this.sr = sr;
        const ratios = [1.0, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16];
        const freqs = [];
        const t60 = [];
        const gains = [];
        for (let k = 0; k < ratios.length; k = k + 1) {
            freqs.push(f0 * ratios[k]);
            t60.push(0.45 / Math.pow(ratios[k], 1.1));
            gains.push(1.0 / (1.0 + k * 0.6));
        }
        this.bank = new ModalBank(sr, freqs, t60, gains);
        this.noise = new Noise(seed);
        this.slap = new Biquad();
        this.slap.bandpass(1800.0, 0.9, sr);
        this.slapT = 1e9;
        this.slapAmp = 0.0;
        this.level = 0.0;
        this.pending = [];
    }

    // bright 0..1: where the beater lands (rim: more slap, centre: more boom)
    strike(amp, bright, delaySamples) {
        this.pending.push({ at: delaySamples, amp: amp, bright: bright });
    }

    render(outL, outR, offset, n) {
        const sr = this.sr;
        for (let i = 0; i < n; i = i + 1) {
            for (let k = this.pending.length - 1; k >= 0; k = k - 1) {
                const p = this.pending[k];
                if (p.at <= 0) {
                    this.bank.strike(p.amp * (1.0 - 0.5 * p.bright), 0.2 + 0.6 * p.bright);
                    this.slapT = 0.0;
                    this.slapAmp = p.amp * (0.2 + 0.8 * p.bright);
                    this.level = Math.max(this.level, p.amp);
                    this.pending.splice(k, 1);
                } else {
                    p.at = p.at - 1;
                }
            }
            let y = this.bank.tick() * 0.3;
            if (this.slapT < 0.05) {
                y = y + this.slap.process(this.noise.next()) * this.slapAmp * 0.6 * Math.exp(-this.slapT / 0.008);
                this.slapT = this.slapT + 1.0 / sr;
            }
            outL[offset + i] = outL[offset + i] + y * 0.95;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.9;
    }
}

const LUTE_VOICES = 6;

export class Lute {
    constructor(sr, seed) {
        this.sr = sr;
        this.noise = new Noise(seed);
        this.lines = [];
        for (let v = 0; v < LUTE_VOICES; v = v + 1) {
            this.lines.push({ buf: new Float64Array(Math.ceil(sr / 30.0) + 4), len: 100, frac: 0.0, pos: 0, last: 0.0, loss: 0.996, bright: 0.5, active: false, pan: 0.5, age: 0 });
        }
        this.body1 = new Biquad();
        this.body1.bandpass(240.0, 2.0, sr);
        this.body2 = new Biquad();
        this.body2.bandpass(980.0, 1.6, sr);
        this.level = 0.0;
        this.pending = [];
        this.next = 0;
    }

    pluck(note, amp, delaySamples, pan) {
        this.pending.push({ at: delaySamples, note: note, amp: amp, pan: pan === undefined ? 0.5 : pan });
    }

    start(p) {
        const v = this.lines[this.next];
        this.next = (this.next + 1) % LUTE_VOICES;
        // loop delay = (len + 1) - frac samples, plus half a sample for
        // the averaging filter
        const loop = this.sr / midiToHz(p.note) - 0.5;
        v.len = Math.ceil(loop) - 1;
        v.frac = v.len + 1 - loop;
        v.pos = 0;
        v.last = 0.0;
        // a pluck: a short burst, brighter for a harder pluck
        let lp = 0.0;
        const k = 0.35 + 0.5 * Math.min(1.0, p.amp);
        for (let i = 0; i < v.len + 2; i = i + 1) {
            lp = lp + (this.noise.next() - lp) * k;
            v.buf[i] = lp * p.amp;
        }
        v.loss = 0.9975;
        v.active = true;
        v.pan = p.pan;
        v.age = 0;
        this.level = Math.max(this.level, p.amp);
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            for (let k = this.pending.length - 1; k >= 0; k = k - 1) {
                const p = this.pending[k];
                if (p.at <= 0) {
                    this.start(p);
                    this.pending.splice(k, 1);
                } else {
                    p.at = p.at - 1;
                }
            }
            let l = 0.0;
            let r = 0.0;
            for (let v = 0; v < LUTE_VOICES; v = v + 1) {
                const s = this.lines[v];
                if (!s.active) {
                    continue;
                }
                // read with linear interpolation for the fractional period,
                // average neighbours (high frequencies decay first)
                const a = s.buf[s.pos];
                const b = s.buf[(s.pos + 1) % (s.len + 1)];
                const x = a + (b - a) * s.frac;
                const y = s.loss * 0.5 * (x + s.last);
                s.last = x;
                s.buf[s.pos] = y;
                s.pos = s.pos + 1;
                if (s.pos > s.len) {
                    s.pos = 0;
                }
                s.age = s.age + 1;
                if (s.age > this.sr * 4) {
                    s.active = false;
                }
                l = l + y * (1.0 - s.pan);
                r = r + y * s.pan;
            }
            const mono = 0.5 * (l + r);
            const body = this.body1.process(mono) * 0.6 + this.body2.process(mono) * 0.35;
            outL[offset + i] = outL[offset + i] + (l * 0.5 + body) * 0.5;
            outR[offset + i] = outR[offset + i] + (r * 0.5 + body) * 0.5;
        }
        this.level = this.level * 0.95;
    }
}

export class Drilbu {
    constructor(sr, f0) {
        const ratios = [1.0, 2.32, 4.25, 6.63, 9.38];
        const freqs = [];
        const t60 = [];
        const gains = [];
        for (let k = 0; k < ratios.length; k = k + 1) {
            freqs.push(f0 * ratios[k]);
            freqs.push(f0 * ratios[k] * 1.004);
            t60.push(7.0 / Math.pow(ratios[k], 0.6));
            t60.push(7.0 / Math.pow(ratios[k], 0.6));
            gains.push(1.0 / (1.0 + k));
            gains.push(0.8 / (1.0 + k));
        }
        this.bank = new ModalBank(sr, freqs, t60, gains);
        this.level = 0.0;
        this.pending = [];
    }

    strike(amp, delaySamples) {
        this.pending.push({ at: delaySamples, amp: amp });
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            for (let k = this.pending.length - 1; k >= 0; k = k - 1) {
                const p = this.pending[k];
                if (p.at <= 0) {
                    this.bank.strike(p.amp, 0.7);
                    this.level = Math.max(this.level, p.amp);
                    this.pending.splice(k, 1);
                } else {
                    p.at = p.at - 1;
                }
            }
            const y = this.bank.tick() * 0.05;
            outL[offset + i] = outL[offset + i] + y * 0.8;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.95;
    }
}

// ---------------------------------------------------------------- drop kit

class OneShot {
    constructor() {
        this.t = 1e9;
        this.amp = 0.0;
        this.delay = -1;
        this.pendingAmp = 0.0;
        this.level = 0.0;
    }

    trigger(amp, delaySamples) {
        this.delay = delaySamples;
        this.pendingAmp = amp;
    }

    // returns true when the shot starts this sample
    step(sr) {
        if (this.delay >= 0) {
            if (this.delay === 0) {
                this.t = 0.0;
                this.amp = this.pendingAmp;
                this.level = this.amp;
                this.delay = -1;
                return true;
            }
            this.delay = this.delay - 1;
        }
        this.t = this.t + 1.0 / sr;
        return false;
    }
}

export class Kick extends OneShot {
    constructor(sr, seed) {
        super();
        this.sr = sr;
        this.phase = 0.0;
        this.noise = new Noise(seed);
        this.onHit = null;
        this.tailHz = 46.0;
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            if (this.step(this.sr) && this.onHit !== null) {
                this.onHit(offset + i);
            }
            if (this.t > 0.7) {
                continue;
            }
            // the pitch falls from about two octaves above into tailHz, so a
            // tuned kick lands on the song's sub note
            const f = this.tailHz + 130.0 * Math.exp(-this.t / 0.032);
            this.phase = this.phase + f / this.sr;
            let y = Math.sin(2.0 * Math.PI * this.phase) * Math.exp(-this.t / 0.32);
            y = y + 0.5 * this.noise.next() * Math.exp(-this.t / 0.0025);
            y = Math.tanh(1.8 * y) * this.amp * 0.55;
            outL[offset + i] = outL[offset + i] + y;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.9;
    }
}

export class Snare extends OneShot {
    constructor(sr, seed) {
        super();
        this.sr = sr;
        this.p1 = 0.0;
        this.p2 = 0.0;
        this.noise = new Noise(seed);
        this.bp = new Biquad();
        this.bp.bandpass(3200.0, 0.6, sr);
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            this.step(this.sr);
            if (this.t > 0.6) {
                continue;
            }
            this.p1 = this.p1 + 185.0 / this.sr;
            this.p2 = this.p2 + 330.0 / this.sr;
            const tone = (Math.sin(2.0 * Math.PI * this.p1) + 0.6 * Math.sin(2.0 * Math.PI * this.p2)) * Math.exp(-this.t / 0.07);
            const rattle = this.bp.process(this.noise.next()) * Math.exp(-this.t / 0.15) * 2.2;
            const y = Math.tanh(1.4 * (0.5 * tone + rattle)) * this.amp * 0.4;
            outL[offset + i] = outL[offset + i] + y;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.9;
    }
}

export class Hats extends OneShot {
    constructor(sr) {
        super();
        this.sr = sr;
        this.ratios = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
        this.phases = new Float64Array(6);
        this.bp = new Biquad();
        this.bp.bandpass(10000.0, 1.0, sr);
        this.hp = new Biquad();
        this.hp.highpass(7000.0, 0.7, sr);
        this.decay = 0.05;
    }

    hit(amp, open, delaySamples) {
        this.decay = open ? 0.28 : 0.045;
        this.trigger(amp, delaySamples);
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            this.step(this.sr);
            if (this.t > 1.0) {
                continue;
            }
            let x = 0.0;
            for (let k = 0; k < 6; k = k + 1) {
                this.phases[k] = this.phases[k] + this.ratios[k] * 1.6 / this.sr;
                if (this.phases[k] >= 1.0) {
                    this.phases[k] = this.phases[k] - 1.0;
                }
                x = x + (this.phases[k] < 0.5 ? 1.0 : -1.0);
            }
            const y = this.hp.process(this.bp.process(x)) * Math.exp(-this.t / this.decay) * this.amp * 0.12;
            outL[offset + i] = outL[offset + i] + y * 0.8;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.85;
    }
}

export class Sub {
    constructor(sr) {
        this.sr = sr;
        this.phase = 0.0;
        this.freq = 65.4;
        this.freqTarget = 65.4;
        this.env = new Swell();
        this.level = 0.0;
    }

    play(midi, level) {
        this.freqTarget = midiToHz(midi);
        if (this.env.level < 0.01) {
            this.freq = this.freqTarget;
        }
        this.env.set(level, 0.01, this.sr);
    }

    stop() {
        this.env.set(0.0, 0.05, this.sr);
    }

    render(outL, outR, offset, n, duck) {
        for (let i = 0; i < n; i = i + 1) {
            const e = this.env.tick();
            if (e < 1e-5 && this.env.target === 0.0) {
                continue;
            }
            this.freq = this.freq + (this.freqTarget - this.freq) * 0.003;
            this.phase = this.phase + this.freq / this.sr;
            if (this.phase >= 1.0) {
                this.phase = this.phase - 1.0;
            }
            const y = Math.sin(2.0 * Math.PI * this.phase) * e * 0.5 * duck[offset + i];
            outL[offset + i] = outL[offset + i] + y;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.env.level;
    }
}

// Noise riser (rising band-pass and level) and the impact boom.
export class Riser {
    constructor(sr, seed) {
        this.sr = sr;
        this.noise = new Noise(seed);
        this.bp = new Biquad();
        this.t = 1e9;
        this.dur = 1.0;
        this.amp = 0.0;
        this.boomT = 1e9;
        this.boomPhase = 0.0;
        this.counter = 0;
        this.level = 0.0;
    }

    rise(seconds, amp) {
        this.t = 0.0;
        this.dur = seconds;
        this.amp = amp;
    }

    impact(amp) {
        this.boomT = 0.0;
        this.boomAmp = amp;
        this.t = 1e9;
    }

    render(outL, outR, offset, n) {
        const sr = this.sr;
        for (let i = 0; i < n; i = i + 1) {
            let y = 0.0;
            if (this.t < this.dur) {
                const u = this.t / this.dur;
                if ((this.counter & 31) === 0) {
                    this.bp.bandpass(300.0 * Math.pow(30.0, u), 1.5, sr);
                }
                this.counter = this.counter + 1;
                y = this.bp.process(this.noise.next()) * u * u * this.amp * 0.6;
                this.t = this.t + 1.0 / sr;
                this.level = u;
            }
            if (this.boomT < 3.0) {
                const f = 38.0 + 60.0 * Math.exp(-this.boomT / 0.09);
                this.boomPhase = this.boomPhase + f / sr;
                y = y + Math.sin(2.0 * Math.PI * this.boomPhase) * Math.exp(-this.boomT / 0.9) * this.boomAmp * 0.6;
                y = y + this.noise.next() * Math.exp(-this.boomT / 0.4) * this.boomAmp * 0.08;
                this.boomT = this.boomT + 1.0 / sr;
            }
            outL[offset + i] = outL[offset + i] + y;
            outR[offset + i] = outR[offset + i] + y;
        }
    }
}

// The "dunk": a short tonal transient near 200 Hz that falls into the bass,
// placed at the head of a bass call so the hit reads before the body.
export class Dunk extends OneShot {
    constructor(sr) {
        super();
        this.sr = sr;
        this.phase = 0.0;
    }

    render(outL, outR, offset, n) {
        for (let i = 0; i < n; i = i + 1) {
            this.step(this.sr);
            if (this.t > 0.15) {
                continue;
            }
            const f = 70.0 + 150.0 * Math.exp(-this.t / 0.02);
            this.phase = this.phase + f / this.sr;
            const y = Math.tanh(2.0 * Math.sin(2.0 * Math.PI * this.phase)) * Math.exp(-this.t / 0.05) * this.amp * 0.35;
            outL[offset + i] = outL[offset + i] + y;
            outR[offset + i] = outR[offset + i] + y;
        }
        this.level = this.level * 0.85;
    }
}

export function softSaturate(x, drive) {
    return Math.tanh(drive * x) / Math.tanh(drive);
}
