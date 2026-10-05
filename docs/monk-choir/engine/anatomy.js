// Singer anatomy and articulation -> vocal tract area function.
//
// A singer is two things that this file keeps separate:
//   anatomy      - what the body is: pharynx length, oral-cavity length, the
//                  cross-section scale, nasal length. Fixed per person.
//   articulation - what the person is doing: tongue body place and height,
//                  jaw, lip aperture and protrusion, tongue tip, velum,
//                  larynx height, epilaryngeal narrowing. Normalized, so the
//                  same gesture can be performed by a different body.
//
// The tract is described in normalized coordinates s in [0, 1] from glottis to
// lips: s in [0, S_VELUM] is the pharynx, [S_VELUM, S_LIPS] the oral cavity and
// [S_LIPS, 1] the lip tube. Each segment is mapped to its physical length, so a
// short pharynx (most women and children) is not a uniformly scaled long one.
// The area function is sampled on SECTIONS equal physical sections; the
// waveguide's tick rate is chosen so each section is exactly one tick long.

export const SECTIONS = 40;
export const SPEED_OF_SOUND = 35000.0; // cm/s, warm humid air in the tract
export const S_VELUM = 0.5;
export const S_LIPS = 0.93;
export const MAX_NASAL_SECTIONS = 64;

// Half-length (normalized) of the tongue constriction at the root and dorsum.
export const TONGUE_SHAPE = { rootHalf: 0.24, dorsumHalf: 0.17 };

export function makeArticulation() {
    return {
        tonguePos: 0.55,     // 0.20 pharyngeal ... 0.80 palatal (normalized s)
        tongueHeight: 0.25,  // 0 relaxed ... 1 nearly closed
        jaw: 0.5,            // 0 closed ... 1 wide
        lipAperture: 0.6,    // 0 closed ... 1 wide spread
        lipProtrusion: 0.0,  // 0 ... 1 (adds up to 1.2 cm of lip tube)
        tipPos: 0.88,        // tongue tip/blade place (normalized s)
        tipClose: 0.0,       // 0 ... 1 tongue tip/blade constriction
        velum: 0.0,          // 0 closed ... 1 open nasal port
        larynx: 0.0,         // -1 lowered ... +1 raised
        epilarynx: 0.3       // 0 open ... 1 narrow epilaryngeal tube
    };
}

export function copyArticulation(src, dst) {
    dst.tonguePos = src.tonguePos;
    dst.tongueHeight = src.tongueHeight;
    dst.jaw = src.jaw;
    dst.lipAperture = src.lipAperture;
    dst.lipProtrusion = src.lipProtrusion;
    dst.tipPos = src.tipPos;
    dst.tipClose = src.tipClose;
    dst.velum = src.velum;
    dst.larynx = src.larynx;
    dst.epilarynx = src.epilarynx;
    return dst;
}

export const ARTICULATION_KEYS = [
    "tonguePos", "tongueHeight", "jaw", "lipAperture", "lipProtrusion",
    "tipPos", "tipClose", "velum", "larynx", "epilarynx"
];

// Voice types. Lengths in cm (glottis to velum, velum to lip tube); the lip
// tube adds 0.8 cm plus protrusion. Values follow the commonly reported adult
// male ~17 cm, adult female ~14.5 cm and child ~12 cm vocal-tract lengths, with
// the female/child difference carried mostly by the pharynx. They are model
// assumptions, not measurements of particular singers.
export const VOICE_TYPES = {
    basso: { label: "Basso profundo", pharynx: 9.5, oral: 8.0, areaScale: 1.08, nasal: 11.8, f0Low: 49.0, f0High: 262.0, register: "chest", sex: "m" },
    bass: { label: "Bass", pharynx: 9.0, oral: 7.8, areaScale: 1.0, nasal: 11.5, f0Low: 73.0, f0High: 330.0, register: "chest", sex: "m" },
    baritone: { label: "Baritone", pharynx: 8.6, oral: 7.6, areaScale: 1.0, nasal: 11.3, f0Low: 98.0, f0High: 392.0, register: "chest", sex: "m" },
    tenor: { label: "Tenor", pharynx: 8.2, oral: 7.4, areaScale: 0.95, nasal: 11.0, f0Low: 130.0, f0High: 523.0, register: "chest", sex: "m" },
    countertenor: { label: "Countertenor", pharynx: 8.2, oral: 7.4, areaScale: 0.95, nasal: 11.0, f0Low: 165.0, f0High: 700.0, register: "falsetto", sex: "m" },
    alto: { label: "Alto", pharynx: 6.8, oral: 6.9, areaScale: 0.8, nasal: 10.4, f0Low: 175.0, f0High: 700.0, register: "head", sex: "f" },
    mezzo: { label: "Mezzo-soprano", pharynx: 6.6, oral: 6.8, areaScale: 0.78, nasal: 10.3, f0Low: 196.0, f0High: 880.0, register: "head", sex: "f" },
    soprano: { label: "Soprano", pharynx: 6.3, oral: 6.7, areaScale: 0.76, nasal: 10.2, f0Low: 247.0, f0High: 1175.0, register: "head", sex: "f" },
    treble: { label: "Boy treble", pharynx: 5.4, oral: 6.0, areaScale: 0.62, nasal: 9.0, f0Low: 220.0, f0High: 990.0, register: "head", sex: "c" }
};

