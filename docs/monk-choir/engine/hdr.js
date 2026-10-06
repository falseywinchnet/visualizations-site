// HDR voice: the physical singer rendered across a wider range of levels
// and time scales, as layers that sum exactly.
//
// The 1-D tube is linear for a given shape, so the same shape is run three
// times: the "midtones" tube carries the voiced glottal flow, the "shadows"
// tube carries turbulence (at the glottis and at the narrowest point of the
// mouth), and the "highlights" tube carries the fold-collision transients;
// a small cross-mode bank adds the energy a 1-D tube cannot have. Their sum
// is the voice, and each can be heard alone without approximation.
//
// Experiments (each can be switched off):
//   interaction  the glottis prescribes only its opening; the flow is set
//                by the pressure across it (lung pressure minus the tube's
//                pressure just above the folds), with the inertia of the air
//                in the glottis lagging it. Skew, formant ripple in the flow
//                and open-phase damping emerge instead of being prescribed.
//   noise        turbulence is born at the narrowest constriction of the
//                mouth, scaled by how fast the jet is above a threshold,
//                coloured by a Strouhal relation (centre frequency rising
//                with jet speed over gap width), injected there as a dipole.
//   impact       when the folds close, a contact transient scaled by the
//                square of the closing speed.
//   crossmodes   above the cut-on of the first transverse mode of the
//                widest sections (1.84 c / (pi d)), resonators driven by the
//                tube's own pressure there.
//   living       one physiological state drives the fluctuations: breath
//                pressure (slow sag and recovery), a laryngeal tremor and a
//                heartbeat. Pitch rises with pressure, loudness follows it,
//                the folds press harder; the small cycle jitter that remains
//                is no longer the main source of life.

import { Singer, CONTROL_BLOCK } from "./singer.js?v=9b9f347a8e";
import { Tract, SECTION_LOSS } from "./tract.js?v=dcd3b7ef73";
import { SECTIONS, SPEED_OF_SOUND, S_VELUM } from "./anatomy.js?v=9500908dbe";

export const LAYERS = ["interaction", "noise", "impact", "crossmodes", "living", "subglottal", "walls", "inertia"];

// The airway below the glottis: trachea narrowing into the bronchial tree,
// as its own Kelly-Lochbaum tube with the same section length as the vocal
// tract (so both tick together). Its top is the glottis, its bottom the
// lungs (a wide, lossy, mostly absorbing end).
const MAX_SUB = 64;

export class SubglottalTube {
    constructor() {
        this.R = new Float64Array(MAX_SUB);
        this.L = new Float64Array(MAX_SUB);
        this.outR = new Float64Array(MAX_SUB);
        this.outL = new Float64Array(MAX_SUB + 1);
        this.rho = new Float64Array(MAX_SUB + 1);
        this.n = 0;
        this.topArea = 2.5;
        this.lungReflection = -0.6;
        this.loss = 0.9985;
        this.length = 0.0;
    }

    // length in cm, section length dx in cm, area scale of the body
    configure(length, dx, areaScale) {
        let n = Math.round(length / dx);
        if (n < 8) {
            n = 8;
        }
        if (n > MAX_SUB) {
            n = MAX_SUB;
        }
        if (n === this.n) {
            return;
        }
        this.n = n;
        this.length = n * dx;
        let prev = 0.0;
        for (let i = 0; i < n; i = i + 1) {
            const u = (i + 0.5) / n;
            // trachea (2.5 cm^2) for 55% of the length, then the bronchi
            // widen linearly to 15 cm^2. With a 20 cm effective airway this
            // resonates at 600 / 1410 / 2200 Hz, the reported adult-male
            // subglottal resonances (searched in .dev/test_hdr2.mjs notes).
            let a = 2.5;
            if (u > 0.55) {
                a = 2.5 + 12.5 * (u - 0.55) / 0.45;
            }
            a = a * areaScale;
            if (i === 0) {
                this.topArea = a;
            } else {
                this.rho[i] = (prev - a) / (prev + a);
            }
            prev = a;
        }
        this.R.fill(0.0);
        this.L.fill(0.0);
    }

    pressureTop() {
        return this.R[0] + this.L[0];
    }

