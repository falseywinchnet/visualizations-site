// Exact frequency response of the whole branched tube in tract.js: pharynx,
// mouth and nose joined at the velum, heard at the lips plus the nostrils.
//
// analysis.js solves the oral tube alone (velum closed). With the velum open
// the tube is three tubes meeting at one junction, where tract.js computes the
// common pressure
//     pJ = 2 (aL x + aR y + aN v) / (aL + aR + aN)
// from the waves arriving from the pharynx (x), the mouth (y) and the nose (v),
// and sends pJ minus each arriving wave back down that tube.
//
// Each tube beyond the junction is reduced to two numbers per frequency:
//   reflectance  Gamma = (wave arriving back at the junction) / (wave sent in)
//   transfer     T     = (volume velocity radiated at its far end) / (wave sent in)
// using the same chain product as analysis.js with its input at the junction.
// Then y = Gamma_R oR, v = Gamma_N oN with oR = pJ - y, oN = pJ - v, so
//     pJ = K x,   K = 2 aL / (S - 2 aR Gamma_R/(1+Gamma_R) - 2 aN Gamma_N/(1+Gamma_N))
// and the pharynx sees the junction as a termination with reflectance K - 1.
// The pharynx with the glottis is then solved exactly as in analysis.js, and
//     U = T_R pJ/(1+Gamma_R) + T_N pJ/(1+Gamma_N).
// .dev/test_throat.mjs checks this against the time-domain tube's impulse
// response with the velum open.

import { SECTIONS } from "./anatomy.js?v=9500908dbe";
import { SECTION_LOSS, LIP_REFLECTION, NOSE_REFLECTION, junctionCoefficient, portLoss } from "./tract.js?v=dcd3b7ef73";

const MAX_BRANCH = 96;

function clampRho(r) {
    if (r > 0.9995) {
        return 0.9995;
    }
    if (r < -0.9995) {
        return -0.9995;
    }
    return r;
}

// Prepared geometry of one branched tube (owned by the caller, reused).
export function makeBranchShape() {
    return {
        pharynxRho: new Float64Array(MAX_BRANCH),  // junctions inside the pharynx
        pharynxCount: 0,                           // number of pharynx sections
        mouthRho: new Float64Array(MAX_BRANCH),
        mouthCount: 0,
        noseRho: new Float64Array(MAX_BRANCH),
        noseCount: 0,
        aL: 1.0, aR: 1.0, aN: 0.0,
        lipArea: 1.0, lipPole: 0.5,
        noseArea: 1.0, nosePole: 0.5,
        glottalReflection: 0.95,
        portMu: SECTION_LOSS                       // the port's own loss (tract.js portLoss)
    };
}

// Fill a branch shape from the same quantities tract.setShape receives.
export function prepareBranch(shape, areas, nasalCount, nasalAreas, velumJ, velumArea, lipPole, nosePole, glottalReflection) {
    shape.pharynxCount = velumJ;
    for (let i = 1; i < velumJ; i = i + 1) {
        shape.pharynxRho[i] = clampRho(junctionCoefficient(areas[i - 1], areas[i]));
    }
    shape.mouthCount = SECTIONS - velumJ;
    for (let i = 1; i < shape.mouthCount; i = i + 1) {
        shape.mouthRho[i] = clampRho(junctionCoefficient(areas[velumJ + i - 1], areas[velumJ + i]));
    }
    shape.noseCount = nasalCount;
    // The first nasal section is the velopharyngeal port itself.
    shape.noseRho[1] = clampRho(junctionCoefficient(velumArea, nasalAreas[1]));
    for (let k = 2; k < nasalCount; k = k + 1) {
        shape.noseRho[k] = clampRho(junctionCoefficient(nasalAreas[k - 1], nasalAreas[k]));
    }
    shape.aL = areas[velumJ - 1];
    shape.aR = areas[velumJ];
    shape.aN = velumArea;
    shape.portMu = SECTION_LOSS * portLoss(velumArea);
    shape.lipArea = areas[SECTIONS - 1];
    shape.lipPole = lipPole;
    shape.noseArea = nasalAreas[nasalCount - 1];
    shape.nosePole = nosePole;
    shape.glottalReflection = glottalReflection;
    return shape;
}

// Chain product P = M_{count-1} ... M_1 for one tube at frequency w.
const P = { r11: 0, i11: 0, r12: 0, i12: 0, r21: 0, i21: 0, r22: 0, i22: 0 };

