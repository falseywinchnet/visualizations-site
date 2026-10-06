// Exact frequency response of the oral waveguide in tract.js.
//
// The per-tick recurrence of tract.js (velum closed, constant glottal
// reflection) is linear and time-invariant. In the z-domain (z per tick) the
// pair of waves (R_i, L_i) in section i follows from section i-1 by
//
//     [R_i]      1     [ mu/z   -rho_i ] [R_{i-1}]
//     [L_i] = ------- [ -rho_i   z/mu  ] [L_{i-1}]
//             1-rho_i
//
// with the boundary conditions
//     z R_0     = mu (r_g L_0 + G)                      (glottis)
//     z L_{N-1} = mu r_L(z) R_{N-1},  r_L = -rho_L (1-p)/(1 - p z^-1)  (lips)
// and the radiated volume velocity U = A_{N-1} (1 - r_L(z)) R_{N-1}.
// Solving the two boundary equations through the chain product gives H = U/G
// at any frequency with no time stepping. Resonances are then read off |H|.
// tests/ checks this against the impulse response of the time-domain tract.

import { SECTIONS } from "./anatomy.js?v=9500908dbe";
import { SECTION_LOSS, LIP_REFLECTION, junctionCoefficient } from "./tract.js?v=44afeabdc1";

// Scratch, reused by every call (single-threaded use).
const RHO = new Float64Array(SECTIONS + 1);
const RESULT = { re: 0.0, im: 0.0 };

export function prepareJunctions(areas) {
    for (let i = 1; i < SECTIONS; i = i + 1) {
        let r = junctionCoefficient(areas[i - 1], areas[i]);
        if (r > 0.9995) {
            r = 0.9995;
        }
        RHO[i] = r;
    }
}

// Complex response at normalized angular frequency w (radians per tick).
// Requires prepareJunctions(areas) for the same areas. Writes RESULT.
export function responseAt(w, areas, glottalReflection, lipPole) {
    const mu = SECTION_LOSS;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    // z = cw + j sw ; 1/z = cw - j sw
    // P = identity, accumulated as P <- M_i P for i = 1..N-1
    let p11r = 1.0, p11i = 0.0, p12r = 0.0, p12i = 0.0;
    let p21r = 0.0, p21i = 0.0, p22r = 1.0, p22i = 0.0;
    const m11r = mu * cw;
    const m11i = -mu * sw;
    const m22r = cw / mu;
    const m22i = sw / mu;
    for (let i = 1; i < SECTIONS; i = i + 1) {
        const rho = RHO[i];
        const g = 1.0 / (1.0 - rho);
        // row 1: (m11 * p1j - rho * p2j) * g
        const n11r = (m11r * p11r - m11i * p11i - rho * p21r) * g;
        const n11i = (m11r * p11i + m11i * p11r - rho * p21i) * g;
        const n12r = (m11r * p12r - m11i * p12i - rho * p22r) * g;
        const n12i = (m11r * p12i + m11i * p12r - rho * p22i) * g;
        // row 2: (-rho * p1j + m22 * p2j) * g
        const n21r = (-rho * p11r + m22r * p21r - m22i * p21i) * g;
        const n21i = (-rho * p11i + m22r * p21i + m22i * p21r) * g;
        const n22r = (-rho * p12r + m22r * p22r - m22i * p22i) * g;
        const n22i = (-rho * p12i + m22r * p22i + m22i * p22r) * g;
        p11r = n11r; p11i = n11i; p12r = n12r; p12i = n12i;
        p21r = n21r; p21i = n21i; p22r = n22r; p22i = n22i;
    }
    // r_L(z) = -rhoL (1-p) / (1 - p/z)
    const dr = 1.0 - lipPole * cw;
    const di = lipPole * sw; // 1 - p (cw - j sw) = (1 - p cw) + j p sw
    const dd = dr * dr + di * di;
    const k = -LIP_REFLECTION * (1.0 - lipPole);
    const rLr = k * dr / dd;
    const rLi = -k * di / dd;
    // mu r_L
    const qr = mu * rLr;
    const qi = mu * rLi;
    // a = z P21 - q P11 ; b = z P22 - q P12
    const ar = (cw * p21r - sw * p21i) - (qr * p11r - qi * p11i);
    const ai = (cw * p21i + sw * p21r) - (qr * p11i + qi * p11r);
    const br = (cw * p22r - sw * p22i) - (qr * p12r - qi * p12i);
    const bi = (cw * p22i + sw * p22r) - (qr * p12i + qi * p12r);
    // R0 = mu b / (z b + mu r_g a)
    const er = (cw * br - sw * bi) + mu * glottalReflection * ar;
    const ei = (cw * bi + sw * br) + mu * glottalReflection * ai;
    const ee = er * er + ei * ei;
    const r0r = mu * (br * er + bi * ei) / ee;
    const r0i = mu * (bi * er - br * ei) / ee;
    // L0 = -a R0 / b
    const bb = br * br + bi * bi;
    const tr = ar * r0r - ai * r0i;
    const ti = ar * r0i + ai * r0r;
    const l0r = -(tr * br + ti * bi) / bb;
    const l0i = -(ti * br - tr * bi) / bb;
    // R_{N-1} = P11 R0 + P12 L0
    const rnr = p11r * r0r - p11i * r0i + p12r * l0r - p12i * l0i;
    const rni = p11r * r0i + p11i * r0r + p12r * l0i + p12i * l0r;
    // U = A (1 - r_L) R_{N-1}
    const area = areas[SECTIONS - 1];
    const fr = 1.0 - rLr;
    const fi = -rLi;
    RESULT.re = area * (fr * rnr - fi * rni);
    RESULT.im = area * (fr * rni + fi * rnr);
    return RESULT;
}

