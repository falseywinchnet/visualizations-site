// A room with a floor: early reflections per seat from an image-source
// model of a box with real surface materials, a floor reflection that
// depends on the floor's impedance and the angle the sound meets it, a
// resonating wooden dais, and a late tail tuned to the room's predicted
// decay. Heard from a near-coincident pair (two cardioids 17 cm apart,
// angled +-55 degrees toward the stage).
//
// Floor, three ways:
//   1. The first floor reflection is filtered by the floor's plane-wave
//      reflection coefficient at the actual incidence angle,
//          R(f, theta) = (Z(f) cos(theta) - 1) / (Z(f) cos(theta) + 1),
//      with the normalized impedance Z from the Delany-Bazley relations for
//      porous floors (carpet, earth) and the absorption coefficient for
//      hard ones. Seated singers are close to the floor, so the reflection
//      arrives a few milliseconds after the direct sound and cuts comb
//      notches whose frequencies depend on where the listener sits.
//   2. Floor and ceiling face each other: high-order floor-ceiling images
//      (a flutter) are kept when both are hard.
//   3. A wooden dais (the "temple" floor) is a plate with its own bending
//      modes; seated singers drive it through their bodies and it rings
//      back at low frequency. Stone floors do not.


export const SPEED = 343.0; // m/s
const BANDS = [125, 250, 500, 1000, 2000, 4000];

// Absorption coefficients per octave band (typical published magnitudes).
export const MATERIALS = {
    stone: { label: "Stone", alpha: [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], sigma: 0 },
    rock: { label: "Rough rock", alpha: [0.02, 0.03, 0.03, 0.04, 0.05, 0.07], sigma: 0 },
    plaster: { label: "Plaster", alpha: [0.013, 0.015, 0.02, 0.03, 0.04, 0.05], sigma: 0 },
    wood: { label: "Wood panels", alpha: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], sigma: 0 },
    dais: { label: "Wooden dais", alpha: [0.3, 0.22, 0.15, 0.1, 0.08, 0.08], sigma: 0 },
    carpet: { label: "Carpet", alpha: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], sigma: 20000 },
    earth: { label: "Earth / grass", alpha: [0.11, 0.26, 0.6, 0.69, 0.92, 0.99], sigma: 200000 },
    cloth: { label: "Hangings", alpha: [0.07, 0.31, 0.49, 0.75, 0.7, 0.6], sigma: 0 },
    open: { label: "Open sky", alpha: [1, 1, 1, 1, 1, 1], sigma: 0 }
};

export const ROOMS = {
    hall: { label: "Stone assembly hall", dims: [24, 16, 9], floor: "stone", walls: "plaster", ceiling: "wood", listenerDistance: 7.0 },
    temple: { label: "Wooden temple on a dais", dims: [14, 10, 7], floor: "dais", walls: "wood", ceiling: "wood", listenerDistance: 5.0 },
    cave: { label: "Cave", dims: [12, 9, 5], floor: "rock", walls: "rock", ceiling: "rock", listenerDistance: 5.0 },
    chapel: { label: "Small chapel", dims: [10, 6, 8], floor: "stone", walls: "plaster", ceiling: "plaster", listenerDistance: 4.5 },
    carpeted: { label: "Carpeted hall with hangings", dims: [20, 14, 7], floor: "carpet", walls: "cloth", ceiling: "plaster", listenerDistance: 6.0 },
    open: { label: "Open air (floor only)", dims: [200, 200, 200], floor: "earth", walls: "open", ceiling: "open", listenerDistance: 8.0 }
};

function reflectionMagnitude(alpha) {
    return Math.sqrt(Math.max(0.0, 1.0 - alpha));
}

// DC-ish (125 Hz) and high (4 kHz) reflection magnitude of a surface.
function surfaceGains(mat) {
    return { low: reflectionMagnitude(mat.alpha[0]), high: reflectionMagnitude(mat.alpha[5]) };
}

