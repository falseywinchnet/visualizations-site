// Throat-singing mechanics shared by the singer, the choir and the page.
//
// The mouth map. The older overtone tuners listen to one resonance and push
// one articulator toward a target (feedback). That needs a gesture along
// which the resonance moves monotonically, and it cannot hear through the
// nose. A practised throat singer instead knows their own mouth: which shape
// makes a given harmonic stand out. The map is that knowledge. Over a plane
// of two gestures (a, b = 0..1; for example tongue place and how open the
// hidden mouth cavity is) it stores the exact response of the whole branched
// tube (lips plus nostrils, branch.js) on a log-frequency grid. To sing
// harmonic n of a fundamental fs the singer picks the shape where harmonic n
// stands highest above its neighbours, preferring shapes near where it is,
// and moves there. One gesture line along a was not enough: through the nose
// the moving resonance travelled only 690-800 Hz, while an offline search
// over tongue place, height and jaw found every harmonic 4-18 of 110 Hz
// reachable somewhere (.dev/README.md). The map is rebuilt one shape per
// audio block whenever the body, the gesture, the larynx or the epilarynx
// changes, so building it never stalls the audio.

import { SECTIONS, SPEED_OF_SOUND, makeArticulation, areaFunction, nasalAreas, velumJunction, velumArea, lipRadius, MAX_NASAL_SECTIONS } from "./anatomy.js?v=9500908dbe";
import { radiationPole } from "./tract.js?v=44afeabdc1";
import { makeBranchShape, prepareBranch, branchResponseAt } from "./branch.js?v=858edf769a";

export const MAP_STEPS = 25;    // along gesture a
export const MAP_STEPS_B = 6;   // along gesture b (1 for a single line)
export const MAP_STEPS_FOCUS = 9;  // along the focus gesture's fine-tuning axis
const MAP_ROWS_MAX = MAP_STEPS * MAP_STEPS_FOCUS;
export const MAP_BINS = 320;
export const MAP_LOW_HZ = 60.0;
export const MAP_HIGH_HZ = 5000.0;

const LOG_LOW = Math.log(MAP_LOW_HZ);
const LOG_SPAN = Math.log(MAP_HIGH_HZ) - Math.log(MAP_LOW_HZ);

// Gesture planes for the map tuners: articulation at the corners
// [a0b0, a1b0, a0b1, a1b1], blended bilinearly.
function shape(tp, th, jaw, lip, prot, velum, epi) {
    return { tonguePos: tp, tongueHeight: th, jaw: jaw, lipAperture: lip, lipProtrusion: prot, tipPos: 0.9, tipClose: 0.0, velum: velum, larynx: 0.0, epilarynx: epi };
}
// Labial (uruulyn): a = the lips, from a small protruded round opening to a
// wide spread one; b = where the tongue body is held, back to front.
export const LABIAL_PLANE = [
    shape(0.42, 0.72, 0.18, 0.07, 1.0, 0.0, 0.6), shape(0.42, 0.72, 0.24, 0.5, 0.0, 0.0, 0.6),
    shape(0.78, 0.72, 0.18, 0.07, 1.0, 0.0, 0.6), shape(0.78, 0.72, 0.24, 0.5, 0.0, 0.0, 0.6)
];
// Nasal (dumchuktaar / khamryn): lips sealed, velum open, the voice leaves
// through the nose. a = tongue place, back to front; b = the hidden mouth
// cavity, from tongue high and jaw closed to tongue low and jaw dropped.
export const NASAL_PLANE = [
    shape(0.3, 0.92, 0.15, 0.03, 0.8, 1.0, 0.6), shape(0.86, 0.9, 0.15, 0.03, 0.8, 1.0, 0.6),
    shape(0.3, 0.35, 0.55, 0.03, 0.8, 1.0, 0.6), shape(0.86, 0.35, 0.55, 0.03, 0.8, 1.0, 0.6)
];
// Throat (bagalzuuryn): a = the tongue root walking up the pharynx;
// b = the mouth, from a small rounded opening to an open one.
export const THROAT_PLANE = [
    shape(0.2, 0.85, 0.25, 0.15, 0.7, 0.0, 0.8), shape(0.5, 0.8, 0.25, 0.15, 0.7, 0.0, 0.8),
    shape(0.2, 0.85, 0.6, 0.6, 0.2, 0.0, 0.8), shape(0.5, 0.8, 0.6, 0.6, 0.2, 0.0, 0.8)
];