export function magnitudeDb(freqHz, tickRate, areas, glottalReflection, lipPole) {
    const r = responseAt(2.0 * Math.PI * freqHz / tickRate, areas, glottalReflection, lipPole);
    return 10.0 * Math.log10(r.re * r.re + r.im * r.im + 1e-30);
}

// Sample |H| (dB) on a uniform grid from 0 to maxHz.
export function responseCurve(areas, tickRate, glottalReflection, lipPole, maxHz, points, outDb) {
    prepareJunctions(areas);
    for (let i = 0; i < points; i = i + 1) {
        const f = maxHz * i / (points - 1);
        outDb[i] = magnitudeDb(f, tickRate, areas, glottalReflection, lipPole);
    }
    return outDb;
}

// Refine a resonance peak near freqHz by successive parabolic fits in dB.
// Requires prepareJunctions(areas). Returns the refined frequency.
export function refinePeak(freqHz, stepHz, tickRate, areas, glottalReflection, lipPole) {
    let f = freqHz;
    let step = stepHz;
    for (let iter = 0; iter < 6; iter = iter + 1) {
        const a = magnitudeDb(f - step, tickRate, areas, glottalReflection, lipPole);
        const b = magnitudeDb(f, tickRate, areas, glottalReflection, lipPole);
        const c = magnitudeDb(f + step, tickRate, areas, glottalReflection, lipPole);
        const denom = a - 2.0 * b + c;
        let shift = 0.0;
        if (denom < 0.0) {
            shift = 0.5 * (a - c) / denom;
            if (shift > 1.0) {
                shift = 1.0;
            }
            if (shift < -1.0) {
                shift = -1.0;
            }
        } else if (c > a) {
            shift = 1.0;
        } else {
            shift = -1.0;
        }
        f = f + shift * step;
        step = step * 0.45;
    }
    return f;
}