// Eyring decay time per band.
export function eyring(room) {
    const [lx, ly, lz] = room.dims;
    const V = lx * ly * lz;
    const sFloor = lx * ly;
    const sWalls = 2 * (lx + ly) * lz;
    const S = 2 * sFloor + sWalls;
    const out = [];
    for (let b = 0; b < 6; b = b + 1) {
        const a = (sFloor * MATERIALS[room.floor].alpha[b] + sFloor * MATERIALS[room.ceiling].alpha[b] + sWalls * MATERIALS[room.walls].alpha[b]) / S;
        const air = [0.0, 0.0, 0.0003, 0.0007, 0.0017, 0.0055][b]; // nepers/m (m), approx
        const t = 0.161 * V / (-S * Math.log(Math.max(1e-6, 1.0 - a)) + 4.0 * air * V);
        out.push(t);
    }
    return out;
}

// Normalized surface impedance of a porous floor (Delany-Bazley).
function delanyBazley(f, sigma) {
    const x = 1.2 * f / sigma; // rho0 f / sigma
    return { re: 1.0 + 9.08 * Math.pow(x, -0.75), im: -11.9 * Math.pow(x, -0.73) };
}

// Floor reflection coefficient (complex) at frequency f and incidence cos.
function floorReflection(mat, f, cosTheta) {
    let a = mat.alpha[0];
    for (let b = 0; b < 5; b = b + 1) {
        if (f >= BANDS[b] && f < BANDS[b + 1]) {
            const t = Math.log(f / BANDS[b]) / Math.log(2.0);
            a = mat.alpha[b] + (mat.alpha[b + 1] - mat.alpha[b]) * t;
        }
    }
    if (f >= 4000) {
        a = mat.alpha[5];
    }
    const magnitude = reflectionMagnitude(a);
    if (mat.sigma > 0) {
        // Porous floor: the plane-wave coefficient from the Delany-Bazley
        // impedance gives the phase; its magnitude alone would call carpet
        // or earth nearly rigid at these angles (|R| 0.9-0.98, measured in
        // .dev/test_room.mjs), so the magnitude follows the measured
        // absorption instead. The spherical-wave ground wave that produces
        // the outdoor ground dip at grazing incidence is not modelled.
        const z = delanyBazley(f, mat.sigma);
        const ar = z.re * cosTheta - 1.0;
        const ai = z.im * cosTheta;
        const br = z.re * cosTheta + 1.0;
        const bi = z.im * cosTheta;
        const den = br * br + bi * bi;
        const re = (ar * br + ai * bi) / den;
        const im = (ai * br - ar * bi) / den;
        const m = Math.sqrt(re * re + im * im) + 1e-12;
        return { re: re / m * magnitude, im: im / m * magnitude };
    }
    return { re: magnitude, im: 0.0 };
}

const FIR = 24;
const FIR_CENTRE = 8;

// Design a short FIR for the floor reflection by frequency sampling.
function designFloorFir(mat, cosTheta, sr, out) {
    const K = 64;
    for (let n = 0; n < FIR; n = n + 1) {
        let acc = 0.0;
        for (let k = 0; k <= K; k = k + 1) {
            const f = Math.max(20.0, (k / K) * sr * 0.5);
            const r = floorReflection(mat, f, cosTheta);
            const w = Math.PI * k / K;
            const ph = w * (n - FIR_CENTRE);
            const weight = (k === 0 || k === K) ? 0.5 : 1.0;
            acc = acc + weight * (r.re * Math.cos(ph) - r.im * Math.sin(ph));
        }
        const win = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * (n + 0.5) / FIR);
        out[n] = acc / K * win;
    }
}

// Brightness bins: taps are summed into a few buses, each low-passed once.
const BIN_CUTOFF = [20000, 9000, 4500, 2200, 1100];
const BIN_EDGES = [0.92, 0.75, 0.5, 0.3];

function binFor(brightness) {
    for (let i = 0; i < BIN_EDGES.length; i = i + 1) {
        if (brightness >= BIN_EDGES[i]) {
            return i;
        }
    }
    return BIN_EDGES.length;
}

// The late field: 8 delay lines, Hadamard mixing, and in each line a loop
// gain set per band from the room's predicted decay. Each line applies its
// mid-band gain, then splits off its low part (below ~250 Hz) and high part
// (above ~3 kHz) with complementary one-pole filters and scales them to the
// low- and high-band gains, so the three bands decay at their own rates.
const LATE_LENGTHS = [1031, 1327, 1523, 1801, 2089, 2351, 2713, 3061];

