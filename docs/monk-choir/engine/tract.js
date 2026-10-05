// Time-domain vocal tract: a lossy Kelly-Lochbaum tube of SECTIONS sections
// with a three-port nasal branch at the velum.
//
// Pressure-wave convention. At the junction between sections of area A1 (left)
// and A2 (right), rho = (A1 - A2) / (A1 + A2) and
//     w = rho * (R_left - L_right);  R_out = R_left + w;  L_out = L_right + w.
// Each section is one tick long. The owner chooses the tick rate as
// SECTIONS * c / length, so a longer tract is a slower tube, not a resampled
// one: tract length changes the resonances physically while the glottal
// source keeps its own fundamental.
//
// The glottis end reflects with a time-varying coefficient supplied per tick
// (an open glottis loses energy to the trachea). The lips and nostrils reflect
// through a one-pole low-pass (high frequencies radiate, low frequencies
// return). The output is the volume velocity leaving the lips plus nostrils.

import { SECTIONS, MAX_NASAL_SECTIONS } from "./anatomy.js";

export const SECTION_LOSS = 0.9993;
export const LIP_REFLECTION = 0.97;
export const NOSE_REFLECTION = 0.95;

export function junctionCoefficient(a1, a2) {
    const sum = a1 + a2;
    if (sum <= 1e-12) {
        return 0.0;
    }
    return (a1 - a2) / sum;
}

// One-pole coefficient p for the lip/nostril reflection low-pass, from the
// opening radius (cm) and the tick rate. The corner frequency falls as the
// opening grows (ka ~ 1 when f ~ c / (2 pi a)).
export function radiationPole(radius, tickRate, speedOfSound) {
    let corner = 0.6 * speedOfSound / (2.0 * Math.PI * Math.max(radius, 0.05));
    if (corner < 1200.0) {
        corner = 1200.0;
    }
    if (corner > 0.45 * tickRate) {
        corner = 0.45 * tickRate;
    }
    return Math.exp(-2.0 * Math.PI * corner / tickRate);
}

export class Tract {
    constructor() {
        const n = SECTIONS;
        this.R = new Float64Array(n);
        this.L = new Float64Array(n);
        this.outR = new Float64Array(n);
        this.outL = new Float64Array(n + 1);
        this.areas = new Float64Array(n);
        this.rho = new Float64Array(n + 1);
        this.rhoStart = new Float64Array(n + 1);
        this.rhoTarget = new Float64Array(n + 1);
        this.nR = new Float64Array(MAX_NASAL_SECTIONS);
        this.nL = new Float64Array(MAX_NASAL_SECTIONS);
        this.nOutR = new Float64Array(MAX_NASAL_SECTIONS);
        this.nOutL = new Float64Array(MAX_NASAL_SECTIONS + 1);
        this.nAreas = new Float64Array(MAX_NASAL_SECTIONS);
        this.nRho = new Float64Array(MAX_NASAL_SECTIONS + 1);
        this.nCount = 24;
        this.velumJ = 20;
        this.velumArea = 0.0;
        this.velumStart = 0.0;
        this.velumTarget = 0.0;
        this.areaLeftOfVelum = 1.0;
        this.areaRightOfVelum = 1.0;
        this.lipArea = 1.0;
        this.lipPole = 0.5;
        this.lipState = 0.0;
        this.nosePole = 0.5;
        this.noseState = 0.0;
        this.loss = SECTION_LOSS;
        this.rampTicks = 0;
        this.rampPos = 0;
        this.nasalEnergy = 0.0;
        this.inputScale = 1.0;
        this.hasShape = false;
    }

    reset() {
        this.R.fill(0.0);
        this.L.fill(0.0);
        this.nR.fill(0.0);
        this.nL.fill(0.0);
        this.lipState = 0.0;
        this.noseState = 0.0;
        this.nasalEnergy = 0.0;
    }

    // Install a new shape. Junction coefficients and the velum port move
    // linearly to the new values over rampTicks ticks.
    setShape(areas, nasalCount, nasalAreas, velumJ, velumArea, lipPole, nosePole, rampTicks) {
        const n = SECTIONS;
        for (let i = 0; i < n; i = i + 1) {
            this.areas[i] = areas[i];
        }
        for (let i = 1; i < n; i = i + 1) {
            this.rhoTarget[i] = junctionCoefficient(areas[i - 1], areas[i]);
        }
        this.nCount = nasalCount;
        for (let i = 0; i < nasalCount; i = i + 1) {
            this.nAreas[i] = nasalAreas[i];
        }
        for (let i = 1; i < nasalCount; i = i + 1) {
            this.nRho[i] = junctionCoefficient(nasalAreas[i - 1], nasalAreas[i]);
        }
        this.velumJ = velumJ;
        this.areaLeftOfVelum = areas[velumJ - 1];
        this.areaRightOfVelum = areas[velumJ];
        this.lipArea = areas[n - 1];
        this.lipPole = lipPole;
        this.nosePole = nosePole;
        this.inputScale = 1.0 / Math.max(areas[0], 0.05);
        if (!this.hasShape || rampTicks <= 0) {
            for (let i = 1; i < n; i = i + 1) {
                this.rho[i] = this.rhoTarget[i];
                this.rhoStart[i] = this.rhoTarget[i];
            }
            this.velumArea = velumArea;
            this.velumStart = velumArea;
            this.velumTarget = velumArea;
            this.rampTicks = 0;
            this.rampPos = 0;
            this.hasShape = true;
            return;
        }
        for (let i = 1; i < n; i = i + 1) {
            this.rhoStart[i] = this.rho[i];
        }
        this.velumStart = this.velumArea;
        this.velumTarget = velumArea;
        this.rampTicks = rampTicks;
        this.rampPos = 0;
    }