export function makeAnatomy(typeKey, lengthScale) {
    const t = VOICE_TYPES[typeKey];
    let s = 1.0;
    if (lengthScale !== undefined) {
        s = lengthScale;
    }
    return {
        type: typeKey,
        pharynx: t.pharynx * s,
        oral: t.oral * s,
        areaScale: t.areaScale * s * s,
        nasal: t.nasal * s
    };
}

function clamp(x, lo, hi) {
    if (x < lo) {
        return lo;
    }
    if (x > hi) {
        return hi;
    }
    return x;
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// Physical segment lengths for this anatomy performing this articulation.
export function segmentLengths(anatomy, art, out) {
    let pharynx = anatomy.pharynx;
    if (art.larynx < 0.0) {
        pharynx = pharynx - 1.5 * art.larynx; // lowering lengthens the pharynx
    } else {
        pharynx = pharynx - 1.0 * art.larynx;
    }
    const lengthScale = Math.sqrt(anatomy.areaScale);
    const lips = (0.8 + 1.2 * art.lipProtrusion) * lengthScale;
    out.pharynx = pharynx;
    out.oral = anatomy.oral;
    out.lips = lips;
    out.total = pharynx + anatomy.oral + lips;
    return out;
}

// Map physical distance from the glottis to normalized s.
function physicalToNormalized(x, seg) {
    if (x <= seg.pharynx) {
        return S_VELUM * x / seg.pharynx;
    }
    const xo = x - seg.pharynx;
    if (xo <= seg.oral) {
        return S_VELUM + (S_LIPS - S_VELUM) * xo / seg.oral;
    }
    const xl = xo - seg.oral;
    return S_LIPS + (1.0 - S_LIPS) * Math.min(1.0, xl / seg.lips);
}

// Neutral diameter (cm, reference male scale) at normalized position s, with
// the jaw and epilaryngeal settings applied.
function neutralDiameter(s, art) {
    let d = 0.0;
    if (s < 0.07) {
        d = 1.05 * (1.0 - 0.5 * art.epilarynx);
    } else if (s < 0.15) {
        const e = 1.05 * (1.0 - 0.5 * art.epilarynx);
        d = e + (2.25 - e) * smoothstep(0.07, 0.15, s);
    } else if (s < S_VELUM) {
        d = 2.25;
    } else {
        d = 2.25 + 0.2 * smoothstep(S_VELUM, 0.6, s);
    }
    // The jaw mostly changes the front of the oral cavity.
    // It lowers the tongue and mandible, so its effect rises from the velum
    // and is largest in the middle and front of the mouth.
    if (s > S_VELUM) {
        const jawFactor = 0.6 + 0.62 * art.jaw;
        const weight = smoothstep(S_VELUM, 0.75, s);
        d = d * (1.0 + (jawFactor - 1.0) * weight);
    }
    return d;
}

// Tongue body bump, tip constriction, cavity compensation and lips.
function articulatedDiameter(s, art) {
    let d = neutralDiameter(s, art);
    // Tongue volume is conserved: fronting the tongue widens the pharynx,
    // backing it widens the front oral cavity.
    const fronting = clamp((art.tonguePos - 0.5) / 0.3, -1.0, 1.0);
    if (s >= 0.15 && s < art.tonguePos - 0.1) {
        d = d * (1.0 + 0.35 * fronting * (0.4 + 0.6 * art.tongueHeight));
    }
    if (s > art.tonguePos + 0.1 && s < S_LIPS) {
        let scale = 0.25;
        if (fronting < 0.0) {
            scale = 0.3; // a retracted tongue root opens the whole mouth cavity
        }
        d = d * (1.0 - scale * fronting * (0.4 + 0.6 * art.tongueHeight));
    }
    // The tongue body is narrower when it constricts the pharynx (tongue root)
    // than when it raises toward the palate (tongue dorsum).
    const halfWidth = TONGUE_SHAPE.rootHalf + (TONGUE_SHAPE.dorsumHalf - TONGUE_SHAPE.rootHalf) * smoothstep(0.3, 0.6, art.tonguePos);
    const ds = s - art.tonguePos;
    if (ds > -halfWidth && ds < halfWidth) {
        const centre = neutralDiameter(art.tonguePos, art) * (1.0 - 0.93 * art.tongueHeight);
        const c = Math.cos(0.5 * Math.PI * ds / halfWidth);
        const target = d - (d - centre) * c * c;
        if (target < d) {
            d = target;
        }
    }
    const tipHalf = 0.05;
    const dt = s - art.tipPos;
    if (art.tipClose > 0.0 && dt > -tipHalf && dt < tipHalf) {
        const c = Math.cos(0.5 * Math.PI * dt / tipHalf);
        d = d * (1.0 - 0.97 * art.tipClose * c * c);
    }
    if (s >= S_LIPS) {
        const lipD = 2.9 * art.lipAperture * (0.55 + 0.45 * art.jaw);
        const w = smoothstep(S_LIPS - 0.02, S_LIPS + 0.03, s);
        d = d * (1.0 - w) + lipD * w;
    }
    if (d < 0.0) {
        d = 0.0;
    }
    return d;
}

// Fill areas (cm^2) for SECTIONS equal physical sections. Returns the tract
// length in cm. `seg` is scratch for segmentLengths.
export function areaFunction(anatomy, art, areas, seg) {
    segmentLengths(anatomy, art, seg);
    const dx = seg.total / SECTIONS;
    for (let i = 0; i < SECTIONS; i = i + 1) {
        const x = (i + 0.5) * dx;
        const s = physicalToNormalized(x, seg);
        const d = articulatedDiameter(s, art);
        areas[i] = 0.25 * Math.PI * d * d * anatomy.areaScale;
    }
    return seg.total;
}

// Index of the junction where the nasal port couples (the velum position).
export function velumJunction(seg) {
    const dx = seg.total / SECTIONS;
    let j = Math.round(seg.pharynx / dx);
    if (j < 2) {
        j = 2;
    }
    if (j > SECTIONS - 2) {
        j = SECTIONS - 2;
    }
    return j;
}

// Nasal tract: same section length as the oral tract. Returns the count.
export function nasalAreas(anatomy, seg, out) {
    const dx = seg.total / SECTIONS;
    let n = Math.round(anatomy.nasal / dx);
    if (n > MAX_NASAL_SECTIONS) {
        n = MAX_NASAL_SECTIONS;
    }
    if (n < 4) {
        n = 4;
    }
    for (let i = 0; i < n; i = i + 1) {
        const u = (i + 0.5) / n;
        // Narrow port, wide turbinate cavity, narrowing nostrils.
        let d = 0.9 + 1.0 * Math.sin(Math.PI * Math.min(1.0, u * 1.25));
        if (u > 0.85) {
            d = 0.95;
        }
        out[i] = 0.25 * Math.PI * d * d * anatomy.areaScale;
    }
    return n;
}

export function velumArea(anatomy, art) {
    return 0.45 * art.velum * anatomy.areaScale;
}

// Effective lip radius (cm) for the radiation model.
export function lipRadius(areas) {
    const a = areas[SECTIONS - 1];
    return Math.sqrt(Math.max(a, 1e-6) / Math.PI);
}