// firstMu: the loss of section 0 (its left-going wave is written with it).
function chain(w, rho, count, firstMu) {
    const mu = SECTION_LOSS;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let p11r = 1.0, p11i = 0.0, p12r = 0.0, p12i = 0.0;
    let p21r = 0.0, p21i = 0.0, p22r = 1.0, p22i = 0.0;
    const m11r = mu * cw;
    const m11i = -mu * sw;
    for (let i = 1; i < count; i = i + 1) {
        const r = rho[i];
        const g = 1.0 / (1.0 - r);
        // Section 0 may have its own loss mu_0 (the nose's port). With
        // z R_1 = mu (R_0 + w) and z L_0 = mu_0 (L_1 + w), M_1 becomes
        //   R_1 = (mu/z R_0 - rho (mu/mu_0) L_0) / (1 - rho)
        //   L_1 = (-rho R_0 + z/mu_0 L_0) / (1 - rho)
        let m22r = cw / mu;
        let m22i = sw / mu;
        let rr = r;
        if (i === 1) {
            m22r = cw / firstMu;
            m22i = sw / firstMu;
            rr = r * mu / firstMu;
        }
        const n11r = (m11r * p11r - m11i * p11i - rr * p21r) * g;
        const n11i = (m11r * p11i + m11i * p11r - rr * p21i) * g;
        const n12r = (m11r * p12r - m11i * p12i - rr * p22r) * g;
        const n12i = (m11r * p12i + m11i * p12r - rr * p22i) * g;
        const n21r = (-r * p11r + m22r * p21r - m22i * p21i) * g;
        const n21i = (-r * p11i + m22r * p21i + m22i * p21r) * g;
        const n22r = (-r * p12r + m22r * p22r - m22i * p22i) * g;
        const n22i = (-r * p12i + m22r * p22i + m22i * p22r) * g;
        p11r = n11r; p11i = n11i; p12r = n12r; p12i = n12i;
        p21r = n21r; p21i = n21i; p22r = n22r; p22i = n22i;
    }
    P.r11 = p11r; P.i11 = p11i; P.r12 = p12r; P.i12 = p12i;
    P.r21 = p21r; P.i21 = p21i; P.r22 = p22r; P.i22 = p22i;
}

// End reflection r(z) = -refl (1-p) / (1 - p/z), written into E.
const E = { re: 0.0, im: 0.0 };

function endReflection(w, pole, refl) {
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const dr = 1.0 - pole * cw;
    const di = pole * sw;
    const dd = dr * dr + di * di;
    const k = -refl * (1.0 - pole);
    E.re = k * dr / dd;
    E.im = -k * di / dd;
}

// A tube driven at its start by the wave o sent in from the junction, ending
// in a radiating opening. Writes Gamma and T into OUT.
const OUT = { gr: 0.0, gi: 0.0, tr: 0.0, ti: 0.0 };

function terminatedTube(w, rho, count, endArea, pole, refl, firstMu) {
    const mu = SECTION_LOSS;
    chain(w, rho, count, firstMu);
    endReflection(w, pole, refl);
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const qr = mu * E.re;
    const qi = mu * E.im;
    // a = z P21 - q P11 ; b = z P22 - q P12 ; a R0 + b L0 = 0
    const ar = (cw * P.r21 - sw * P.i21) - (qr * P.r11 - qi * P.i11);
    const ai = (cw * P.i21 + sw * P.r21) - (qr * P.i11 + qi * P.r11);
    const br = (cw * P.r22 - sw * P.i22) - (qr * P.r12 - qi * P.i12);
    const bi = (cw * P.i22 + sw * P.r22) - (qr * P.i12 + qi * P.r12);
    // ratio L0/R0 = -a/b
    const bb = br * br + bi * bi;
    const lr = -(ar * br + ai * bi) / bb;
    const li = -(ai * br - ar * bi) / bb;
    // R0 = mu_0 o / z (section 0's own loss)
    const r0r = firstMu * cw;
    const r0i = -firstMu * sw;
    // Gamma = L0 / o = (L0/R0) (mu/z)
    OUT.gr = lr * r0r - li * r0i;
    OUT.gi = lr * r0i + li * r0r;
    // R_end / R0 = P11 + P12 (L0/R0)
    const er = P.r11 + (P.r12 * lr - P.i12 * li);
    const ei = P.i11 + (P.r12 * li + P.i12 * lr);
    // T = A (1 - r) (R_end/R0) (mu/z)
    const fr = endArea * (1.0 - E.re);
    const fi = endArea * (-E.im);
    const xr = fr * er - fi * ei;
    const xi = fr * ei + fi * er;
    OUT.tr = xr * r0r - xi * r0i;
    OUT.ti = xr * r0i + xi * r0r;
}