    // inflow at the top (negative when air is drawn up into the glottis)
    tick(inflow, topReflection) {
        const n = this.n;
        const R = this.R;
        const L = this.L;
        const outR = this.outR;
        const outL = this.outL;
        outR[0] = topReflection * L[0] + inflow / this.topArea;
        outL[n] = this.lungReflection * R[n - 1];
        for (let i = 1; i < n; i = i + 1) {
            const w = this.rho[i] * (R[i - 1] - L[i]);
            outR[i] = R[i - 1] + w;
            outL[i] = L[i] + w;
        }
        for (let i = 0; i < n; i = i + 1) {
            R[i] = outR[i] * this.loss;
            L[i] = outL[i + 1] * this.loss;
        }
    }
}

// Articulators as critically damped masses, each with its own time
// constant: lips and tongue tip quick, tongue body and jaw slower, the
// larynx slowest. Targets come from the singer's articulation each block.
// Time constants: a critically damped move settles in about five of them,
// so lips/tip ~40 ms, tongue body ~90 ms, jaw ~100 ms, larynx ~200 ms.
const INERTIA = {
    lipAperture: 0.008, lipProtrusion: 0.02, tipClose: 0.007, tipPos: 0.015,
    tonguePos: 0.018, tongueHeight: 0.016, jaw: 0.02, velum: 0.015, larynx: 0.04, epilarynx: 0.03
};
const INERTIA_KEYS = Object.keys(INERTIA);

class Resonator {
    constructor() {
        this.c1 = 0.0;
        this.c2 = 0.0;
        this.y1 = 0.0;
        this.y2 = 0.0;
        this.g = 0.0;
    }

    tune(freq, q, rate) {
        const f = Math.min(freq, 0.45 * rate);
        const r = Math.exp(-Math.PI * (f / q) / rate);
        this.c1 = 2.0 * r * Math.cos(2.0 * Math.PI * f / rate);
        this.c2 = -r * r;
        this.g = 1.0 - r;
    }

    tick(x) {
        const y = this.c1 * this.y1 + this.c2 * this.y2 + this.g * x;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
    }
}

// Band-pass for the constriction noise (bilinear, retuned per block).
class Band {
    constructor() {
        this.b0 = 0.0; this.b2 = 0.0; this.a1 = 0.0; this.a2 = 0.0;
        this.x1 = 0.0; this.x2 = 0.0; this.y1 = 0.0; this.y2 = 0.0;
    }

    tune(f, q, rate) {
        const w = 2.0 * Math.PI * Math.min(f, 0.45 * rate) / rate;
        const alpha = Math.sin(w) / (2.0 * q);
        const a0 = 1.0 + alpha;
        this.b0 = alpha / a0;
        this.b2 = -alpha / a0;
        this.a1 = -2.0 * Math.cos(w) / a0;
        this.a2 = (1.0 - alpha) / a0;
    }

    tick(x) {
        const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
        return y;
    }
}