// Focus (two constrictions, after MRI of Tuvan singers: a severe narrowing
// at the alveolar ridge merges F2 and F3 into one sharp peak, a second at
// the back of the tongue moves it). Knots learned offline for a baritone
// (.dev/README.md): for each focus frequency, among 142 155 shapes, the one
// whose harmonic rises furthest above both neighbours for drones of 100 and
// 130 Hz, chosen jointly so neighbouring knots stay close. Columns:
// focus Hz, tonguePos, tongueHeight, tipPos, tipClose, jaw, lipAperture,
// lipProtrusion. Scored on the rise over the louder neighbour plus half the
// rise over the harmonics two away: closed form 18-20 dB over +-1 and
// 22-34 dB over +-2 (rewarding +-1 alone gave 21-28 dB over +-2).
// There are exactly MAP_STEPS knots, so each row of the map is a knot.
export const FOCUS_KNOTS = [
    [800, 0.28, 0.905, 0.72, 0.99, 0.3, 0.35, 0.5],
    [840, 0.31, 0.84, 0.72, 0.99, 0.3, 0.35, 0.5],
    [883, 0.34, 0.775, 0.75, 0.99, 0.3, 0.35, 0.5],
    [927, 0.37, 0.71, 0.75, 0.99, 0.3, 0.35, 0.5],
    [974, 0.46, 0.71, 0.75, 0.99, 0.3, 0.35, 0.5],
    [1023, 0.49, 0.71, 0.75, 0.99, 0.3, 0.35, 0.5],
    [1074, 0.4, 0.58, 0.78, 0.99, 0.3, 0.7, 0.5],
    [1128, 0.37, 0.58, 0.72, 0.99, 0.3, 0.7, 1],
    [1185, 0.34, 0.58, 0.72, 0.99, 0.3, 0.7, 1],
    [1245, 0.31, 0.58, 0.75, 0.99, 0.3, 0.7, 1],
    [1307, 0.34, 0.45, 0.75, 0.99, 0.3, 0.7, 1],
    [1373, 0.49, 0.45, 0.75, 0.99, 0.3, 0.7, 1],
    [1442, 0.52, 0.45, 0.75, 0.99, 0.3, 0.7, 1],
    [1515, 0.52, 0.45, 0.75, 0.93, 0.3, 0.1, 1],
    [1591, 0.52, 0.515, 0.72, 0.93, 0.3, 0.1, 1],
    [1671, 0.52, 0.58, 0.72, 0.87, 0.3, 0.1, 1],
    [1755, 0.49, 0.515, 0.69, 0.87, 0.3, 0.1, 1],
    [1844, 0.52, 0.515, 0.72, 0.81, 0.3, 0.1, 1],
    [1936, 0.58, 0.45, 0.78, 0.81, 0.3, 0.1, 1],
    [2034, 0.61, 0.45, 0.78, 0.81, 0.3, 0.1, 1],
    [2136, 0.61, 0.45, 0.78, 0.75, 0.3, 0.1, 1],
    [2244, 0.61, 0.45, 0.72, 0.75, 0.3, 0.1, 1],
    [2357, 0.61, 0.515, 0.69, 0.75, 0.3, 0.1, 1],
    [2475, 0.61, 0.71, 0.69, 0.75, 0.3, 0.1, 1],
    [2600, 0.58, 0.645, 0.63, 0.75, 0.3, 0.1, 1]
];