    advanceRamp() {
        this.rampPos = this.rampPos + 1;
        const t = this.rampPos / this.rampTicks;
        const n = SECTIONS;
        for (let i = 1; i < n; i = i + 1) {
            this.rho[i] = this.rhoStart[i] + (this.rhoTarget[i] - this.rhoStart[i]) * t;
        }
        this.velumArea = this.velumStart + (this.velumTarget - this.velumStart) * t;
        if (this.rampPos >= this.rampTicks) {
            this.rampTicks = 0;
        }
    }

    // One tick. glottalFlow is the volume velocity entering at the glottis;
    // glottalReflection the instantaneous glottal-end reflection. Returns the
    // volume velocity radiated at lips plus nostrils.
    tick(glottalFlow, glottalReflection) {
        if (this.rampTicks > 0) {
            this.advanceRamp();
        }
        const n = SECTIONS;
        const R = this.R;
        const L = this.L;
        const outR = this.outR;
        const outL = this.outL;
        const rho = this.rho;
        const loss = this.loss;
        const vj = this.velumJ;

        outR[0] = glottalReflection * L[0] + glottalFlow * this.inputScale;

        const endWave = R[n - 1];
        this.lipState = (1.0 - this.lipPole) * endWave + this.lipPole * this.lipState;
        const lipReflected = -LIP_REFLECTION * this.lipState;
        outL[n] = lipReflected;
        let radiated = this.lipArea * (endWave - lipReflected);

        for (let i = 1; i < n; i = i + 1) {
            if (i === vj) {
                continue;
            }
            const w = rho[i] * (R[i - 1] - L[i]);
            outR[i] = R[i - 1] + w;
            outL[i] = L[i] + w;
        }

        const useNose = this.velumArea > 1e-4 || this.nasalEnergy > 1e-10;
        const aL = this.areaLeftOfVelum;
        const aR = this.areaRightOfVelum;
        if (useNose) {
            const nR = this.nR;
            const nL = this.nL;
            const nOutR = this.nOutR;
            const nOutL = this.nOutL;
            const nRho = this.nRho;
            const nc = this.nCount;
            const aN = this.velumArea;
            const pJ = 2.0 * (aL * R[vj - 1] + aR * L[vj] + aN * nL[0]) / (aL + aR + aN);
            outR[vj] = pJ - L[vj];
            outL[vj] = pJ - R[vj - 1];
            nOutR[0] = pJ - nL[0];
            // The first nasal section is the velopharyngeal port itself.
            const port = junctionCoefficient(Math.max(aN, 1e-4), this.nAreas[1]);
            for (let k = 1; k < nc; k = k + 1) {
                let r = nRho[k];
                if (k === 1) {
                    r = port;
                }
                const w = r * (nR[k - 1] - nL[k]);
                nOutR[k] = nR[k - 1] + w;
                nOutL[k] = nL[k] + w;
            }
            const noseEnd = nR[nc - 1];
            this.noseState = (1.0 - this.nosePole) * noseEnd + this.nosePole * this.noseState;
            const noseReflected = -NOSE_REFLECTION * this.noseState;
            nOutL[nc] = noseReflected;
            radiated = radiated + this.nAreas[nc - 1] * (noseEnd - noseReflected);
            let energy = 0.0;
            for (let k = 0; k < nc; k = k + 1) {
                nR[k] = nOutR[k] * loss;
                nL[k] = nOutL[k + 1] * loss;
                energy = energy + nR[k] * nR[k] + nL[k] * nL[k];
            }
            this.nasalEnergy = energy;
        } else {
            const w = rho[vj] * (R[vj - 1] - L[vj]);
            outR[vj] = R[vj - 1] + w;
            outL[vj] = L[vj] + w;
        }

        for (let i = 0; i < n; i = i + 1) {
            R[i] = outR[i] * loss;
            L[i] = outL[i + 1] * loss;
        }
        return radiated;
    }
}