class LateField {
    constructor(sr) {
        this.sr = sr;
        this.lines = [];
        this.len = [];
        this.pos = new Int32Array(8);
        this.gMid = new Float64Array(8);
        this.gLowRel = new Float64Array(8);
        this.gHighRel = new Float64Array(8);
        this.lowState = new Float64Array(8);
        this.highState = new Float64Array(8);
        this.out = new Float64Array(8);
        this.lowCoef = 1.0 - Math.exp(-2.0 * Math.PI * 250.0 / sr);
        this.highCoef = 1.0 - Math.exp(-2.0 * Math.PI * 3000.0 / sr);
        this.preLen = 1;
        this.pre = new Float32Array(Math.ceil(0.12 * sr) + 1);
        this.prePos = 0;
        this.gain = 0.0;
        this.scale = 1.0;
        for (let i = 0; i < 8; i = i + 1) {
            const n = Math.round(LATE_LENGTHS[i] * sr / 48000.0);
            this.lines.push(new Float32Array(n));
            this.len.push(n);
        }
    }

    // t: decay times (s) per band [125 .. 4k]; size scales the line lengths
    configure(t, preDelaySeconds) {
        const tLow = Math.max(0.05, t[0]);
        const tMid = Math.max(0.05, 0.5 * (t[2] + t[3]));
        const tHigh = Math.max(0.05, t[5]);
        for (let i = 0; i < 8; i = i + 1) {
            const m = this.len[i];
            const gm = Math.pow(10.0, -3.0 * m / (tMid * this.sr));
            this.gMid[i] = gm;
            this.gLowRel[i] = Math.pow(10.0, -3.0 * m / (tLow * this.sr)) / gm;
            this.gHighRel[i] = Math.pow(10.0, -3.0 * m / (tHigh * this.sr)) / gm;
        }
        this.preLen = Math.max(1, Math.min(this.pre.length - 1, Math.round(preDelaySeconds * this.sr)));
    }

    clear() {
        for (let i = 0; i < 8; i = i + 1) {
            this.lines[i].fill(0.0);
            this.lowState[i] = 0.0;
            this.highState[i] = 0.0;
        }
        this.pre.fill(0.0);
    }

    // Output RMS for unit-RMS white input, used to set an absolute level.
    measureScale() {
        this.clear();
        let seed = 12345;
        let e = 0.0;
        const n = Math.round(1.5 * this.sr);
        const keepGain = this.gain;
        this.gain = 1.0;
        for (let i = 0; i < n; i = i + 1) {
            seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
            const x = (seed / 4294967296.0 - 0.5) * Math.sqrt(12.0);
            const y = this.tick(x);
            if (i > n / 2) {
                e = e + y.l * y.l;
            }
        }
        this.gain = keepGain;
        this.clear();
        return Math.sqrt(e / (n - n / 2));
    }

    tick(x) {
        const delayed = this.pre[this.prePos];
        this.pre[this.prePos] = x;
        this.prePos = this.prePos + 1;
        if (this.prePos > this.preLen) {
            this.prePos = 0;
        }
        const out = this.out;
        for (let i = 0; i < 8; i = i + 1) {
            const raw = this.lines[i][this.pos[i]] * this.gMid[i];
            this.lowState[i] = this.lowState[i] + (raw - this.lowState[i]) * this.lowCoef;
            const low = this.lowState[i];
            const rest = raw - low;
            this.highState[i] = this.highState[i] + (rest - this.highState[i]) * this.highCoef;
            const mid = this.highState[i];
            const high = rest - mid;
            out[i] = low * this.gLowRel[i] + mid + high * this.gHighRel[i];
        }
        const h = 1.0 / Math.sqrt(8.0);
        const a0 = out[0] + out[1], a1 = out[0] - out[1], a2 = out[2] + out[3], a3 = out[2] - out[3];
        const a4 = out[4] + out[5], a5 = out[4] - out[5], a6 = out[6] + out[7], a7 = out[6] - out[7];
        const b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
        const b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
        const m = [(b0 + b4) * h, (b1 + b5) * h, (b2 + b6) * h, (b3 + b7) * h, (b0 - b4) * h, (b1 - b5) * h, (b2 - b6) * h, (b3 - b7) * h];
        for (let i = 0; i < 8; i = i + 1) {
            this.lines[i][this.pos[i]] = m[i] + (i % 2 === 0 ? delayed : -delayed);
            this.pos[i] = this.pos[i] + 1;
            if (this.pos[i] >= this.len[i]) {
                this.pos[i] = 0;
            }
        }
        this.lastL = (out[0] + out[2] + out[4] + out[6]) * this.gain;
        this.lastR = (out[1] + out[3] + out[5] + out[7]) * this.gain;
        this.result.l = this.lastL;
        this.result.r = this.lastR;
        return this.result;
    }
}