// Number of steps along b for a tuning (the vowel walk is a single line).
export function stepsB(tuning) {
    if (tuning === "vowel") {
        return 1;
    }
    if (tuning === "focus") {
        return MAP_STEPS_FOCUS;
    }
    return MAP_STEPS_B;
}

function exactLevel(shape, f, rate) {
    const r = branchResponseAt(shape, 2.0 * Math.PI * f / rate);
    return 10.0 * Math.log10((r.re * r.re + r.im * r.im) * f * f + 1e-30);
}

function clamp01(x) {
    if (x < 0.0) {
        return 0.0;
    }
    if (x > 1.0) {
        return 1.0;
    }
    return x;
}

function parabolaShift(a, b, c) {
    const denom = a - 2.0 * b + c;
    if (denom < 0.0) {
        return Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / denom));
    }
    return 0.0;
}

export const MAP_TUNINGS = ["labial", "nasal", "throat", "vowel", "focus"];

export function isMapTuning(t) {
    return t === "labial" || t === "nasal" || t === "throat" || t === "vowel" || t === "focus";
}

// Articulation at position q (0..1) along the focus knots, with the tongue
// body moved by fine (0..1 -> -0.035..+0.035 of tract position). The knots'
// peaks are about 20 Hz wide and 5% apart, so a harmonic between two knots
// fell on a slope and lost 10 dB; moving the back of the tongue slides the
// merged peak smoothly by 50-100 Hz without widening it (.dev/README.md),
// as the second constriction does in the MRI study.
export function focusArticulation(q, fine, out) {
    const last = FOCUS_KNOTS.length - 1;
    let x = q * last;
    if (x < 0.0) {
        x = 0.0;
    }
    if (x > last) {
        x = last;
    }
    let i = Math.floor(x);
    if (i >= last) {
        i = last - 1;
    }
    const t = x - i;
    const a = FOCUS_KNOTS[i];
    const b = FOCUS_KNOTS[i + 1];
    out.tonguePos = a[1] + (b[1] - a[1]) * t + 0.07 * (fine - 0.5);
    out.tongueHeight = a[2] + (b[2] - a[2]) * t;
    out.tipPos = a[3] + (b[3] - a[3]) * t;
    out.tipClose = a[4] + (b[4] - a[4]) * t;
    out.jaw = a[5] + (b[5] - a[5]) * t;
    out.lipAperture = a[6] + (b[6] - a[6]) * t;
    out.lipProtrusion = a[7] + (b[7] - a[7]) * t;
    out.velum = 0.0;
    return out;
}

// Tunings that put one harmonic forward (and so follow a harmonic melody).
export function isHarmonicTuning(t) {
    return t === "overtone" || t === "sygyt" || t === "labial" || t === "nasal" || t === "throat" || t === "vowel" || t === "focus";
}

export class MouthMap {
    constructor() {
        this.table = new Float32Array(MAP_ROWS_MAX * MAP_BINS);
        this.values = new Float64Array(MAP_ROWS_MAX);
        this.key = "";
        this.built = 0;
        this.rows = MAP_STEPS;   // MAP_STEPS * steps along b
        this.stepsB = 1;
        this.chosenA = 0.5;
        this.chosenB = 0.5;
        // exact local refinement (refine)
        this.refinedA = 0.5;
        this.refinedB = 0.5;
        this.exactScore = 0.0;
        this.tickRate = 1.0;
        this.areas = new Float64Array(SECTIONS);
        this.nasal = new Float64Array(MAX_NASAL_SECTIONS);
        this.seg = { pharynx: 0, oral: 0, lips: 0, total: 0 };
        this.art = makeArticulation();
        this.shape = makeBranchShape();
        this.lastScore = 0.0;
    }

    // Start again for a gesture plane with nb steps along b.
    restart(key, nb) {
        this.key = key;
        this.built = 0;
        this.stepsB = nb;
        this.rows = MAP_STEPS * nb;
    }