export class HdrVoice extends Singer {
    constructor(sampleRate, anatomy, registerKey, seed) {
        super(sampleRate, anatomy, registerKey, seed);
        this.shadowTract = new Tract();
        this.highTract = new Tract();
        this.layers = { interaction: true, noise: true, impact: true, crossmodes: true, living: true, subglottal: true, walls: true, inertia: true };
        this.sub = new SubglottalTube();
        this.subLength = 20.0 * Math.sqrt(anatomy.areaScale);
        this.subPressure = 0.0;
        // trapped-air pressure behind a seal, as a fraction of lung pressure
        this.trapped = 0.0;
        this.sealPrev = 0.0;
        this.burst = 0.0;
        this.burstBand = new Band();
        this.wallLow = 0.0;
        this.wallLevel = 0.0;
        // articulator dynamics: position and velocity per articulator
        this.dynPos = {};
        this.dynVel = {};
        this.dynReady = false;
        this.amount = { noise: 1.0, impact: 1.0, crossmodes: 1.0, living: 1.0 };
        this.exposure = { mid: 1.0, shadow: 1.0, high: 1.0 };
        // interaction state
        this.kappa = 0.0;
        this.flowU = 0.0;
        this.inertiaTau = 0.00025; // s
        this.prevOpening = 0.0;
        // constriction noise
        this.band = new Band();
        this.constrictIndex = -1;
        this.noiseGain = 0.0;
        this.noiseCentre = 0.0;
        this.flowAverage = 0.0;
        this.openingAverage = 0.3;
        this.flowThrough = 1.0;
        this.aspLow = 0.0;
        this.aspirationLevel = 0.2;
        this.noiseSeed = (seed * 2246822519) >>> 0 || 7;
        // impact
        this.clickPending = 0.0;
        this.clickLevel = 0.0;
        // cross-modes
        this.cross = [new Resonator(), new Resonator(), new Resonator()];
        this.crossIndex = [0, 0, 0];
        this.crossFreq = [0.0, 0.0, 0.0];
        // physiology
        this.ps = 1.0;
        this.psDrift = 0.0;
        this.tremorPhase = (seed % 101) / 101.0;
        this.tremorAmp = 0.0;
        this.heartPhase = (seed % 37) / 37.0;
        this.breathSag = 0.0;
        this.f0Living = 1.0;
        this.oqLiving = 0.0;
        // per-layer output level meters (smoothed RMS)
        this.meter = { mid: 0.0, shadow: 0.0, high: 0.0 };
        // separate output filters per exposure bus
        this.bus = [makeBusState(), makeBusState(), makeBusState()];
        this.p0Ratio = 0.0;
        this.calibrateInteraction();
    }

    randomUniform() {
        let x = this.noiseSeed;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.noiseSeed = x >>> 0;
        return this.noiseSeed / 4294967296.0;
    }

    gaussian() {
        return (this.randomUniform() + this.randomUniform() + this.randomUniform() + this.randomUniform() - 2.0) * 1.2247;
    }

    // kappa converts the tube's pressure wave at the glottis into the units of
    // lung pressure: chosen so that, with the folds wide open on "ah", the
    // supraglottal pressure peaks at a quarter of the lung pressure.
    calibrateInteraction() {
        const tract = new Tract();
        const rate = this.tickRate;
        this.updateArticulation(0.0);
        this.updateShape(0);
        tract.setShape(this.areas, this.nasalCount, this.nasal, 20, 0.0, 0.5, 0.5, 0);
        let peak = 1e-9;
        let phase = 0.0;
        const f0 = 130.0;
        for (let i = 0; i < Math.round(0.1 * rate); i = i + 1) {
            phase = phase + f0 / rate;
            if (phase >= 1.0) {
                phase = phase - 1.0;
            }
            const u = phase < 0.5 ? 0.5 - 0.5 * Math.cos(2.0 * Math.PI * phase / 0.5 * 0.5) : 0.0;
            tract.tick(u, 0.9);
            peak = Math.max(peak, Math.abs(tract.glottalPressure()));
        }
        this.kappa = 0.25 / peak;
    }

    // One control block of physiology: breath pressure, tremor, heartbeat.
    updatePhysiology(dt) {
        if (!this.layers.living) {
            this.ps = 1.0;
            this.f0Living = 1.0;
            this.oqLiving = 0.0;
            return;
        }
        const a = this.amount.living;
        // breath: while singing the lungs empty and the pressure sags a little
        // until the singer's control loop catches it; rests let it recover
        if (this.gate) {
            this.breathSag = this.breathSag + dt * 0.012;
        } else {
            this.breathSag = this.breathSag * Math.exp(-dt / 0.6);
        }
        const sag = 0.06 * Math.tanh(this.breathSag / 0.06);
        this.psDrift = this.psDrift - this.psDrift * dt / 0.7 + 0.018 * Math.sqrt(2.0 * dt / 0.7) * this.gaussian();
        this.heartPhase = this.heartPhase + 1.15 * dt;
        const heart = 0.006 * Math.sin(2.0 * Math.PI * this.heartPhase);
        this.ps = 1.0 + a * (this.psDrift + heart - sag);
        // laryngeal tremor: a 5-7 Hz oscillation whose depth wanders
        this.tremorAmp = this.tremorAmp - this.tremorAmp * dt / 1.5 + 0.002 * Math.sqrt(2.0 * dt / 1.5) * this.gaussian();
        this.tremorPhase = this.tremorPhase + (5.6 + 0.6 * this.psDrift * 20.0) * dt;
        const tremor = (0.0025 + Math.abs(this.tremorAmp)) * Math.sin(2.0 * Math.PI * this.tremorPhase);
        // pitch rises with lung pressure (about 3% per 10% here), the folds
        // press harder (lower open quotient) as pressure rises
        this.f0Living = 1.0 + a * (0.3 * (this.ps - 1.0) + tremor);
        this.oqLiving = -a * 0.6 * (this.ps - 1.0);
    }