const MAX_TAPS = 28;
const DELAY_SECONDS = 0.32;

class Seat {
    constructor(sr) {
        this.len = Math.ceil(DELAY_SECONDS * sr) + FIR + 4;
        this.buf = new Float32Array(this.len);
        this.pos = 0;
        this.tapDelay = [new Int32Array(MAX_TAPS), new Int32Array(MAX_TAPS)];
        this.tapGain = [new Float32Array(MAX_TAPS), new Float32Array(MAX_TAPS)];
        this.tapBin = [new Int32Array(MAX_TAPS), new Int32Array(MAX_TAPS)];
        this.tapCount = [0, 0];
        this.floorDelay = [0, 0];
        this.floorFir = [new Float32Array(FIR), new Float32Array(FIR)];
        this.floorGain = [0.0, 0.0];
        this.position = [0, 0, 1];
        this.input = null;
        this.onDais = true;
    }
}

// Room settings shared by the page: preset ("classic" keeps the old hall),
// floor override, posture (seated / standing) and listener distance.
export function defaultRoomSettings() {
    return { preset: "temple", floor: "room", posture: "seated", distance: 0 };
}

export function makeRoom(sr, settings) {
    if (settings.preset === "classic") {
        return null;
    }
    const room = new Room(sr);
    room.setRoom(settings.preset, settings.floor === "room" ? null : settings.floor);
    if (settings.distance > 0) {
        room.listenerDistance = settings.distance;
        room.applyLate();
    }
    room.postureHeight = settings.posture === "standing" ? 1.6 : 0.9;
    return room;
}

export class Room {
    constructor(sr) {
        this.sr = sr;
        this.seats = [];
        this.preset = "hall";
        this.room = ROOMS.hall;
        this.floorOverride = null;
        this.listenerDistance = 7.0;
        this.listenerHeight = 1.2;
        this.postureHeight = 0.9;
        this.late = new LateField(sr);
        this.late.result = { l: 0.0, r: 0.0 };
        this.lateLevel = 0.3;
        this.bus = [new Float32Array(5), new Float32Array(5)];
        this.lp = [new Float32Array(5), new Float32Array(5)];
        this.lpCoef = new Float32Array(5);
        for (let i = 0; i < 5; i = i + 1) {
            this.lpCoef[i] = 1.0 - Math.exp(-2.0 * Math.PI * Math.min(BIN_CUTOFF[i], 0.45 * sr) / sr);
        }
        // dais plate modes
        this.daisModes = [];
        this.daisLow = 0.0;
        this.daisOn = false;
        this.daisPlate = true;
        this.daisLevel = 0.0;
        this.lateL = new Float32Array(128);
        this.lateR = new Float32Array(128);
        this.dryL = new Float32Array(128);
        this.dryR = new Float32Array(128);
        this.monoScratch = new Float32Array(128);
        this.rt = eyring(this.room);
        this.applyLate();
    }

    floorMaterial() {
        return MATERIALS[this.floorOverride !== null ? this.floorOverride : this.room.floor];
    }

    setRoom(preset, floorOverride) {
        this.preset = preset;
        this.room = ROOMS[preset];
        this.floorOverride = floorOverride === undefined ? null : floorOverride;
        this.listenerDistance = this.room.listenerDistance;
        const r = Object.assign({}, this.room);
        if (this.floorOverride !== null) {
            r.floor = this.floorOverride;
        }
        this.rt = eyring(r);
        this.applyLate();
        this.setupDais();
        for (let i = 0; i < this.seats.length; i = i + 1) {
            this.computeSeat(this.seats[i]);
        }
    }