    ready() {
        return this.built >= this.rows;
    }

    // Build the next shape. `singer` supplies the body and fills the
    // articulation for a point of the plane (Singer.pathArticulation).
    // Rows are ordered a-major: row = ia * stepsB + ib.
    buildRow(singer) {
        if (this.built >= this.rows) {
            return;
        }
        const row = this.built;
        const ia = Math.floor(row / this.stepsB);
        const ib = row - ia * this.stepsB;
        const qa = ia / (MAP_STEPS - 1);
        let qb = 0.0;
        if (this.stepsB > 1) {
            qb = ib / (this.stepsB - 1);
        }
        singer.pathArticulation(qa, qb, this.art);
        const L = areaFunction(singer.anatomy, this.art, this.areas, this.seg);
        const rate = SECTIONS * SPEED_OF_SOUND / L;
        const nc = nasalAreas(singer.anatomy, this.seg, this.nasal);
        const vj = velumJunction(this.seg);
        const va = velumArea(singer.anatomy, this.art);
        const lipPole = radiationPole(lipRadius(this.areas), rate, SPEED_OF_SOUND);
        const nosePole = radiationPole(Math.sqrt(this.nasal[nc - 1] / Math.PI), rate, SPEED_OF_SOUND);
        prepareBranch(this.shape, this.areas, nc, this.nasal, vj, va, lipPole, nosePole, 0.95);
        const base = row * MAP_BINS;
        for (let b = 0; b < MAP_BINS; b = b + 1) {
            const f = Math.exp(LOG_LOW + LOG_SPAN * b / (MAP_BINS - 1));
            const r = branchResponseAt(this.shape, 2.0 * Math.PI * f / rate);
            // radiated pressure ~ d/dt of the volume velocity: +6 dB/octave
            this.table[base + b] = 10.0 * Math.log10((r.re * r.re + r.im * r.im) * f * f + 1e-30);
        }
        this.built = row + 1;
    }

    // Level (dB) at gesture row `row` and frequency f, interpolated in log f.
    level(row, f) {
        let x = (Math.log(f) - LOG_LOW) / LOG_SPAN * (MAP_BINS - 1);
        if (x < 0.0) {
            x = 0.0;
        }
        if (x > MAP_BINS - 1.001) {
            x = MAP_BINS - 1.001;
        }
        const i = Math.floor(x);
        const t = x - i;
        const base = row * MAP_BINS;
        return this.table[base + i] * (1.0 - t) + this.table[base + i + 1] * t;
    }

    // How strongly harmonic n of fs stands out at gesture row `row`: its rise
    // over the louder neighbour, plus half its lead over every other harmonic
    // within six either side.
    score(row, fs, n) {
        const hn = this.level(row, n * fs);
        const lo = this.level(row, (n - 1) * fs);
        const hi = this.level(row, (n + 1) * fs);
        let others = -1e9;
        for (let k = Math.max(1, n - 6); k <= n + 6; k = k + 1) {
            if (k !== n && k * fs < MAP_HIGH_HZ) {
                const v = this.level(row, k * fs);
                if (v > others) {
                    others = v;
                }
            }
        }
        return (hn - Math.max(lo, hi)) + 0.5 * (hn - others);
    }