    // Narrowest point of the mouth and the cross-mode frequencies, per block.
    updateGeometry() {
        const n = SECTIONS;
        const start = Math.round(n * 0.45);
        let minArea = 1e9;
        let minIndex = -1;
        for (let i = start; i < n; i = i + 1) {
            if (this.areas[i] < minArea) {
                minArea = this.areas[i];
                minIndex = i;
            }
        }
        this.constrictIndex = Math.min(n - 1, minIndex + 1);
        // Jet through the constriction. Glottis and constriction are two
        // orifices in series sharing one flow, so the smaller limits it:
        //   U = U0 * Ac / sqrt(Ag^2 + Ac^2),  v = U / Ac = U0 / sqrt(Ag^2 + Ac^2)
        // The jet speed therefore saturates at the Bernoulli speed (U0/Ag)
        // as the gap closes, while the flow itself falls to zero.
        const ac = Math.max(minArea, 1e-5);
        const ag = 0.12 * this.openingAverage + 0.002; // mean glottal area, cm^2
        const vRel = ag / Math.sqrt(ag * ag + ac * ac); // 0..1 of the Bernoulli speed
        this.flowThrough = ac / Math.sqrt(ag * ag + ac * ac);
        const width = 2.0 * Math.sqrt(ac / Math.PI);
        const excess = Math.max(0.0, vRel - 0.25);
        this.noiseGain = this.layers.noise ? this.amount.noise * excess * excess * 6.0 : 0.0;
        // Strouhal: f = St v / d with St ~ 0.2 and a Bernoulli speed of
        // ~36 m/s (lung pressure ~0.8 kPa)
        this.noiseCentre = Math.min(8000.0, Math.max(1200.0, 0.2 * 3600.0 * vRel / Math.max(width, 0.05)));
        this.band.tune(this.noiseCentre, 1.1, this.tickRate);
        // cross-modes of the widest oral section: a circular duct of
        // diameter d supports transverse modes at j'/(pi d) * c with
        // j' = 1.841, 3.054, 3.832 (the first three Bessel-derivative zeros)
        let widest = start;
        for (let i = start; i < n; i = i + 1) {
            if (this.areas[i] > this.areas[widest]) {
                widest = i;
            }
        }
        const d = 2.0 * Math.sqrt(this.areas[widest] / Math.PI);
        const zeros = [1.841, 3.054, 3.832];
        for (let k = 0; k < 3; k = k + 1) {
            const f = zeros[k] * SPEED_OF_SOUND / (Math.PI * Math.max(d, 0.5));
            this.crossIndex[k] = widest;
            this.crossFreq[k] = f;
            this.cross[k].tune(f, 14.0, this.tickRate);
        }
    }

    // Each articulator chases its target as a critically damped mass.
    applyInertia(dt) {
        if (!this.layers.inertia) {
            this.dynReady = false;
            return;
        }
        this.vowelGlide = Math.min(this.vowelGlide, 0.015);
        const art = this.art;
        if (!this.dynReady) {
            for (let i = 0; i < INERTIA_KEYS.length; i = i + 1) {
                const k = INERTIA_KEYS[i];
                this.dynPos[k] = art[k];
                this.dynVel[k] = 0.0;
            }
            this.dynReady = true;
            return;
        }
        // two half steps keep the stiff (fast) articulators stable
        const h = dt * 0.5;
        for (let i = 0; i < INERTIA_KEYS.length; i = i + 1) {
            const k = INERTIA_KEYS[i];
            const w = 1.0 / INERTIA[k];
            for (let step = 0; step < 2; step = step + 1) {
                const acc = w * w * (art[k] - this.dynPos[k]) - 2.0 * w * this.dynVel[k];
                this.dynVel[k] = this.dynVel[k] + acc * h;
                this.dynPos[k] = this.dynPos[k] + this.dynVel[k] * h;
            }
            art[k] = this.dynPos[k];
        }
        art.lipAperture = Math.max(0.0, art.lipAperture);
        art.tipClose = Math.min(1.0, Math.max(0.0, art.tipClose));
        art.velum = Math.min(1.0, Math.max(0.0, art.velum));
    }

