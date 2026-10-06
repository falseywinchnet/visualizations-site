// Time-domain vocal tract: a lossy Kelly-Lochbaum tube of SECTIONS sections
// with a three-port nasal branch at the velum.
//
// Waves are stored power-normalised: a section's waves are its pressure
// waves times the square root of its area, so their squares are its acoustic
// power. At the junction between sections of area A1 (left) and A2 (right),
// rho = (A1 - A2) / (A1 + A2), c = sqrt(1 - rho^2) and
//     R_out = c R_left - rho L_right;   L_out = rho R_left + c L_right,
// a rotation. For a fixed shape this is the pressure-wave Kelly-Lochbaum
// tube exactly (the same transfer function, so analysis.js and branch.js
// still describe it). While the shape moves it conserves energy: with pressure
// waves, a nearly closed section held large pressures carrying almost no
// power, and when it widened the same pressures suddenly carried far more,
// so moving a narrow constriction (the sygyt focus gesture) pumped energy in
// (harmonic leaps peaked at 2.7 against a steady whistle's 0.08).
// Each section is one tick long. The owner chooses the tick rate as
// SECTIONS * c / length, so a longer tract is a slower tube, not a resampled
// one: tract length changes the resonances physically while the glottal
// source keeps its own fundamental.
//
// The glottis end reflects with a time-varying coefficient supplied per tick
// (an open glottis loses energy to the trachea). The lips and nostrils reflect
// through a one-pole low-pass (high frequencies radiate, low frequencies
// return). The output is the volume velocity leaving the lips plus nostrils.

import { SECTIONS, MAX_NASAL_SECTIONS } from "./anatomy.js?v=9500908dbe";

export const SECTION_LOSS = 0.9993;
export const LIP_REFLECTION = 0.97;
export const NOSE_REFLECTION = 0.95;