    // The point of the plane that best sings harmonic n, preferring to stay
    // near (curA, curB): crossing the whole plane on one axis costs 8 dB of
    // score. Writes chosenA, chosenB.
    choose(fs, n, curA, curB) {
        this.chosenA = curA;
        this.chosenB = curB;
        if (!this.ready() || n * fs > MAP_HIGH_HZ || n < 2) {
            return;
        }
        const nb = this.stepsB;
        let best = 0;
        let bestValue = -1e9;
        for (let r = 0; r < this.rows; r = r + 1) {
            const ia = Math.floor(r / nb);
            const ib = r - ia * nb;
            const qa = ia / (MAP_STEPS - 1);
            let qb = 0.0;
            if (nb > 1) {
                qb = ib / (nb - 1);
            }
            const v = this.score(r, fs, n) - 8.0 * (Math.abs(qa - curA) + Math.abs(qb - curB));
            this.values[r] = v;
            if (v > bestValue) {
                bestValue = v;
                best = r;
            }
        }
        const ia = Math.floor(best / nb);
        const ib = best - ia * nb;
        // parabolic refinement along each axis
        let shiftA = 0.0;
        if (ia > 0 && ia < MAP_STEPS - 1) {
            shiftA = parabolaShift(this.values[best - nb], bestValue, this.values[best + nb]);
        }
        let shiftB = 0.0;
        if (nb > 1 && ib > 0 && ib < nb - 1) {
            shiftB = parabolaShift(this.values[best - 1], bestValue, this.values[best + 1]);
        }
        this.lastScore = this.score(best, fs, n);
        this.chosenA = (ia + shiftA) / (MAP_STEPS - 1);
        if (nb > 1) {
            this.chosenB = (ib + shiftB) / (nb - 1);
        } else {
            this.chosenB = 0.0;
        }
    }

    // Exact score of the shape at (a, b) for harmonic n of fs, from the closed
    // form of the branched tube: rise over the louder neighbour plus a quarter
    // of the lead over the harmonics two away.
    exactAt(singer, a, b, fs, n) {
        singer.pathArticulation(clamp01(a), clamp01(b), this.art);
        const L = areaFunction(singer.anatomy, this.art, this.areas, this.seg);
        const rate = SECTIONS * SPEED_OF_SOUND / L;
        const nc = nasalAreas(singer.anatomy, this.seg, this.nasal);
        const lipPole = radiationPole(lipRadius(this.areas), rate, SPEED_OF_SOUND);
        const nosePole = radiationPole(Math.sqrt(this.nasal[nc - 1] / Math.PI), rate, SPEED_OF_SOUND);
        prepareBranch(this.shape, this.areas, nc, this.nasal, velumJunction(this.seg), velumArea(singer.anatomy, this.art), lipPole, nosePole, 0.95);
        const h = exactLevel(this.shape, n * fs, rate);
        const n1 = Math.max(exactLevel(this.shape, (n - 1) * fs, rate), exactLevel(this.shape, (n + 1) * fs, rate));
        let n2 = -1e9;
        if (n > 2) {
            n2 = Math.max(exactLevel(this.shape, (n - 2) * fs, rate), exactLevel(this.shape, (n + 2) * fs, rate));
        } else {
            n2 = exactLevel(this.shape, (n + 2) * fs, rate);
        }
        return (h - n1) + 0.25 * (h - n2);
    }

    // The singer feels around the map's choice: starting from where it was (if
    // the map still points near there) or from the map's choice, it tries small
    // moves along both gestures with the exact closed form, three rounds of
    // shrinking steps. The coarse map ranks shapes; this places the sharp peak
    // (about 20 Hz wide for the focus gesture) on the harmonic.
    refine(singer, fs, n) {
        if (!this.ready() || n * fs > MAP_HIGH_HZ || n < 2) {
            this.refinedA = this.chosenA;
            this.refinedB = this.chosenB;
            return;
        }
        const nb = this.stepsB;
        const rowA = 1.0 / (MAP_STEPS - 1);
        let rowB = 0.0;
        if (nb > 1) {
            rowB = 1.0 / (nb - 1);
        }
        let a = this.chosenA;
        let b = this.chosenB;
        if (Math.abs(this.refinedA - a) <= 1.5 * rowA && Math.abs(this.refinedB - b) <= 1.5 * rowB + 1e-9) {
            a = this.refinedA;
            b = this.refinedB;
        }
        let best = this.exactAt(singer, a, b, fs, n);
        let sa = 0.5 * rowA;
        let sb = 0.5 * rowB;
        for (let round = 0; round < 3; round = round + 1) {
            for (let k = 0; k < 4; k = k + 1) {
                let ta = a;
                let tb = b;
                if (k === 0) {
                    ta = a + sa;
                } else if (k === 1) {
                    ta = a - sa;
                } else if (k === 2) {
                    tb = b + sb;
                } else {
                    tb = b - sb;
                }
                if ((k >= 2 && sb === 0.0) || ta < 0.0 || ta > 1.0 || tb < 0.0 || tb > 1.0) {
                    continue;
                }
                const v = this.exactAt(singer, ta, tb, fs, n);
                if (v > best) {
                    best = v;
                    a = ta;
                    b = tb;
                }
            }
            sa = sa * 0.5;
            sb = sb * 0.5;
        }
        this.refinedA = a;
        this.refinedB = b;
        this.exactScore = best;
    }
}