// Resonances below maxHz: frequency, -3 dB bandwidth and level.
// Writes up to `count` entries into out (array of {f, bw, db}); returns found.
export function findFormants(areas, tickRate, glottalReflection, lipPole, maxHz, count, out) {
    prepareJunctions(areas);
    const step = 20.0;
    let prev2 = magnitudeDb(step * 0.5, tickRate, areas, glottalReflection, lipPole);
    let prev1 = magnitudeDb(step * 1.5, tickRate, areas, glottalReflection, lipPole);
    let found = 0;
    let f = step * 2.5;
    while (f < maxHz && found < count) {
        const cur = magnitudeDb(f, tickRate, areas, glottalReflection, lipPole);
        if (prev1 > prev2 && prev1 >= cur) {
            const peak = refinePeak(f - step, step * 0.5, tickRate, areas, glottalReflection, lipPole);
            const peakDb = magnitudeDb(peak, tickRate, areas, glottalReflection, lipPole);
            const bw = halfPowerBandwidth(peak, peakDb, tickRate, areas, glottalReflection, lipPole);
            out[found].f = peak;
            out[found].bw = bw;
            out[found].db = peakDb;
            found = found + 1;
        }
        prev2 = prev1;
        prev1 = cur;
        f = f + step;
    }
    return found;
}

function halfPowerBandwidth(peak, peakDb, tickRate, areas, glottalReflection, lipPole) {
    const target = peakDb - 3.0103;
    let lo = peak;
    let hi = peak;
    let step = 2.0;
    // Walk out to bracket, then bisect each side.
    let loOut = peak - step;
    while (loOut > 1.0 && magnitudeDb(loOut, tickRate, areas, glottalReflection, lipPole) > target && peak - loOut < 1500.0) {
        step = step * 1.6;
        loOut = peak - step;
    }
    lo = bisectCrossing(loOut, peak, target, tickRate, areas, glottalReflection, lipPole);
    step = 2.0;
    let hiOut = peak + step;
    while (magnitudeDb(hiOut, tickRate, areas, glottalReflection, lipPole) > target && hiOut - peak < 1500.0) {
        step = step * 1.6;
        hiOut = peak + step;
    }
    hi = bisectCrossing(hiOut, peak, target, tickRate, areas, glottalReflection, lipPole);
    return hi - lo;
}

// a is below target (outside), b above (peak). Returns the crossing.
function bisectCrossing(a, b, target, tickRate, areas, glottalReflection, lipPole) {
    let outside = a;
    let inside = b;
    for (let i = 0; i < 24; i = i + 1) {
        const m = 0.5 * (outside + inside);
        if (magnitudeDb(m, tickRate, areas, glottalReflection, lipPole) > target) {
            inside = m;
        } else {
            outside = m;
        }
    }
    return 0.5 * (outside + inside);
}

// Coarse scan for resonance peaks between minHz and maxHz. Writes peak
// frequencies (refined) into out, returns how many were found.
export function scanPeaks(areas, tickRate, glottalReflection, lipPole, minHz, maxHz, stepHz, out, maxCount) {
    prepareJunctions(areas);
    let prev2 = magnitudeDb(minHz - stepHz, tickRate, areas, glottalReflection, lipPole);
    let prev1 = magnitudeDb(minHz, tickRate, areas, glottalReflection, lipPole);
    let found = 0;
    let f = minHz + stepHz;
    while (f <= maxHz + stepHz && found < maxCount) {
        const cur = magnitudeDb(f, tickRate, areas, glottalReflection, lipPole);
        if (prev1 > prev2 && prev1 >= cur) {
            out[found] = refinePeak(f - stepHz, stepHz * 0.5, tickRate, areas, glottalReflection, lipPole);
            found = found + 1;
        }
        prev2 = prev1;
        prev1 = cur;
        f = f + stepHz;
    }
    return found;
}

export function makeFormantSlots(count) {
    const out = [];
    for (let i = 0; i < count; i = i + 1) {
        out.push({ f: 0.0, bw: 0.0, db: 0.0 });
    }
    return out;
}
