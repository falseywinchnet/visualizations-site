// A self-oscillating larynx: vocal folds as two coupled masses, the false
// (ventricular) folds as a third mass above them, and the air through both.
//
// Nothing here prescribes a pulse. The lungs push air through two openings
// in series, the glottis and the gap between the false folds. The pressure
// along the way pushes on the folds, the folds move, the openings change,
// the flow changes. Pitch is how fast this loop turns; the singer sets it by
// the folds' tension, listening to what comes out (a slow feedback on the
// measured period, a fast feed-forward from the wanted pitch).
//
// Vocal folds (two-mass, symmetric, after the widely used simplified
// two-mass description): lower mass m1 and upper mass m2 on springs k1, k2,
// coupled by kc, damped, with stiffer contact springs when an edge closes.
// Each opening is a = a0 + 2 L x. Air flows while the narrower edge is
// open; the lower edge feels the lung pressure minus the Bernoulli drop to
// its opening, the upper edge the pressure just above the glottis.
//
// False folds (one mass): their own spring, damping and contact. Their gap
// av = av0 + 2 Lv xv is the second opening. The space between the two pairs
// of folds (the ventricle) holds the pressure Pv: the lungs' pressure minus
// the glottal jet's loss, equal to the tract's pressure plus the false
// folds' own jet loss. Pv pushes the false folds apart; it depends on their
// gap and on the flow, which depends on the gap again. A force that depends
// on the position it moves, pulsing at the glottal rate, can drive an
// oscillation at half that rate. That is the hypothesis this model tests
// (.dev/test_larynx.mjs): with the false folds' own frequency set near half
// the voice's, do they lock to every second glottal cycle, as high-speed
// films of kargyraa and of the Sardinian bassu show?
//
// Units SI inside (kg, m, s, Pa). The flow handed to the tract is in units
// of FLOW_UNIT; the tract's pressure comes back through kappa.

const RHO = 1.14;             // air, kg/m^3
const FLOW_UNIT = 3.0e-4;     // m^3/s (300 cm^3/s) per tract flow unit

// Two-mass reference values (adult male, f0 near 120 Hz at Q = 1).
const M1 = 1.25e-4;
const M2 = 2.5e-5;
const K1 = 80.0;
const K2 = 8.0;
const KC = 25.0;
const ZETA1 = 0.1;
const ZETA2 = 0.6;
const LEN = 0.014;            // fold length, m
const D1 = 2.5e-3;            // lower mass thickness, m
const D2 = 5.0e-4;            // upper mass thickness, m

// False folds: bulkier and slacker than the vocal folds.
const MV = 1.5e-4;
const ZETAV = 0.25;
const LENV = 0.016;
const DV = 3.0e-3;

export class Larynx {
    constructor(seed) {
        this.x1 = 0.0;
        this.v1 = 0.0;
        this.x2 = 0.0;
        this.v2 = 0.0;
        this.xv = 0.0;
        this.vv = 0.0;
        this.flow = 0.0;          // m^3/s
        this.pv = 0.0;            // ventricle pressure, Pa
        this.q = 1.0;             // vocal-fold tension factor
        this.correction = 0.0;    // learned log-ratio between wanted and produced pitch
        this.ventTune = -0.3;     // log offset of the false folds' tension from f0 / ratio
        this.ventMean = 0.0;      // the false folds' swing, as the singer feels it
        this.ventArmed = false;
        this.ventCross = -1.0;
        this.ventPeriodAvg = 0.0;
        this.ventSwing = 0.0;     // smoothed size of that swing, m
        this.ventSteer = false;   // steer the false folds' tension by ear (experimental)
        // controls (set by the singer per block)
        this.lungs = 800.0;       // subglottal pressure, Pa
        this.a0 = 0.05e-4;        // vocal-fold rest opening, m^2 (negative: pressed)
        this.av0 = 0.6e-4;        // false-fold rest opening, m^2 (wide: not involved)
        this.ventRatio = 2;       // the singer sets the false folds near f0 / ventRatio
        this.ventOn = 0.0;        // 0..1: how far the false folds are drawn in
        this.zetaV = ZETAV;       // false folds' damping ratio
        // measurements
        this.lastClose = -1.0;    // time of the last glottal closure, s
        this.lastCross = -1.0;    // time of the last upward swing of the folds
        this.swingMean = 0.0;     // running mean of the folds' position
        this.swingArmed = false;
        this.periodAvg = 0.0;
        this.time = 0.0;
        this.closedPrev = false;
        this.ventClosedPrev = false;
        this.ventContacts = 0;
        this.glottalCycles = 0;
        this.closingSpeed = 0.0;  // area speed at the last closure, m^2/s
        this.prevArea = 0.0;
        this.opening = 0.0;       // glottal area / reference area, for the tract's glottal reflection
        this.noiseState = (seed >>> 0) || 1;
        this.noiseLow = 0.0;
    }