// Harmonic melodies (harmonic numbers, one per step). Original patterns.
// Harmonics 6, 8, 9, 10, 12 of one drone are a major pentatonic
// (sol do re mi sol), the scale most overtone melodies live in.
export const MELODIES = {
    "": { label: "— (hold one harmonic)", steps: [] },
    rise: { label: "Pentatonic rise and fall", steps: [6, 8, 9, 10, 12, 10, 9, 8] },
    call: { label: "Herder's call", steps: [8, 8, 12, 10, 9, 8, 6, 8] },
    ripple: { label: "Ripple", steps: [9, 10, 9, 10, 12, 10, 9, 8] },
    descent: { label: "Long descent", steps: [12, 12, 10, 10, 9, 9, 8, 8, 6, 6, 8, 9] },
    high: { label: "High whistle line", steps: [10, 12, 13, 12, 10, 12, 14, 12] },
    walk: { label: "Kargyraa vowel walk (low harmonics)", steps: [4, 5, 6, 5, 4, 6, 7, 6] }
};

export function parseMelody(text) {
    const out = [];
    if (typeof text !== "string") {
        return out;
    }
    if (MELODIES[text] !== undefined) {
        const s = MELODIES[text].steps;
        for (let i = 0; i < s.length; i = i + 1) {
            out.push(s[i]);
        }
        return out;
    }
    const parts = text.split(/[\s,]+/);
    for (let i = 0; i < parts.length; i = i + 1) {
        const n = parseInt(parts[i], 10);
        if (n >= 2 && n <= 24) {
            out.push(n);
        }
    }
    return out;
}

export const ORNAMENTS = {
    none: "none",
    trill: "harmonic trill (tongue, borbangnadyr)",
    flutter: "lip flutter",
    tip: "tongue-tip trill",
    gallop: "gallop (lips, ezengileer)"
};

// Breath-game motifs: d +1 exhale / -1 inhale, v 1 voiced / 0 breath only,
// p semitones from the note, w vowel (0 ooh .. 1 eeh), r 1 for a rest.
// Original motifs in the manner of a vocal game.
export const PATTERNS = {
    none: { label: "none", steps: [] },
    pair: { label: "Out low, in high", steps: [{ d: 1, v: 1, p: 0, w: 0.45 }, { d: -1, v: 1, p: 7, w: 0.15 }] },
    three: { label: "Out, out, in-breath", steps: [{ d: 1, v: 1, p: 0, w: 0.5 }, { d: 1, v: 1, p: 0, w: 0.3 }, { d: -1, v: 0, p: 0, w: 0.2 }] },
    hocket: { label: "Voice, breath, voice, rest", steps: [{ d: 1, v: 1, p: 0, w: 0.5 }, { d: -1, v: 0, p: 0, w: 0.4 }, { d: -1, v: 1, p: 12, w: 0.1 }, { r: 1 }] },
    rolling: { label: "Rolling four", steps: [{ d: 1, v: 1, p: 0, w: 0.55 }, { d: -1, v: 1, p: 5, w: 0.2 }, { d: 1, v: 0, p: 0, w: 0.5 }, { d: -1, v: 1, p: 12, w: 0.05 }] }
};