const RESULT = { re: 0.0, im: 0.0 };

// Complex volume velocity radiated at lips plus nostrils per unit glottal
// input wave, at normalized angular frequency w (radians per tick).
export function branchResponseAt(shape, w) {
    const mu = SECTION_LOSS;
    terminatedTube(w, shape.mouthRho, shape.mouthCount, shape.lipArea, shape.lipPole, LIP_REFLECTION, mu);
    const gRr = OUT.gr, gRi = OUT.gi, tRr = OUT.tr, tRi = OUT.ti;
    let gNr = 0.0, gNi = 0.0, tNr = 0.0, tNi = 0.0;
    if (shape.aN > 0.0) {
        terminatedTube(w, shape.noseRho, shape.noseCount, shape.noseArea, shape.nosePole, NOSE_REFLECTION, shape.portMu);
        gNr = OUT.gr; gNi = OUT.gi; tNr = OUT.tr; tNi = OUT.ti;
    }
    // c = Gamma / (1 + Gamma) for each branch
    const dRr = 1.0 + gRr;
    const dRi = gRi;
    const dR = dRr * dRr + dRi * dRi;
    const cRr = (gRr * dRr + gRi * dRi) / dR;
    const cRi = (gRi * dRr - gRr * dRi) / dR;
    const dNr = 1.0 + gNr;
    const dNi = gNi;
    const dN = dNr * dNr + dNi * dNi;
    const cNr = (gNr * dNr + gNi * dNi) / dN;
    const cNi = (gNi * dNr - gNr * dNi) / dN;
    const S = shape.aL + shape.aR + shape.aN;
    const denR = S - 2.0 * shape.aR * cRr - 2.0 * shape.aN * cNr;
    const denI = -2.0 * shape.aR * cRi - 2.0 * shape.aN * cNi;
    const den = denR * denR + denI * denI;
    const kr = 2.0 * shape.aL * denR / den;
    const ki = -2.0 * shape.aL * denI / den;
    // pharynx terminated by reflectance K - 1, driven at the glottis
    chain(w, shape.pharynxRho, shape.pharynxCount, mu);
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const qr = mu * (kr - 1.0);
    const qi = mu * ki;
    const ar = (cw * P.r21 - sw * P.i21) - (qr * P.r11 - qi * P.i11);
    const ai = (cw * P.i21 + sw * P.r21) - (qr * P.i11 + qi * P.r11);
    const br = (cw * P.r22 - sw * P.i22) - (qr * P.r12 - qi * P.i12);
    const bi = (cw * P.i22 + sw * P.r22) - (qr * P.i12 + qi * P.r12);
    const rg = shape.glottalReflection;
    const er = (cw * br - sw * bi) + mu * rg * ar;
    const ei = (cw * bi + sw * br) + mu * rg * ai;
    const ee = er * er + ei * ei;
    const r0r = mu * (br * er + bi * ei) / ee;
    const r0i = mu * (bi * er - br * ei) / ee;
    const bb = br * br + bi * bi;
    const tr = ar * r0r - ai * r0i;
    const ti = ar * r0i + ai * r0r;
    const l0r = -(tr * br + ti * bi) / bb;
    const l0i = -(ti * br - tr * bi) / bb;
    // x = wave arriving at the junction from the pharynx
    const xr = P.r11 * r0r - P.i11 * r0i + P.r12 * l0r - P.i12 * l0i;
    const xi = P.r11 * r0i + P.i11 * r0r + P.r12 * l0i + P.i12 * l0r;
    const pr = kr * xr - ki * xi;
    const pi = kr * xi + ki * xr;
    // oR = pJ / (1 + Gamma_R), oN = pJ / (1 + Gamma_N)
    const oRr = (pr * dRr + pi * dRi) / dR;
    const oRi = (pi * dRr - pr * dRi) / dR;
    let ur = tRr * oRr - tRi * oRi;
    let ui = tRr * oRi + tRi * oRr;
    if (shape.aN > 0.0) {
        const oNr = (pr * dNr + pi * dNi) / dN;
        const oNi = (pi * dNr - pr * dNi) / dN;
        ur = ur + tNr * oNr - tNi * oNi;
        ui = ui + tNr * oNi + tNi * oNr;
    }
    RESULT.re = ur;
    RESULT.im = ui;
    return RESULT;
}

export function branchMagnitudeDb(shape, freqHz, tickRate) {
    const r = branchResponseAt(shape, 2.0 * Math.PI * freqHz / tickRate);
    return 10.0 * Math.log10(r.re * r.re + r.im * r.im + 1e-30);
}