    random() {
        let x = this.noiseState;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.noiseState = x >>> 0;
        return this.noiseState / 4294967296.0;
    }

    // The tension (Q) the singer uses for a wanted pitch: feed-forward from
    // the reference model plus what it has learned about this body and
    // setting.
    tensionFor(f0) {
        return (f0 / 145.0) * Math.exp(this.correction);
    }

    // One tick of dt seconds. pIn is the tract's pressure just above the
    // glottis (Pa). Returns the flow in tract units.
    tick(f0, dt, pIn, breath) {
        this.time = this.time + dt;
        const q = this.tensionFor(f0);
        this.q = q;
        const m1 = M1 / q;
        const m2 = M2 / q;
        const k1 = K1 * q;
        const k2 = K2 * q;
        const kc = KC * q;
        const r1 = 2.0 * ZETA1 * Math.sqrt(m1 * k1);
        const r2 = 2.0 * ZETA2 * Math.sqrt(m2 * k2);
        // false folds tuned near f0 / ratio
        const wv = 2.0 * Math.PI * (f0 / this.ventRatio) * Math.exp(this.ventTune);
        const kv = MV * wv * wv;
        const rv = 2.0 * this.zetaV * Math.sqrt(MV * kv);
        const a1 = this.a0 + 2.0 * LEN * this.x1;
        const a2 = this.a0 + 2.0 * LEN * this.x2;
        const av0 = this.av0 + (1.0 - this.ventOn) * 0.6e-4;
        const av = av0 + 2.0 * LENV * this.xv;
        const ag = Math.min(a1, a2);
        // flow through the two openings in series (quasi-steady jets)
        const drive = Math.max(0.0, this.lungs - pIn);
        let uq = 0.0;
        if (ag > 0.0 && av > 0.0) {
            const inv = 1.0 / (ag * ag) + 1.0 / (av * av);
            uq = Math.sqrt(2.0 * drive / (RHO * inv));
        }
        // the air in the openings has inertia: the flow follows with a
        // short lag (0.25 ms, the value the HDR voice uses)
        const lag = 1.0 - Math.exp(-dt / 0.00025);
        this.flow = this.flow + (uq - this.flow) * lag;
        const u = this.flow;
        // ventricle pressure
        let pv = pIn;
        if (av > 0.0) {
            pv = pIn + 0.5 * RHO * (u / av) * (u / av);
        } else if (ag > 0.0) {
            pv = this.lungs;  // false folds shut, glottis open: the ventricle fills
        } else {
            pv = this.pv;     // both shut: the trapped air holds its pressure
        }
        if (pv > this.lungs) {
            pv = this.lungs;
        }
        this.pv = pv;
        // pressures on the vocal folds
        let p1 = this.lungs;
        if (ag > 0.0 && a1 > 0.0) {
            p1 = this.lungs - 0.5 * RHO * (u / a1) * (u / a1);
            if (p1 < pv) {
                p1 = pv;
            }
        }
        const p2 = pv;
        const f1 = LEN * D1 * p1;
        const f2 = LEN * D2 * p2;
        // contact: stiffer springs while an edge is closed
        let c1 = 0.0;
        if (a1 < 0.0) {
            c1 = 3.0 * k1 * (a1 / (2.0 * LEN));
        }
        let c2 = 0.0;
        if (a2 < 0.0) {
            c2 = 3.0 * k2 * (a2 / (2.0 * LEN));
        }
        const acc1 = (f1 - r1 * this.v1 - k1 * this.x1 - c1 - kc * (this.x1 - this.x2)) / m1;
        const acc2 = (f2 - r2 * this.v2 - k2 * this.x2 - c2 - kc * (this.x2 - this.x1)) / m2;
        // false folds: the ventricle pressure pushes them apart over their
        // lower face; their jet's pressure (the tract's) acts at the gap
        const fv = LENV * DV * 0.5 * (pv + pIn);
        let cv = 0.0;
        if (av < 0.0) {
            cv = 3.0 * kv * (av / (2.0 * LENV));
        }
        const accv = (fv - rv * this.vv - kv * this.xv - cv) / MV;
        // semi-implicit Euler
        this.v1 = this.v1 + acc1 * dt;
        this.v2 = this.v2 + acc2 * dt;
        this.vv = this.vv + accv * dt;
        this.x1 = this.x1 + this.v1 * dt;
        this.x2 = this.x2 + this.v2 * dt;
        this.xv = this.xv + this.vv * dt;
        // Pitch as the singer feels it: the swing of the vocal folds
        // themselves (upward crossings of their position through its running
        // mean, with hysteresis), not their closures, which the false folds
        // can suppress on alternate cycles.
        const swing = this.x1 + this.x2;
        this.swingMean = this.swingMean + (swing - this.swingMean) * (1.0 - Math.exp(-dt * 2.0 * Math.PI * 15.0));
        const dev = swing - this.swingMean;
        const hyst = 2.0e-5;
        if (dev < -hyst) {
            this.swingArmed = true;
        }
        if (this.swingArmed && dev > hyst) {
            this.swingArmed = false;
            if (this.lastCross >= 0.0) {
                const period = this.time - this.lastCross;
                if (this.periodAvg <= 0.0) {
                    this.periodAvg = period;
                } else {
                    this.periodAvg = this.periodAvg + (period - this.periodAvg) * 0.3;
                }
            }
            this.lastCross = this.time;
            this.glottalCycles = this.glottalCycles + 1;
        }
        const closed = ag <= 0.0;
        if (closed && !this.closedPrev) {
            this.lastClose = this.time;
            this.closingSpeed = (this.prevArea - ag) / dt;
        }
        this.closedPrev = closed;
        this.prevArea = ag;
        // the false folds' own swing (same detector, smaller threshold)
        this.ventMean = this.ventMean + (this.xv - this.ventMean) * (1.0 - Math.exp(-dt * 2.0 * Math.PI * 8.0));
        const vdev = this.xv - this.ventMean;
        this.ventSwing = this.ventSwing + (Math.abs(vdev) - this.ventSwing) * (1.0 - Math.exp(-dt / 0.03));
        if (vdev < -0.5e-5) {
            this.ventArmed = true;
        }
        if (this.ventArmed && vdev > 0.5e-5) {
            this.ventArmed = false;
            if (this.ventCross >= 0.0) {
                const vp = this.time - this.ventCross;
                if (this.ventPeriodAvg <= 0.0) {
                    this.ventPeriodAvg = vp;
                } else {
                    this.ventPeriodAvg = this.ventPeriodAvg + (vp - this.ventPeriodAvg) * 0.3;
                }
            }
            this.ventCross = this.time;
        }
        const vClosed = av <= 0.0;
        if (vClosed && !this.ventClosedPrev) {
            this.ventContacts = this.ventContacts + 1;
        }
        this.ventClosedPrev = vClosed;
        this.opening = Math.max(0.0, ag) / 0.15e-4;
        // turbulence: grows with the flow, shaped as in the pulse glottis
        const white = this.random() * 2.0 - 1.0;
        this.noiseLow = this.noiseLow + (white - this.noiseLow) * 0.15;
        const noise = this.noiseLow * breath * 0.2 * (0.2 + this.opening);
        return u / FLOW_UNIT + noise * (u / FLOW_UNIT);
    }