    applyLate() {
        const [lx, ly, lz] = this.room.dims;
        const V = lx * ly * lz;
        const S = 2 * lx * ly + 2 * (lx + ly) * lz;
        // late field begins after about one mean free path (4V/S)
        const mfp = 4.0 * V / S;
        this.late.configure(this.rt, Math.min(0.1, mfp / SPEED));
        const unit = this.late.measureScale();
        // Diffuse level: with the direct tap at 1/r, the reverberant field
        // has mean square 16 pi / R (room constant R = S a / (1 - a)).
        const tMid = 0.5 * (this.rt[2] + this.rt[3]);
        const a = Math.min(0.99, 0.161 * V / Math.max(tMid, 0.05) / S);
        const R = S * a / Math.max(1e-3, 1.0 - a);
        const target = Math.sqrt(16.0 * Math.PI / R);
        this.late.gain = this.room.walls === "open" ? 0.0 : target / Math.max(unit, 1e-9);
        this.lateLevel = 1.0;
    }

    // A wooden plate on joists: bending modes f_mn = (pi/2) sqrt(D/(rho h))
    // ((m/a)^2 + (n/b)^2), here 4 m x 3 m, 5 cm softwood (E 10 GPa,
    // 500 kg/m^3), loss factor 0.03 (Q ~ 33).
    setupDais() {
        const mat = this.floorOverride !== null ? this.floorOverride : this.room.floor;
        this.daisOn = mat === "dais";
        this.daisModes = [];
        if (!this.daisOn) {
            return;
        }
        const E = 1.0e10;
        const h = 0.05;
        const rho = 500.0;
        const nu = 0.3;
        const D = E * h * h * h / (12.0 * (1.0 - nu * nu));
        const k = 0.5 * Math.PI * Math.sqrt(D / (rho * h));
        const a = 4.0;
        const b = 3.0;
        for (let m = 1; m <= 6; m = m + 1) {
            for (let n = 1; n <= 6; n = n + 1) {
                const f = k * ((m / a) * (m / a) + (n / b) * (n / b));
                if (f > 25.0 && f < 260.0) {
                    const q = 33.0;
                    const r = Math.exp(-Math.PI * f / q / this.sr);
                    this.daisModes.push({ f: f, c1: 2.0 * r * Math.cos(2.0 * Math.PI * f / this.sr), c2: -r * r, y1: 0.0, y2: 0.0, g: (1.0 - r) / Math.sqrt(m * n) });
                }
            }
        }
        this.daisModes.sort(function byFreq(x, y) { return x.f - y.f; });
    }

    // Overall gain so rooms are compared at equal loudness: the inverse of
    // the expected direct + diffuse amplitude at the listener.
    loudnessScale() {
        const r = this.listenerDistance;
        const [lx, ly, lz] = this.room.dims;
        const V = lx * ly * lz;
        const S = 2 * lx * ly + 2 * (lx + ly) * lz;
        const tMid = 0.5 * (this.rt[2] + this.rt[3]);
        const a = Math.min(0.99, 0.161 * V / Math.max(tMid, 0.05) / S);
        const R = S * a / Math.max(1e-3, 1.0 - a);
        const diffuse = this.room.walls === "open" ? 0.0 : 16.0 * Math.PI / R;
        return 1.0 / Math.sqrt(1.0 / (r * r) + diffuse);
    }

    // seat position in metres relative to the stage centre on the floor:
    // x across, y toward the listener (negative = further back), z height
    addSeat(x, y, z, onDais) {
        const s = new Seat(this.sr);
        s.position = [x, y, z];
        s.onDais = onDais !== false;
        this.computeSeat(s);
        this.seats.push(s);
        return s;
    }

    clearSeats() {
        this.seats = [];
    }

    // Room coordinates: stage centre at (Lx/2, 2.5 m from the front wall);
    // the listener faces the stage from listenerDistance in front of it.
    toRoom(p) {
        const [lx, ly] = this.room.dims;
        const sx = lx * 0.5;
        const sy = Math.min(2.5, ly * 0.2);
        return [sx + p[0], sy - p[1], p[2]];
    }

    earPositions() {
        const [lx, ly] = this.room.dims;
        const sy = Math.min(2.5, ly * 0.2);
        const y = Math.min(ly - 0.5, sy + this.listenerDistance);
        return [[lx * 0.5 - 0.085, y, this.listenerHeight], [lx * 0.5 + 0.085, y, this.listenerHeight]];
    }