    render(outL, outR, offset, n) {
        const dt = n / this.sampleRate;
        this.updateEnvelope(dt);
        this.updatePhysiology(dt);
        this.updatePitch(dt);
        this.f0 = this.f0 * this.f0Living;
        this.updateSource(dt);
        this.source.oq = Math.min(0.95, Math.max(0.2, this.source.oq + this.oqLiving * 0.1));
        this.updateArticulation(dt);
        this.applyInertia(dt);
        this.tuneCounter = this.tuneCounter + 1;
        if (this.tuneCounter >= 4) {
            this.tuneFormants(dt * 4.0);
            this.tuneCounter = 0;
        }
        const ratio = this.tickRate / this.sampleRate;
        const ticksThisBlock = Math.max(1, Math.round(n * ratio));
        this.updateShape(ticksThisBlock);
        this.shadowTract.setShape(this.areas, this.nasalCount, this.nasal, this.tract.velumJ, this.tract.velumTarget, this.tract.lipPole, this.tract.nosePole, ticksThisBlock);
        this.highTract.setShape(this.areas, this.nasalCount, this.nasal, this.tract.velumJ, this.tract.velumTarget, this.tract.lipPole, this.tract.nosePole, ticksThisBlock);
        this.updateGeometry();
        // Only a near-complete seal stops the flow; a fricative's narrow gap
        // keeps air (and voicing) moving, which is what makes its noise.
        // A seal: lips or tongue tip closed with the velum closed. Measured
        // from the articulated tube itself (inertia included), not the
        // consonant command.
        const lipAreaNow = this.areas[SECTIONS - 1];
        let minOral = 1e9;
        let sealIndex = SECTIONS - 1;
        for (let i = Math.round(SECTIONS * 0.6); i < SECTIONS; i = i + 1) {
            if (this.areas[i] < minOral) {
                minOral = this.areas[i];
                sealIndex = i;
            }
        }
        const seal = Math.max(0.0, Math.min(1.0, (0.06 - minOral) / 0.05)) * (1.0 - this.art.velum);
        let occlusion = seal;
        if (this.layers.walls) {
            occlusion = 0.0; // the trapped pressure does the stopping
        }
        const amp = this.envelope * (0.35 + 0.65 * this.velocityOrOne()) * (0.4 + 0.9 * this.effort) * (1.0 - 0.9 * occlusion);
        // subglottal tube follows the vocal tract's section length
        this.sub.configure(this.subLength, this.length / SECTIONS, this.anatomy.areaScale);
        const subOn = this.layers.subglottal;
        const wallsOn = this.layers.walls;
        // release of a seal: the trapped pressure bursts out where it opened
        if (wallsOn && this.sealPrev > 0.5 && seal < 0.3 && this.trapped > 0.05) {
            this.burst = this.trapped;
            this.burstIndex = Math.min(SECTIONS - 1, sealIndex + 1);
            this.burstBand.tune(sealIndex >= SECTIONS - 2 ? 1400.0 : 3800.0, 0.9, this.tickRate);
        }
        this.sealPrev = seal;
        const sealDecay = Math.exp(-1.0 / (0.004 * this.tickRate));
        const burstDecay = Math.exp(-1.0 / (0.012 * this.tickRate));
        const wallCoef = 1.0 - Math.exp(-2.0 * Math.PI * 350.0 / this.tickRate);
        const mouthIndex = Math.round(SECTIONS * 0.75);
        // walls radiate a small fraction of the cavity pressure (the
        // voice bar, some 25 dB under the vowel); scaled by the open-mouth
        // radiation so it holds across bodies
        const wallGain = 0.075 * Math.max(this.areas[Math.round(SECTIONS * 0.7)], 0.5);
        // Behind a seal, the yielding walls are the main loss of the
        // trapped sound: applied whenever the tube is sealed.
        const loss = SECTION_LOSS * (1.0 - 0.006 * Math.max(occlusion, seal));
        this.tract.loss = loss;
        this.shadowTract.loss = loss;
        this.highTract.loss = loss;
        const glottis = this.glottis;
        const mid = this.tract;
        const shadow = this.shadowTract;
        const high = this.highTract;
        const src = this.source;
        const f0 = this.f0;
        const rate = this.tickRate;
        const effort = this.effort;
        const gain = this.calibration * this.level;
        const panL = Math.cos(0.25 * Math.PI * (this.pan + 1.0));
        const panR = Math.sin(0.25 * Math.PI * (this.pan + 1.0));
        const interaction = this.layers.interaction;
        const impact = this.layers.impact ? this.amount.impact : 0.0;
        const crossOn = this.layers.crossmodes ? this.amount.crossmodes : 0.0;
        const lungs = amp * amp * this.ps;
        const inertia = 1.0 - Math.exp(-1.0 / (this.inertiaTau * rate));
        const flowSmooth = 1.0 - Math.exp(-1.0 / (0.01 * rate));
        const ci = this.constrictIndex;
        const aspCoef = 1.0 - Math.exp(-2.0 * Math.PI * 2500.0 / rate);
        const exposure = this.exposure;
        let energy = 0.0;
        let em = 0.0;
        let es = 0.0;
        let eh = 0.0;
        for (let i = 0; i < n; i = i + 1) {
            this.tickAcc = this.tickAcc + ratio;
            while (this.tickAcc >= 1.0) {
                this.tickAcc = this.tickAcc - 1.0;
                glottis.tick(f0, rate, src, effort, 1.0);
                const opening = glottis.opening;
                // voiced flow
                let u = 0.0;
                if (interaction) {
                    // Bernoulli: the tube's pressure above the folds is in
                    // proportion to the flow, the lungs' to its square, so the
                    // coupling is relatively stronger in soft voice (1/sqrt).
                    const p0 = this.kappa * (mid.glottalPressure() + shadow.glottalPressure() + high.glottalPressure());
                    let pSub = 0.0;
                    if (subOn) {
                        pSub = this.kappa * this.sub.pressureTop();
                    }
                    const drive = Math.max(0.05 * lungs, lungs * (1.0 - this.trapped) + pSub - p0);
                    const target = opening * Math.sqrt(drive);
                    this.flowU = this.flowU + (target - this.flowU) * inertia;
                    u = this.flowU;
                    this.p0Ratio = this.p0Ratio + (Math.abs(p0) / Math.max(lungs, 1e-6) - this.p0Ratio) * 0.001;
                } else {
                    u = opening * amp * Math.sqrt(this.ps * Math.max(0.0, 1.0 - this.trapped));
                }
                if (subOn) {
                    this.sub.tick(-u, glottis.reflection);
                }
                // trapped air: flow into a sealed mouth raises its pressure
                // (the yielding walls make room, slowly); an open mouth vents
                if (wallsOn) {
                    if (seal > 0.0) {
                        this.trapped = Math.min(1.0, this.trapped + (Math.abs(u) / Math.max(amp, 0.05)) * seal * 12.0 / rate - this.trapped * 4.0 / rate);
                    } else {
                        this.trapped = this.trapped * sealDecay;
                    }
                }
                this.flowAverage = this.flowAverage + (Math.abs(u) / Math.max(amp, 0.05) - this.flowAverage) * flowSmooth;
                this.openingAverage = this.openingAverage + (opening - this.openingAverage) * flowSmooth;
                // shadows: glottal turbulence (flow-modulated) and the
                // constriction jet
                // turbulence at the glottis: shaped to fall above ~2.5 kHz
                // (radiation lifts it back), scaled by the flow through it
                const white = this.randomUniform() * 2.0 - 1.0;
                this.aspLow = this.aspLow + (white - this.aspLow) * aspCoef;
                const aspiration = src.breath * this.aspirationLevel * this.aspLow * (0.2 + Math.abs(u) / Math.max(amp, 0.05)) * amp;
                if (this.noiseGain > 0.0 && ci > 0) {
                    shadow.injIndex = ci;
                    shadow.injValue = this.band.tick(this.randomUniform() * 2.0 - 1.0) * this.noiseGain * amp * Math.abs(u) * this.flowThrough * 4.0;
                } else {
                    shadow.injIndex = -1;
                    shadow.injValue = 0.0;
                }
                // highlights: the collision when the folds close
                let click = 0.0;
                if (impact > 0.0) {
                    if (this.prevOpening > 0.02 && opening <= 0.02 + src.leak) {
                        const speed = (this.prevOpening - opening) * rate / Math.max(f0, 40.0);
                        this.clickPending = impact * amp * speed * speed * 0.02;
                    }
                    if (this.clickPending !== 0.0) {
                        click = this.clickPending;
                        this.clickPending = this.clickPending > 0.0 ? -this.clickPending * 0.6 : 0.0;
                    }
                }
                this.prevOpening = opening;
                if (this.burst > 1e-4) {
                    if (shadow.injIndex !== this.burstIndex) {
                        shadow.injValue = 0.0;
                    }
                    shadow.injIndex = this.burstIndex;
                    shadow.injValue = shadow.injValue + this.burstBand.tick(this.randomUniform() * 2.0 - 1.0) * this.burst * amp * 0.4;
                    this.burst = this.burst * burstDecay;
                }
                const r = glottis.reflection;
                let ym = mid.tick(u, r);
                if (wallsOn && seal > 0.0) {
                    // the voice bar: cheeks and neck vibrate with the cavity
                    // pressure and radiate its low frequencies
                    this.wallLow = this.wallLow + (mid.pressureAt(mouthIndex) - this.wallLow) * wallCoef;
                    ym = ym + this.wallLow * seal * wallGain;
                }
                const ys = shadow.tick(aspiration, r);
                let yh = high.tick(click, r);
                if (crossOn > 0.0) {
                    let c = 0.0;
                    for (let k = 0; k < 3; k = k + 1) {
                        const idx = this.crossIndex[k];
                        c = c + this.cross[k].tick(mid.pressureAt(idx) + shadow.pressureAt(idx));
                    }
                    yh = yh + c * crossOn * 0.35 * mid.lipArea;
                }
                busTick(this.bus[0], ym, this);
                busTick(this.bus[1], ys, this);
                busTick(this.bus[2], yh, this);
            }
            const m0 = busSample(this.bus[0], this.tickAcc) * gain;
            const s0 = busSample(this.bus[1], this.tickAcc) * gain;
            const h0 = busSample(this.bus[2], this.tickAcc) * gain;
            em = em + m0 * m0;
            es = es + s0 * s0;
            eh = eh + h0 * h0;
            const s = m0 * exposure.mid + s0 * exposure.shadow + h0 * exposure.high;
            energy = energy + s * s;
            outL[offset + i] = outL[offset + i] + s * panL;
            outR[offset + i] = outR[offset + i] + s * panR;
        }
        const k = 0.15;
        this.meter.mid = this.meter.mid + (em / n - this.meter.mid) * k;
        this.meter.shadow = this.meter.shadow + (es / n - this.meter.shadow) * k;
        this.meter.high = this.meter.high + (eh / n - this.meter.high) * k;
        if (energy < 1e-12 && !this.gate) {
            this.silentBlocks = this.silentBlocks + 1;
        } else {
            this.silentBlocks = 0;
        }
    }
}

// Per-bus radiation (flow derivative), anti-alias low-pass and resampling.
function makeBusState() {
    return { prevFlow: 0.0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0, prev: 0.0, cur: 0.0 };
}

function busTick(b, flow, voice) {
    const lp = voice.lp;
    const radiated = flow - b.prevFlow;
    b.prevFlow = flow;
    const y = lp.b0 * radiated + lp.b1 * b.x1 + lp.b2 * b.x2 - lp.a1 * b.y1 - lp.a2 * b.y2;
    b.x2 = b.x1;
    b.x1 = radiated;
    b.y2 = b.y1;
    b.y1 = y;
    b.prev = b.cur;
    b.cur = y;
}

function busSample(b, frac) {
    return b.prev + (b.cur - b.prev) * frac;
}

export { CONTROL_BLOCK, S_VELUM };