// Per-monk throat styles: fields set on the singer's config when chosen.
export const STYLES = {
    plain: { label: "Plain chant", set: { register: "chest", tuning: "none", ventRatio: 2, press: 0.0, ornament: "none", melody: "", pattern: "none", phrase: 0.0, epilarynx: 0.3, larynx: 0.0 } },
    khoomei: { label: "Khöömei", set: { register: "pressed", tuning: "overtone", press: 0.5, ornament: "none", pattern: "none", epilarynx: 0.6 } },
    sygyt: { label: "Sygyt (whistle)", set: { register: "pressed", tuning: "sygyt", press: 0.6, ornament: "none", pattern: "none", epilarynx: 0.6 } },
    kargyraa: { label: "Kargyraa (vowel walk, self-oscillating folds)", set: { register: "ventricular", tuning: "vowel", ventRatio: 2, press: 0.3, larynx: -0.4, melody: "walk", melodyRate: 1.2, ornament: "none", pattern: "none", larynxModel: "folds" } },
    focus: { label: "Sygyt, two-constriction focus", set: { register: "pressed", tuning: "focus", press: 0.6, ornament: "none", pattern: "none", epilarynx: 0.6 } },
    dzoke: { label: "Dzo-ke (self-oscillating folds)", set: { register: "ventricular", tuning: "none", ventRatio: 2, press: 0.3, larynx: -0.4, ornament: "none", pattern: "none", larynxModel: "folds" } },
    borbangnadyr: { label: "Borbangnadyr (rolling)", set: { register: "pressed", tuning: "overtone", press: 0.5, ornament: "trill", ornRate: 7.0, ornDepth: 1.0, pattern: "none" } },
    ezengileer: { label: "Ezengileer (stirrup)", set: { register: "pressed", tuning: "overtone", press: 0.5, ornament: "gallop", ornRate: 2.2, ornDepth: 0.7, pattern: "none" } },
    chylandyk: { label: "Chylandyk (whistle over growl)", set: { register: "ventricular", tuning: "sygyt", ventRatio: 2, press: 0.5, ornament: "none", pattern: "none", epilarynx: 0.6 } },
    dumchuktaar: { label: "Dumchuktaar (nasal)", set: { register: "pressed", tuning: "nasal", press: 0.5, ornament: "none", pattern: "none" } },
    uruulyn: { label: "Uruulyn (labial)", set: { register: "pressed", tuning: "labial", press: 0.5, ornament: "none", pattern: "none" } },
    bagalzuuryn: { label: "Bagalzuuryn (throat)", set: { register: "pressed", tuning: "throat", press: 0.6, ornament: "none", pattern: "none", epilarynx: 0.8 } },
    bassu: { label: "Bassu (sub-octave, Sardinia)", set: { register: "ventricular", tuning: "none", ventRatio: 2, press: 0.3, larynx: -0.3, ornament: "none", pattern: "none" } },
    contra: { label: "Contra (folds in step, Sardinia)", set: { register: "ventricular", tuning: "none", ventRatio: 1, press: 0.5, ornament: "none", pattern: "none" } },
    twelfth: { label: "Sub-twelfth (1 : 3)", set: { register: "ventricular", tuning: "none", ventRatio: 3, press: 0.3, larynx: -0.3, ornament: "none", pattern: "none" } },
    gyuto: { label: "Gyuto chord", set: { register: "chest", tuning: "gyuto", gyutoH1: 5, gyutoH2: 10, ornament: "none", pattern: "none", larynx: -0.3 } },
    breathgame: { label: "Breath game (in/out)", set: { register: "head", tuning: "none", ornament: "none", pattern: "pair", patternRate: 6.0 } }
};