    computeSeat(seat) {
        const [lx, ly, lz] = this.room.dims;
        const src = this.toRoom(seat.position);
        const ears = this.earPositions();
        const fl = this.floorMaterial();
        const wl = MATERIALS[this.room.walls];
        const cl = MATERIALS[this.room.ceiling];
        const wg = surfaceGains(wl);
        const fg = surfaceGains(fl);
        const cg = surfaceGains(cl);
        const sr = this.sr;
        const maxDelay = Math.floor(DELAY_SECONDS * sr) - FIR;
        const flutterOk = fl.sigma === 0 && cl !== MATERIALS.open && fg.high > 0.9 && cg.high > 0.9;
        for (let e = 0; e < 2; e = e + 1) {
            const ear = ears[e];
            const axisAngle = e === 0 ? -55.0 * Math.PI / 180.0 : 55.0 * Math.PI / 180.0;
            // capsule axis points toward the stage (-y), rotated by axisAngle
            const ax = Math.sin(axisAngle);
            const ay = -Math.cos(axisAngle);
            const cand = [];
            for (let nx = -2; nx <= 2; nx = nx + 1) {
                for (let ny = -2; ny <= 2; ny = ny + 1) {
                    for (let nz = -4; nz <= 4; nz = nz + 1) {
                        for (let px = 0; px < 2; px = px + 1) {
                            for (let py = 0; py < 2; py = py + 1) {
                                for (let pz = 0; pz < 2; pz = pz + 1) {
                                    const cx0 = Math.abs(nx - px);
                                    const cx1 = Math.abs(nx);
                                    const cy0 = Math.abs(ny - py);
                                    const cy1 = Math.abs(ny);
                                    const cz0 = Math.abs(nz - pz); // floor bounces
                                    const cz1 = Math.abs(nz);      // ceiling bounces
                                    const wallOrder = cx0 + cx1 + cy0 + cy1;
                                    const order = wallOrder + cz0 + cz1;
                                    const zOnly = wallOrder === 0;
                                    if (order > 3 && !(zOnly && flutterOk && order <= 8)) {
                                        continue;
                                    }
                                    const ix = 2 * nx * lx + (px === 0 ? src[0] : -src[0]);
                                    const iy = 2 * ny * ly + (py === 0 ? src[1] : -src[1]);
                                    const iz = 2 * nz * lz + (pz === 0 ? src[2] : -src[2]);
                                    const dx = ix - ear[0];
                                    const dy = iy - ear[1];
                                    const dz = iz - ear[2];
                                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                                    const delay = Math.round(d / SPEED * sr);
                                    if (delay >= maxDelay) {
                                        continue;
                                    }
                                    let low = Math.pow(wg.low, wallOrder) * Math.pow(fg.low, cz0) * Math.pow(cg.low, cz1);
                                    let high = Math.pow(wg.high, wallOrder) * Math.pow(fg.high, cz0) * Math.pow(cg.high, cz1);
                                    if (low <= 1e-6) {
                                        continue;
                                    }
                                    // u points from the ear toward the image: the direction
                                    // the sound arrives from; cardioid response 0.5 (1 + u.a)
                                    const ux = dx / d;
                                    const uy = dy / d;
                                    const cosAxis = ux * ax + uy * ay;
                                    const dir = 0.5 * (1.0 + cosAxis);
                                    const air = Math.pow(10.0, -0.004 * d / 20.0 * 4.0);
                                    const gain = low * dir / Math.max(d, 0.3);
                                    const brightness = Math.min(1.0, (high / low) * air);
                                    const isFloorFirst = cz0 === 1 && cz1 === 0 && wallOrder === 0 && pz === 1 && nz === 0;
                                    cand.push({ delay: delay, gain: gain, brightness: brightness, floor: isFloorFirst, cosTheta: Math.abs(src[2] + ear[2]) / d, dir: dir, d: d });
                                }
                            }
                        }
                    }
                }
            }
            cand.sort(function byGain(a, b) { return b.gain - a.gain; });
            let count = 0;
            seat.floorGain[e] = 0.0;
            for (let i = 0; i < cand.length; i = i + 1) {
                const c = cand[i];
                if (c.floor) {
                    seat.floorDelay[e] = Math.max(0, c.delay - FIR_CENTRE);
                    seat.floorGain[e] = c.dir / Math.max(c.d, 0.3);
                    designFloorFir(fl, c.cosTheta, sr, seat.floorFir[e]);
                    continue;
                }
                if (count >= MAX_TAPS) {
                    continue;
                }
                seat.tapDelay[e][count] = c.delay;
                seat.tapGain[e][count] = c.gain;
                seat.tapBin[e][count] = binFor(c.brightness);
                count = count + 1;
            }
            seat.tapCount[e] = count;
        }
    }