    // Once per control block: the singer compares the pitch it hears with
    // the pitch it wants and corrects the tension it uses.
    listen(f0, dtBlock) {
        if (this.periodAvg <= 0.0 || this.time - this.lastCross > 0.05) {
            return;
        }
        const heard = 1.0 / this.periodAvg;
        const err = Math.log(f0 / heard);
        this.correction = this.correction + err * Math.min(1.0, dtBlock * 12.0);
        if (this.correction > 1.0) {
            this.correction = 1.0;
        }
        if (this.correction < -1.0) {
            this.correction = -1.0;
        }
        // The false folds: once drawn in and swinging, the singer steers
        // their tension until their swing falls at f0 / ratio (the sub-octave
        // it wants to hear). Their own frequency then sits below f0 / ratio,
        // because the air through their gap stiffens them.
        if (this.ventSteer && this.ventOn > 0.5 && this.ventPeriodAvg > 0.0 && this.time - this.ventCross < 0.05 && this.ventSwing > 2.0e-6) {
            const want = f0 / this.ventRatio;
            const got = 1.0 / this.ventPeriodAvg;
            this.ventTune = this.ventTune + Math.log(want / got) * Math.min(1.0, dtBlock * 4.0);
            if (this.ventTune > 0.5) {
                this.ventTune = 0.5;
            }
            if (this.ventTune < -1.0) {
                this.ventTune = -1.0;
            }
        }
    }
}

export { FLOW_UNIT };