// Extra loss in the velopharyngeal port (the nose's first section), from
// its radius: the boundary layer of a narrow duct takes a share of the wave
// that grows as 1/r. About 0.5 dB per pass with the velum open for a nasal
// vowel; total absorption when the port is shut. Without it the port is a
// one-section tube with an open end on each side (both reflections -1): its
// waves integrated the junction pressure with almost no loss, grew about a
// thousandfold while the port closed, and kept feeding the junction through
// its tiny area, which clicked.
export function portLoss(velumArea) {
    const r = Math.sqrt(Math.max(velumArea, 0.0) / Math.PI);
    if (r <= 0.02) {
        return 0.0;
    }
    return 1.0 - 0.02 / r;
}

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
        this.cc = new Float64Array(n + 1);        // sqrt(1 - rho^2), ramped with rho
        this.ccStart = new Float64Array(n + 1);
        this.ccTarget = new Float64Array(n + 1);
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
        this.leftStart = 1.0;
        this.leftTarget = 1.0;
        this.rightStart = 1.0;
        this.rightTarget = 1.0;
        this.lipArea = 1.0;
        this.lipAreaStart = 1.0;
        this.lipAreaTarget = 1.0;
        this.inputScaleStart = 1.0;
        this.inputScaleTarget = 1.0;
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
        // Optional pressure source between sections injIndex-1 and injIndex
        // (a dipole: half into each travelling direction), set per tick.
        this.injIndex = -1;
        this.injValue = 0.0;
    }

    // Acoustic pressure at the glottal end of the tube.
    glottalPressure() {
        return (this.R[0] + this.L[0]) * Math.sqrt(this.inputScale);
    }

    pressureAt(i) {
        return (this.R[i] + this.L[i]) / Math.sqrt(Math.max(this.areas[i], 1e-9));
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
            const r = junctionCoefficient(areas[i - 1], areas[i]);
            this.rhoTarget[i] = r;
            this.ccTarget[i] = Math.sqrt(Math.max(0.0, 1.0 - r * r));
        }
        // The nose's section count and the velum's junction follow the
        // tract's section length, which moves with every vowel and larynx
        // gesture. Moving either while the nose sounds clicks (measured: up
        // to 47x the local sample-to-sample level), so while the port is open
        // or the nose still rings they keep their values; the nose is then a
        // few percent long or short until it falls silent.
        const noseSounding = velumArea > 0.0 || this.velumArea > 0.0 || this.nasalEnergy > 1e-6;
        if (!noseSounding || !this.hasShape) {
            this.nCount = nasalCount;
            this.velumJ = velumJ;
            for (let i = 0; i < nasalCount; i = i + 1) {
                this.nAreas[i] = nasalAreas[i];
            }
            for (let i = 1; i < nasalCount; i = i + 1) {
                this.nRho[i] = junctionCoefficient(nasalAreas[i - 1], nasalAreas[i]);
            }
        }
        velumJ = this.velumJ;
        // the nose's junction moves with the shape like every other one
        this.leftTarget = areas[velumJ - 1];
        this.rightTarget = areas[velumJ];
        // The lip opening and the glottal input area move with the junctions:
        // the air in the tube carries a steady flow, so switching either one
        // instantly steps the radiated flow and clicks.
        this.lipAreaTarget = areas[n - 1];
        this.inputScaleTarget = 1.0 / Math.max(areas[0], 0.05);
        this.lipPole = lipPole;
        this.nosePole = nosePole;
        if (!this.hasShape || rampTicks <= 0) {
            this.lipArea = this.lipAreaTarget;
            this.lipAreaStart = this.lipAreaTarget;
            this.areaLeftOfVelum = this.leftTarget;
            this.leftStart = this.leftTarget;
            this.areaRightOfVelum = this.rightTarget;
            this.rightStart = this.rightTarget;
            this.inputScale = this.inputScaleTarget;
            this.inputScaleStart = this.inputScaleTarget;
            for (let i = 1; i < n; i = i + 1) {
                this.rho[i] = this.rhoTarget[i];
                this.rhoStart[i] = this.rhoTarget[i];
                this.cc[i] = this.ccTarget[i];
                this.ccStart[i] = this.ccTarget[i];
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
            this.ccStart[i] = this.cc[i];
        }
        this.velumStart = this.velumArea;
        this.velumTarget = velumArea;
        this.lipAreaStart = this.lipArea;
        this.inputScaleStart = this.inputScale;
        this.leftStart = this.areaLeftOfVelum;
        this.rightStart = this.areaRightOfVelum;
        this.rampTicks = rampTicks;
        this.rampPos = 0;
    }

    advanceRamp() {
        this.rampPos = this.rampPos + 1;
        const t = this.rampPos / this.rampTicks;
        const n = SECTIONS;
        for (let i = 1; i < n; i = i + 1) {
            this.rho[i] = this.rhoStart[i] + (this.rhoTarget[i] - this.rhoStart[i]) * t;
            this.cc[i] = this.ccStart[i] + (this.ccTarget[i] - this.ccStart[i]) * t;
        }
        this.velumArea = this.velumStart + (this.velumTarget - this.velumStart) * t;
        this.lipArea = this.lipAreaStart + (this.lipAreaTarget - this.lipAreaStart) * t;
        this.areaLeftOfVelum = this.leftStart + (this.leftTarget - this.leftStart) * t;
        this.areaRightOfVelum = this.rightStart + (this.rightTarget - this.rightStart) * t;
        this.inputScale = this.inputScaleStart + (this.inputScaleTarget - this.inputScaleStart) * t;
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
        const cc = this.cc;
        const loss = this.loss;
        const vj = this.velumJ;

        // glottal end: the input flow as a pressure wave (flow / area),
        // normalised by the first section's area
        outR[0] = glottalReflection * L[0] + glottalFlow * Math.sqrt(this.inputScale);

        // lips: back to pressure, reflect through the radiation low-pass
        const sLip = Math.sqrt(Math.max(this.lipArea, 1e-9));
        const endWave = R[n - 1] / sLip;
        this.lipState = (1.0 - this.lipPole) * endWave + this.lipPole * this.lipState;
        const lipReflected = -LIP_REFLECTION * this.lipState;
        outL[n] = lipReflected * sLip;
        let radiated = this.lipArea * (endWave - lipReflected);

        for (let i = 1; i < n; i = i + 1) {
            if (i === vj) {
                continue;
            }
            const k = rho[i];
            const c = cc[i];
            outR[i] = c * R[i - 1] - k * L[i];
            outL[i] = k * R[i - 1] + c * L[i];
        }

        // The velopharyngeal port is the nose's first section. Shut (area
        // exactly 0) it reflects completely, so the nose rings out on its own
        // and the throat no longer drives it. (Its area used to be clamped at
        // 1e-4 cm^2: the throat then drove the nose at about -80 dB forever,
        // and with a velum left at 1e-30 after a hum, later shape changes
        // clicked.)
        const useNose = this.velumArea > 0.0 || this.nasalEnergy > 1e-10;
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
            // the three-port junction works on pressures (the nose keeps
            // pressure waves; its shape does not move while it sounds)
            const sL = Math.sqrt(Math.max(aL, 1e-9));
            const sR = Math.sqrt(Math.max(aR, 1e-9));
            const pLeft = R[vj - 1] / sL;
            const pRight = L[vj] / sR;
            const pJ = 2.0 * (aL * pLeft + aR * pRight + aN * nL[0]) / (aL + aR + aN);
            outR[vj] = (pJ - pRight) * sR;
            outL[vj] = (pJ - pLeft) * sL;
            nOutR[0] = pJ - nL[0];
            // The first nasal section is the velopharyngeal port itself.
            const port = junctionCoefficient(aN, this.nAreas[1]);
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
            // The port's own waves carry no flow when it is nearly shut, so
            // the nose's level is counted from the sections beyond it.
            let energy = 0.0;
            const lossPort = loss * portLoss(aN);
            for (let k = 0; k < nc; k = k + 1) {
                if (k === 0) {
                    nR[0] = nOutR[0] * lossPort;
                    nL[0] = nOutL[1] * lossPort;
                    continue;
                }
                nR[k] = nOutR[k] * loss;
                nL[k] = nOutL[k + 1] * loss;
                if (k > 0) {
                    energy = energy + nR[k] * nR[k] + nL[k] * nL[k];
                }
            }
            this.nasalEnergy = energy;
            if (energy <= 1e-10 && aN <= 0.0) {
                // silent and shut: clear the port's leftover waves too
                nR.fill(0.0);
                nL.fill(0.0);
                this.nasalEnergy = 0.0;
            }
        } else {
            const k = rho[vj];
            const c = cc[vj];
            outR[vj] = c * R[vj - 1] - k * L[vj];
            outL[vj] = k * R[vj - 1] + c * L[vj];
        }

        if (this.injIndex > 0) {
            // a pressure dipole, each half normalised by its side's area
            const ii = this.injIndex;
            outR[ii] = outR[ii] + 0.5 * this.injValue * Math.sqrt(Math.max(this.areas[ii], 1e-9));
            outL[ii] = outL[ii] - 0.5 * this.injValue * Math.sqrt(Math.max(this.areas[ii - 1], 1e-9));
        }
        for (let i = 0; i < n; i = i + 1) {
            R[i] = outR[i] * loss;
            L[i] = outL[i + 1] * loss;
        }
        return radiated;
    }
}