    // inputs: one mono Float32Array per seat (same order as seats), n samples
    process(outL, outR, n, offset) {
        const seats = this.seats;
        const lateIn = this.monoScratch;
        const L = this.lateL;
        const R = this.lateR;
        for (let i = 0; i < n; i = i + 1) {
            const busL = this.bus[0];
            const busR = this.bus[1];
            busL.fill(0.0);
            busR.fill(0.0);
            let floorL = 0.0;
            let floorR = 0.0;
            let dais = 0.0;
            let lateSum = 0.0;
            for (let s = 0; s < seats.length; s = s + 1) {
                const seat = seats[s];
                const x = seat.input === null ? 0.0 : seat.input[i];
                const buf = seat.buf;
                const len = seat.len;
                buf[seat.pos] = x;
                lateSum = lateSum + x;
                if (seat.onDais) {
                    dais = dais + x;
                }
                for (let e = 0; e < 2; e = e + 1) {
                    const bus = e === 0 ? busL : busR;
                    const dl = seat.tapDelay[e];
                    const gl = seat.tapGain[e];
                    const bl = seat.tapBin[e];
                    const tc = seat.tapCount[e];
                    for (let t = 0; t < tc; t = t + 1) {
                        let idx = seat.pos - dl[t];
                        if (idx < 0) {
                            idx = idx + len;
                        }
                        bus[bl[t]] = bus[bl[t]] + buf[idx] * gl[t];
                    }
                    if (seat.floorGain[e] > 0.0) {
                        const fir = seat.floorFir[e];
                        let acc = 0.0;
                        let idx = seat.pos - seat.floorDelay[e];
                        if (idx < 0) {
                            idx = idx + len;
                        }
                        for (let k = 0; k < FIR; k = k + 1) {
                            acc = acc + fir[k] * buf[idx];
                            idx = idx - 1;
                            if (idx < 0) {
                                idx = idx + len;
                            }
                        }
                        if (e === 0) {
                            floorL = floorL + acc * seat.floorGain[e];
                        } else {
                            floorR = floorR + acc * seat.floorGain[e];
                        }
                    }
                }
                seat.pos = seat.pos + 1;
                if (seat.pos >= len) {
                    seat.pos = 0;
                }
            }
            let yl = floorL;
            let yr = floorR;
            for (let b = 0; b < 5; b = b + 1) {
                this.lp[0][b] = this.lp[0][b] + (busL[b] - this.lp[0][b]) * this.lpCoef[b];
                this.lp[1][b] = this.lp[1][b] + (busR[b] - this.lp[1][b]) * this.lpCoef[b];
                yl = yl + this.lp[0][b];
                yr = yr + this.lp[1][b];
            }
            if (this.daisOn && this.daisPlate) {
                // structure-borne drive: the singers' low frequencies
                this.daisLow = this.daisLow + (dais - this.daisLow) * 0.02;
                let ring = 0.0;
                const modes = this.daisModes;
                for (let m = 0; m < modes.length; m = m + 1) {
                    const md = modes[m];
                    const y = md.c1 * md.y1 + md.c2 * md.y2 + md.g * this.daisLow;
                    md.y2 = md.y1;
                    md.y1 = y;
                    ring = ring + y;
                }
                ring = ring * 0.2;
                this.daisLevel = this.daisLevel + (ring * ring - this.daisLevel) * 0.0005;
                yl = yl + ring;
                yr = yr + ring;
            }
            outL[offset + i] = outL[offset + i] + yl;
            outR[offset + i] = outR[offset + i] + yr;
            lateIn[i] = lateSum;
        }
        // late field on the summed seats
        if (this.late.gain > 0.0) {
            for (let i = 0; i < n; i = i + 1) {
                const r = this.late.tick(lateIn[i]);
                outL[offset + i] = outL[offset + i] + r.l;
                outR[offset + i] = outR[offset + i] + r.r;
            }
        }
    }
}
