// "Rol-mo at 140": a programmatic piece for physical monks, ritual
// instruments and a bass drop.
//
// The idea. Tibetan monastic ritual music (rol-mo) is not a symphony in the
// Western sense: no harmony progression, no conductor. It is layers of
// independent cycles that each obey their own logic, and the drop of
// electronic music turns out to have analogues for each layer:
//   - dungchen are played in pairs, overlapping so the drone never breaks
//     -> the sub-bass and the brass stabs of the drop;
//   - rolmo cymbal patterns accelerate into rolls and decelerate like a
//     bouncing ball -> the snare roll of a build-up is the same gesture
//     forced onto a grid;
//   - yang chant tunes formants onto harmonics of a very low voice -> the
//     harmonic stack under the drop;
//   - the gyaling pair plays one melody with independent ornaments
//     (heterophony) -> the doubled lead;
//   - ritual time is breath and gesture, converging on a pulse -> here the
//     free sections slide onto 70 BPM, which is exactly the half-time feel
//     of a 140 BPM drop;
//   - the "wobble" bass is not a filter: it is a monk's throat, a real tube
//     running the vowel-space oscillator at the tempo.
// The melodies and rhythms are original. The mantra syllables are the
// traditional "om mani padme hum".

import { Choir, Hall, makeSingerConfig } from "./choir.js?v=44ddd35ca9";
import {
    Dungchen, Gyaling, Conch, Rolmo, Nga, Drilbu, Kick, Snare, Hats, Sub, Riser, Dunk, softSaturate
} from "./instruments.js?v=84dae2630a";

export const TEMPO = 140.0;
export const BEAT = 60.0 / TEMPO;
export const BAR = 4.0 * BEAT;
export const GRID = 88.0; // seconds: where the pulse locks to 140 BPM

function gridTime(bar, beat) {
    return GRID + bar * BAR + beat * BEAT;
}

export const SECTIONS = [
    { name: "Invocation", start: 0.0, text: "Two dungchen overlap so the drone never breaks; the conch calls and the bell opens the space." },
    { name: "Yang", start: 22.0, text: "Deep chant near 65 Hz. Each monk tunes F1 to the 5th harmonic and F2 to the 10th; the false folds add the half tone. Om mani padme hum, stretched across breaths." },
    { name: "Rol-mo", start: 60.0, text: "The instruments' turn. Two gyaling play one melody with their own ornaments. Cymbal strokes accelerate into rolls. The drum's free pulse drifts toward 70 BPM." },
    { name: "Build", start: gridTime(0, 0), text: "The pulse locks: 70 BPM ritual = 140 BPM half time. The cymbal accelerando becomes a snare roll; the overtone singer climbs the harmonic series as the riser." },
    { name: "Drop", start: gridTime(8, 0), text: "The wobble is a throat: a basso's tube orbiting through vowel space at the tempo, growling with ventricular half tone. Sygyt whistles the hook on harmonics 8–12." },
    { name: "Bardo", start: gridTime(24, 0), text: "The in-between. Drums fall away; every voice's vowel orbits on its own polyrhythmic period while the upper voices hold a fifth." },
    { name: "Drop II", start: gridTime(32, 0), text: "Both worlds at once: dungchen stabs, rolmo crashes and the throat bass in triplets and sixteenths." },
    { name: "Dissolution", start: gridTime(40, 0), text: "The grid lets go. Cymbals decelerate like a bouncing ball, the horns rise to their upper partial, and the Om closes into a hum." }
];

export const SONG_LENGTH = gridTime(40, 0) + 26.0;

// ------------------------------------------------------------------ score

// event: { t, kind: "state" | "trigger", act, a }
function Score() {
    this.events = [];
}

Score.prototype.at = function at(t, kind, act, a) {
    this.events.push({ t: t, kind: kind, act: act, a: a || {} });
};

function addSyllable(s, t, part, syl) {
    // consonant onset
    if (syl.c === "m") {
        s.at(t, "state", "set", { part: part, name: "hum", value: 1.0 });
        s.at(t + 0.09, "state", "set", { part: part, name: "hum", value: 0.0 });
    } else if (syl.c === "n") {
        s.at(t, "state", "set", { part: part, name: "stopTip", value: 1.0 });
        s.at(t, "state", "set", { part: part, name: "velumOpen", value: 1.0 });
        s.at(t + 0.08, "state", "set", { part: part, name: "stopTip", value: 0.0 });
        s.at(t + 0.1, "state", "set", { part: part, name: "velumOpen", value: 0.0 });
    } else if (syl.c === "p") {
        s.at(t, "state", "set", { part: part, name: "stopLip", value: 1.0 });
        s.at(t + 0.05, "state", "set", { part: part, name: "stopLip", value: 0.0 });
    } else if (syl.c === "d") {
        s.at(t, "state", "set", { part: part, name: "stopTip", value: 1.0 });
        s.at(t + 0.05, "state", "set", { part: part, name: "stopTip", value: 0.0 });
    } else {
        s.at(t, "state", "set", { part: part, name: "hum", value: 0.0 });
    }
    s.at(t, "state", "set", { part: part, name: "vowel", value: syl.v });
}

// "om ma ni pad me hum": consonant, vowel (0 ooh .. 1 eeh), closing hum
const MANTRA = [
    { c: "", v: 0.25, close: "m" },
    { c: "m", v: 0.5 },
    { c: "n", v: 1.0 },
    { c: "p", v: 0.5, close: "d" },
    { c: "m", v: 0.75 },
    { c: "h", v: 0.0, close: "m" }
];

// One mantra over the given syllable durations (seconds). Returns end time.
function mantra(s, t0, part, durs) {
    let t = t0;
    for (let i = 0; i < MANTRA.length; i = i + 1) {
        const syl = MANTRA[i];
        addSyllable(s, t, part, syl);
        const d = durs[i % durs.length];
        if (syl.close === "m") {
            s.at(t + d * 0.62, "state", "set", { part: part, name: "hum", value: 1.0 });
        } else if (syl.close === "d") {
            s.at(t + d * 0.85, "state", "set", { part: part, name: "stopTip", value: 1.0 });
            s.at(t + d * 0.95, "state", "set", { part: part, name: "stopTip", value: 0.0 });
        }
        t = t + d;
    }
    return t;
}

function horn(s, t, which, note, dur, level, growl) {
    s.at(t, "state", "horn", { which: which, note: note, level: level, attack: Math.min(2.0, dur * 0.3), growl: growl });
    s.at(t + dur, "state", "hornStop", { which: which, release: 1.4 });
}

// Cymbal strokes with geometrically changing gaps: ratio < 1 accelerates
// into a roll, ratio > 1 decelerates like a bouncing ball.
function rolmoPattern(s, t0, firstGap, ratio, count, amp, crash) {
    let t = t0;
    let gap = firstGap;
    for (let i = 0; i < count; i = i + 1) {
        s.at(t, "trigger", "rolmo", { amp: amp * (0.55 + 0.45 * i / count), bright: 0.4 + 0.4 * i / count });
        t = t + gap;
        gap = gap * ratio;
    }
    if (crash) {
        s.at(t, "trigger", "rolmo", { amp: amp * 1.3, bright: 0.95 });
    }
    return t;
}

// Gyaling pair: same notes, second player a little late with its own grace.
function gyaling(s, t0, unit, phrase, level) {
    let t = t0;
    for (let i = 0; i < phrase.length; i = i + 1) {
        const note = phrase[i][0];
        const len = phrase[i][1] * unit;
        let grace = 0;
        if (phrase[i][1] >= 2) {
            grace = 2;
        }
        let grace2 = grace;
        if (i % 3 === 1) {
            grace2 = grace === 0 ? 1 : 3;
        }
        s.at(t, "state", "gya", { which: 0, note: note, level: level, grace: grace, graceDur: 0.07 });
        s.at(t + 0.045 + 0.03 * (i % 3), "state", "gya", { which: 1, note: note, level: level * 0.9, grace: grace2, graceDur: 0.09 });
        t = t + len;
    }
    s.at(t, "state", "gyaStop", { which: 0 });
    s.at(t + 0.08, "state", "gyaStop", { which: 1 });
    return t;
}

const MELODY_A = [[67, 2], [65, 1], [63, 1], [65, 2], [67, 3], [70, 1], [67, 1], [65, 2], [63, 1], [62, 1], [60, 4]];
const MELODY_B = [[60, 1], [63, 1], [65, 2], [67, 1], [68, 1], [67, 2], [65, 1], [63, 1], [65, 1], [63, 1], [62, 2], [60, 4]];

// Wobble patterns: oscillator cycles per beat, shape, and orbit size.
const WOBBLES = {
    yoi: { perBeat: 1.0, shape: "ramp", depth: 0.5, round: 0.6 },
    eighth: { perBeat: 2.0, shape: "sine", depth: 0.45, round: 0.4 },
    triplet: { perBeat: 1.5, shape: "sine", depth: 0.45, round: 0.5 },
    growl: { perBeat: 4.0, shape: "step", depth: 0.4, round: 0.3 },
    slow: { perBeat: 0.5, shape: "triangle", depth: 0.5, round: 0.7 }
};

function wobbleBar(s, bar, name, note) {
    const w = WOBBLES[name];
    const t = gridTime(bar, 0);
    s.at(t, "state", "set", { part: "bass", name: "osc.rate", value: w.perBeat / BEAT });
    s.at(t, "state", "set", { part: "bass", name: "osc.shape", value: w.shape });
    s.at(t, "state", "set", { part: "bass", name: "osc.depth", value: w.depth });
    s.at(t, "state", "set", { part: "bass", name: "osc.round", value: w.round });
    s.at(t, "state", "set", { part: "bass", name: "osc.mode", value: "sync" }); // re-phase on the downbeat
    s.at(t, "state", "note", { part: "bass", note: note });
    s.at(t, "state", "sub", { note: note, level: 1.0 });
}

function dropDrums(s, bar, fill) {
    s.at(gridTime(bar, 0), "trigger", "kick", { amp: 1.0 });
    s.at(gridTime(bar, 2), "trigger", "snare", { amp: 1.0 });
    if (bar % 2 === 1) {
        s.at(gridTime(bar, 2.5), "trigger", "kick", { amp: 0.7 });
    }
    for (let e = 0; e < 8; e = e + 1) {
        s.at(gridTime(bar, e * 0.5), "trigger", "hat", { amp: e % 2 === 1 ? 0.9 : 0.55, open: e % 4 === 3 });
    }
    if (fill) {
        for (let k = 0; k < 4; k = k + 1) {
            s.at(gridTime(bar, 3 + k * 0.25), "trigger", "snare", { amp: 0.5 + 0.12 * k });
        }
    }
}

// Sygyt hook: harmonic numbers per eighth note (0 = hold previous).
const HOOK_A = [12, 0, 10, 0, 9, 10, 8, 0];
const HOOK_B = [12, 0, 10, 0, 9, 0, 10, 12];
const HOOK_C = [16, 0, 12, 0, 10, 9, 8, 0];

function hookBar(s, bar, hook) {
    for (let e = 0; e < 8; e = e + 1) {
        if (hook[e] !== 0) {
            s.at(gridTime(bar, e * 0.5), "state", "set", { part: "solo", name: "harmonic", value: hook[e] });
        }
    }
}

export function buildScore() {
    const s = new Score();
    // ---- Invocation
    s.at(0.0, "state", "section", { index: 0 });
    s.at(0.3, "trigger", "bell", { amp: 0.8 });
    horn(s, 1.0, 0, 36, 9.0, 0.9, 0.35);
    horn(s, 7.5, 1, 36, 9.0, 0.95, 0.4);
    s.at(4.0, "trigger", "conch", { note: 55, level: 0.9, seconds: 2.6 });
    horn(s, 14.5, 0, 36, 9.5, 1.0, 0.45);
    s.at(12.0, "trigger", "conch", { note: 55, level: 0.8, seconds: 3.2 });
    s.at(17.0, "trigger", "bell", { amp: 0.6 });
    rolmoPattern(s, 18.0, 0.9, 0.78, 9, 0.35, true);

    // ---- Yang chant
    s.at(22.0, "state", "section", { index: 1 });
    horn(s, 21.0, 1, 36, 12.0, 0.45, 0.3);
    horn(s, 31.0, 0, 36, 12.0, 0.4, 0.3);
    horn(s, 41.0, 1, 36, 12.0, 0.45, 0.35);
    horn(s, 51.0, 0, 36, 10.0, 0.45, 0.35);
    s.at(22.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(22.0, "state", "note", { part: "monks", note: 36 });
    s.at(22.0, "trigger", "nga", { amp: 0.9 });
    let t = 25.5;
    t = mantra(s, t, "monks", [3.2, 1.6, 1.8, 2.2, 1.7, 3.5]);
    s.at(t, "trigger", "nga", { amp: 0.8 });
    s.at(t, "trigger", "bell", { amp: 0.4 });
    s.at(t, "state", "set", { part: "monks", name: "halftone", value: 0.55 });
    t = mantra(s, t + 0.6, "monks", [3.0, 1.4, 1.6, 2.0, 1.5, 3.4]);
    s.at(t, "trigger", "nga", { amp: 0.85 });
    s.at(t, "state", "set", { part: "monks", name: "halftone", value: 0.8 });
    t = mantra(s, t + 0.5, "monks", [2.6, 1.3, 1.4, 1.8, 1.4, 3.0]);
    s.at(t, "trigger", "nga", { amp: 0.95 });
    s.at(t, "trigger", "rolmo", { amp: 0.6, bright: 0.8 });

    // ---- Rol-mo interlude
    s.at(60.0, "state", "section", { index: 2 });
    s.at(60.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(60.0, "state", "set", { part: "monks", name: "halftone", value: 0.3 });
    horn(s, 60.0, 1, 36, 14.0, 0.5, 0.3);
    horn(s, 72.0, 0, 36, 16.0, 0.55, 0.35);
    let g = gyaling(s, 61.0, 0.62, MELODY_A, 0.8);
    gyaling(s, g + 0.5, 0.55, MELODY_B, 0.85);
    rolmoPattern(s, 62.0, 1.1, 0.8, 11, 0.45, true);
    rolmoPattern(s, 70.5, 0.5, 1.15, 7, 0.35, false);
    rolmoPattern(s, 76.0, 1.0, 0.76, 14, 0.5, true);
    // the drum's pulse drifts from 50 to 70 BPM and lands on the grid
    let pulse = 60.0 / 50.0;
    let tp = 64.0;
    while (tp < GRID - 0.01) {
        s.at(tp, "trigger", "nga", { amp: 0.55 + 0.3 * (tp - 64.0) / (GRID - 64.0) });
        const remaining = GRID - tp;
        pulse = pulse + (60.0 / 70.0 - pulse) * 0.12;
        if (remaining < pulse * 1.5) {
            pulse = remaining / Math.max(1, Math.round(remaining / (60.0 / 70.0)));
        }
        tp = tp + pulse;
    }

    // ---- Build (8 bars)
    s.at(GRID, "state", "section", { index: 3 });
    s.at(GRID, "trigger", "nga", { amp: 1.0 });
    s.at(GRID, "state", "set", { part: "monks", name: "hum", value: 0.0 });
    s.at(GRID, "state", "set", { part: "monks", name: "halftone", value: 0.5 });
    s.at(GRID, "state", "note", { part: "solo", note: 48 });
    s.at(GRID, "state", "set", { part: "solo", name: "harmonic", value: 6 });
    for (let b = 0; b < 8; b = b + 1) {
        // chant on the beat: six syllables, then on eighths in the last bars
        const step = b < 6 ? BEAT : BEAT / 2;
        for (let k = 0; k < 4 * BEAT / step; k = k + 1) {
            const syl = MANTRA[(b * 4 + k) % MANTRA.length];
            if (b === 7 && k >= 4) {
                break;
            }
            addSyllable(s, gridTime(b, 0) + k * step, "monks", syl);
        }
        s.at(gridTime(b, 0), "trigger", "nga", { amp: 0.7 + 0.04 * b });
        s.at(gridTime(b, 2), "trigger", "nga", { amp: 0.5 });
        s.at(gridTime(b, 0), "state", "set", { part: "solo", name: "harmonic", value: 6 + Math.min(10, Math.round(b * 1.43)) });
        s.at(gridTime(b, 2), "state", "set", { part: "solo", name: "harmonic", value: 6 + Math.min(10, Math.round(b * 1.43 + 0.7)) });
        // the rolmo accelerando, now metric: quarters, eighths, sixteenths, 32nds
        let division = 1.0;
        if (b >= 2) { division = 0.5; }
        if (b >= 4) { division = 0.25; }
        if (b >= 6) { division = 0.125; }
        const beats = b === 7 ? 2.0 : 4.0;
        for (let x = 0.0; x < beats - 1e-6; x = x + division) {
            const u = (b * 4 + x) / 30.0;
            s.at(gridTime(b, x), "trigger", "snare", { amp: 0.25 + 0.6 * u });
            if (division >= 0.5) {
                s.at(gridTime(b, x), "trigger", "rolmo", { amp: 0.2 + 0.3 * u, bright: 0.5 + 0.4 * u });
            }
        }
    }
    horn(s, GRID, 0, 36, 4 * BAR, 0.5, 0.3);
    horn(s, gridTime(4, 0), 1, 36, 3.5 * BAR, 0.8, 0.4);
    s.at(gridTime(4, 0), "trigger", "riser", { seconds: 3.5 * BAR, amp: 0.9 });
    // the breath before the drop: everything stops; kangling call; HUM
    s.at(gridTime(7, 2), "state", "off", { part: "solo" });
    s.at(gridTime(7, 2), "trigger", "kang", { note: 69, level: 0.9, seconds: 0.55 });
    s.at(gridTime(7, 2), "state", "set", { part: "monks", name: "vowel", value: 0.0 });
    s.at(gridTime(7, 3), "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(gridTime(7, 3.5), "state", "off", { part: "monks" });

    // ---- Drop (16 bars)
    s.at(gridTime(8, 0), "state", "section", { index: 4 });
    s.at(gridTime(8, 0), "trigger", "impact", { amp: 1.0 });
    s.at(gridTime(8, 0), "trigger", "rolmo", { amp: 1.0, bright: 1.0 });
    s.at(gridTime(8, 0), "state", "note", { part: "solo", note: 48 });
    s.at(gridTime(8, 0), "state", "set", { part: "solo", name: "tuning", value: "sygyt" });
    const bassLine = [36, 36, 39, 34, 36, 36, 41, 39];
    const wobbleLine = ["yoi", "yoi", "eighth", "triplet", "yoi", "growl", "eighth", "growl"];
    for (let b = 8; b < 24; b = b + 1) {
        const i = (b - 8) % 8;
        wobbleBar(s, b, wobbleLine[i], bassLine[i]);
        dropDrums(s, b, i === 7);
        const hooks = [HOOK_A, HOOK_B, HOOK_A, HOOK_C];
        hookBar(s, b, hooks[i % 4]);
        if (i === 0 || i === 4) {
            s.at(gridTime(b, 0), "state", "note", { part: "monks", note: 36 });
            s.at(gridTime(b, 0), "state", "set", { part: "monks", name: "hum", value: 0.0 });
            s.at(gridTime(b, 0), "state", "set", { part: "monks", name: "vowel", value: 0.3 });
            s.at(gridTime(b, 1.5), "state", "set", { part: "monks", name: "hum", value: 1.0 });
            s.at(gridTime(b, 3.5), "state", "off", { part: "monks" });
            s.at(gridTime(b, 0), "state", "horn", { which: i === 0 ? 0 : 1, note: 48, level: 1.0, attack: 0.05, growl: 0.5 });
            s.at(gridTime(b, 0.75), "state", "hornStop", { which: i === 0 ? 0 : 1, release: 0.25 });
        }
        if (i === 3 || i === 7) {
            s.at(gridTime(b, 0), "trigger", "rolmo", { amp: 0.7, bright: 0.85 });
        }
    }
    s.at(gridTime(24, 0) - 0.02, "state", "sub", { note: 36, level: 0.0 });

    // ---- Bardo (8 bars, no drums)
    s.at(gridTime(24, 0), "state", "section", { index: 5 });
    s.at(gridTime(24, 0), "state", "off", { part: "bass" });
    s.at(gridTime(24, 0), "state", "off", { part: "solo" });
    s.at(gridTime(24, 0), "trigger", "rolmo", { amp: 0.8, bright: 0.7 });
    s.at(gridTime(24, 0), "state", "note", { part: "monks", note: 36 });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "hum", value: 0.0 });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "tuning", value: "none" });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "vowel", value: 0.35 });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "osc.mode", value: "ratio" });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "osc.rate", value: 0.6 / BAR });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "osc.depth", value: 0.3 });
    s.at(gridTime(24, 0), "state", "set", { part: "monks", name: "osc.round", value: 0.5 });
    s.at(gridTime(24, 0), "state", "note", { part: "upper", note: 55 });
    s.at(gridTime(24, 0), "state", "set", { part: "upper", name: "vowel", value: 0.5 });
    s.at(gridTime(24, 0), "state", "set", { part: "upper", name: "osc.mode", value: "free" });
    s.at(gridTime(24, 0), "state", "set", { part: "upper", name: "osc.rate", value: 0.18 });
    s.at(gridTime(24, 0), "state", "set", { part: "upper", name: "osc.depth", value: 0.35 });
    s.at(gridTime(24, 0), "state", "set", { part: "upper", name: "osc.round", value: 0.4 });
    s.at(gridTime(28, 0), "state", "note", { part: "upper", note: 60 });
    horn(s, gridTime(24, 0), 0, 36, 4 * BAR + 1.0, 0.55, 0.3);
    horn(s, gridTime(28, 0) - 1.0, 1, 36, 4 * BAR, 0.6, 0.35);
    gyaling(s, gridTime(25, 0), BEAT, MELODY_B, 0.8);
    rolmoPattern(s, gridTime(30, 0), BEAT, 0.82, 12, 0.5, false);
    s.at(gridTime(30, 0), "trigger", "riser", { seconds: 2 * BAR, amp: 1.0 });
    for (let b = 24; b < 32; b = b + 1) {
        s.at(gridTime(b, 0), "trigger", "nga", { amp: 0.55 });
    }
    s.at(gridTime(31, 3), "state", "off", { part: "upper" });
    s.at(gridTime(31, 3), "state", "set", { part: "monks", name: "osc.depth", value: 0.0 });
    s.at(gridTime(31, 3), "state", "set", { part: "monks", name: "osc.round", value: 0.0 });

    // ---- Drop II (8 bars)
    s.at(gridTime(32, 0), "state", "section", { index: 6 });
    s.at(gridTime(32, 0), "trigger", "impact", { amp: 1.0 });
    s.at(gridTime(32, 0), "state", "set", { part: "monks", name: "tuning", value: "gyuto" });
    s.at(gridTime(32, 0), "state", "note", { part: "solo", note: 48 });
    s.at(gridTime(32, 0), "state", "note", { part: "upper", note: 60 });
    s.at(gridTime(32, 0), "state", "set", { part: "upper", name: "osc.depth", value: 0.2 });
    const wobble2 = ["triplet", "growl", "yoi", "growl", "triplet", "eighth", "growl", "growl"];
    const bass2 = [36, 36, 39, 41, 36, 34, 39, 43];
    for (let b = 32; b < 40; b = b + 1) {
        const i = b - 32;
        wobbleBar(s, b, wobble2[i], bass2[i]);
        dropDrums(s, b, i === 3 || i === 7);
        hookBar(s, b, [HOOK_C, HOOK_A, HOOK_B, HOOK_C][i % 4]);
        s.at(gridTime(b, 0), "trigger", "rolmo", { amp: i % 2 === 0 ? 0.75 : 0.45, bright: 0.8 });
        s.at(gridTime(b, 0), "state", "horn", { which: i % 2, note: i % 2 === 0 ? 48 : 43, level: 1.0, attack: 0.05, growl: 0.55 });
        s.at(gridTime(b, 0.6), "state", "hornStop", { which: i % 2, release: 0.2 });
        if (i % 2 === 0) {
            s.at(gridTime(b, 0), "state", "note", { part: "monks", note: 36 });
            s.at(gridTime(b, 0), "state", "set", { part: "monks", name: "hum", value: 0.0 });
            s.at(gridTime(b, 2.0), "state", "set", { part: "monks", name: "hum", value: 1.0 });
        }
    }

    // ---- Dissolution
    const tD = gridTime(40, 0);
    s.at(tD, "state", "section", { index: 7 });
    s.at(tD, "state", "off", { part: "bass" });
    s.at(tD, "state", "sub", { note: 36, level: 0.0 });
    s.at(tD, "state", "off", { part: "solo" });
    s.at(tD, "state", "off", { part: "upper" });
    s.at(tD, "trigger", "rolmo", { amp: 1.0, bright: 0.9 });
    s.at(tD, "trigger", "nga", { amp: 1.0 });
    s.at(tD, "state", "set", { part: "monks", name: "tuning", value: "gyuto" });
    s.at(tD, "state", "set", { part: "monks", name: "halftone", value: 0.7 });
    s.at(tD, "state", "note", { part: "monks", note: 36 });
    s.at(tD + 0.01, "state", "set", { part: "monks", name: "hum", value: 0.0 });
    let tm = mantra(s, tD + 1.0, "monks", [3.4, 1.8, 2.0, 2.4, 2.0, 5.0]);
    s.at(tm, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(tm + 4.0, "state", "off", { part: "monks" });
    rolmoPattern(s, tD + 0.5, 0.12, 1.22, 13, 0.6, false);
    horn(s, tD, 0, 36, 9.0, 0.9, 0.4);
    s.at(tD + 7.0, "state", "hornBend", { which: 0, note: 48 });
    horn(s, tD + 7.0, 1, 36, 12.0, 0.8, 0.45);
    s.at(tD + 16.5, "state", "hornBend", { which: 1, note: 48 });
    s.at(tD + 9.0, "trigger", "bell", { amp: 0.6 });
    s.at(tD + 15.0, "trigger", "bell", { amp: 0.5 });
    s.at(tD + 21.0, "trigger", "bell", { amp: 0.7 });
    s.at(tD + 21.0, "trigger", "nga", { amp: 0.7 });
    s.at(SONG_LENGTH, "state", "end", {});

    s.events.sort(compareEvents);
    return s.events;
}

function compareEvents(a, b) {
    return a.t - b.t;
}

// ------------------------------------------------------------------ parts

function partConfigs() {
    const monks = [
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "gyuto", pan: -0.5, detune: -6, onset: 0.05, vibratoDepth: 0.02, effort: 0.75, larynx: -0.3, level: 1.0 }),
        Object.assign(makeSingerConfig("bass", "ventricular", 0), { octave: 0, tuning: "none", pan: -0.2, detune: 4, onset: 0.12, vibratoDepth: 0.02, effort: 0.8, larynx: -0.4, level: 0.7 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "gyuto", pan: 0.1, detune: 7, onset: 0.0, vibratoDepth: 0.03, effort: 0.75, larynx: -0.2, level: 1.0, lengthScale: 1.03 }),
        Object.assign(makeSingerConfig("bass", "ventricular", 0), { octave: 0, tuning: "none", pan: 0.35, detune: -3, onset: 0.09, vibratoDepth: 0.02, effort: 0.8, larynx: -0.4, level: 0.7, lengthScale: 0.98 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "gyuto", pan: 0.6, detune: -9, onset: 0.15, vibratoDepth: 0.03, effort: 0.7, larynx: -0.3, level: 1.0, lengthScale: 0.97 })
    ];
    const upper = [
        Object.assign(makeSingerConfig("countertenor", "falsetto", 12), { octave: 0, tuning: "r1", pan: -0.3, vibratoDepth: 0.22, level: 1.0 }),
        Object.assign(makeSingerConfig("tenor", "chest", 0), { octave: 0, pan: 0.2, vibratoDepth: 0.15, epilarynx: 0.5, level: 0.9 }),
        Object.assign(makeSingerConfig("tenor", "head", -5), { octave: 0, pan: 0.5, vibratoDepth: 0.15, level: 0.9 })
    ];
    const solo = [
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "overtone", vibratoDepth: 0.0, driftCents: 1.5, effort: 0.9, epilarynx: 0.6, level: 3.5, pan: 0.0 })
    ];
    const bass = [
        Object.assign(makeSingerConfig("basso", "ventricular", 0), { octave: 0, tuning: "none", vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, larynx: -0.2, level: 1.0, pan: 0.0 })
    ];
    return { monks: monks, upper: upper, solo: solo, bass: bass };
}

export const PART_NAMES = ["monks", "upper", "solo", "bass"];

export const ROLMO = {
    id: "rolmo",
    title: "Rol-mo at 140",
    sections: SECTIONS,
    length: SONG_LENGTH,
    grid: GRID,
    bar: BAR,
    buildScore: buildScore,
    partConfigs: partConfigs,
    setup: null,
    warmSpots: [0.5, 27.0, 62.5, gridTime(6, 0), gridTime(9, 0), gridTime(25, 0), gridTime(33, 0), gridTime(40, 2)]
};

const VOICE_FIELDS = {
    vowel: "vowelTarget", hum: "humTarget", stopLip: "stopLipTarget", stopTip: "stopTipTarget", velumOpen: "velumOpenTarget",
    larynx: "larynxTarget", larynxGlide: "larynxGlide", protrusion: "protrusionTarget", vibrato: "vibratoDepth", vowelGlide: "vowelGlide"
};

export class SongEngine {
    constructor(sampleRate, def) {
        this.sr = sampleRate;
        this.def = def === undefined ? ROLMO : def;
        this.events = this.def.buildScore();
        this.build();
    }

    build() {
        const sr = this.sr;
        const cfg = this.def.partConfigs();
        this.parts = {};
        for (let i = 0; i < PART_NAMES.length; i = i + 1) {
            const name = PART_NAMES[i];
            const c = new Choir(sr);
            c.configure({ singers: cfg[name], voicing: "stack" });
            c.setGlobal("glide", 0.08);
            this.parts[name] = c;
        }
        this.parts.bass.setGlobal("vowelGlide", 0.012);
        this.parts.bass.setGlobal("halftone", 0.45);
        this.parts.bass.setGlobal("glide", 0.03);
        this.parts.monks.setGlobal("vowelGlide", 0.09);
        this.horns = [new Dungchen(sr, 11), new Dungchen(sr, 29)];
        this.gyas = [new Gyaling(sr, 5, 0.0), new Gyaling(sr, 17, 9.0)];
        this.conch = new Conch(sr, 3, 650.0, 0.25);
        this.kangling = new Conch(sr, 41, 1500.0, 0.55);
        this.rolmo = new Rolmo(sr, 77);
        this.nga = new Nga(sr, 68.0);
        this.bell = new Drilbu(sr, 1320.0);
        this.kick = new Kick(sr, 5);
        this.snare = new Snare(sr, 9);
        this.hats = new Hats(sr);
        this.sub = new Sub(sr);
        this.riser = new Riser(sr, 13);
        this.dunk = new Dunk(sr);
        this.hall = new Hall(sr);
        this.hall.mix = 0.42;
        this.hall.setTime(4.2, 0.5);
        this.ritualL = new Float32Array(128);
        this.ritualR = new Float32Array(128);
        this.dropL = new Float32Array(128);
        this.dropR = new Float32Array(128);
        this.bassL = new Float32Array(128);
        this.bassR = new Float32Array(128);
        this.duck = new Float32Array(128);
        this.sinceKick = 1e9;
        this.kickOffsets = [];
        this.time = 0.0;
        this.next = 0;
        this.playing = false;
        this.section = 0;
        this.ended = false;
        this.envFollow = 0.0;
        this.master = 0.9;
        this.srcL = new Float32Array(128);
        this.srcR = new Float32Array(128);
        if (this.room === undefined) {
            this.room = null;
        }
        if (this.def.setup) {
            this.def.setup(this);
        }
    }

    play() {
        this.playing = true;
    }

    // Detailed room: every part and ritual instrument gets a seat on the
    // stage; the electronic drop stays dry (in the listener's headphones).
    setRoom(room) {
        this.room = room;
        if (room === null) {
            return;
        }
        room.clearSeats();
        const h = room.postureHeight;
        const places = [
            [0.0, 0.0, h], [0.0, -1.5, 1.6], [0.0, -0.8, h],
            [-3.5, -0.5, 1.2], [3.5, -0.5, 1.2], [-1.5, 0.3, 1.3], [1.5, 0.3, 1.3],
            [-2.5, -0.3, 1.4], [2.8, -0.3, 1.0], [-1.0, 0.0, 1.2]
        ];
        for (let i = 0; i < places.length; i = i + 1) {
            const seat = room.addSeat(places[i][0], places[i][1], places[i][2], i === 0 || i === 2 || i === 8);
            seat.input = new Float32Array(128);
        }
        this.roomGain = room.loudnessScale();
    }

    // render one source into a seat as mono (scaled)
    toSeat(k, m, scale) {
        const seat = this.room.seats[k];
        const l = this.srcL;
        const r = this.srcR;
        for (let i = 0; i < m; i = i + 1) {
            seat.input[i] = seat.input[i] + (l[i] + r[i]) * scale;
            l[i] = 0.0;
            r[i] = 0.0;
        }
    }

    stop() {
        this.playing = false;
        const names = PART_NAMES;
        for (let i = 0; i < names.length; i = i + 1) {
            this.parts[names[i]].allNotesOff();
        }
        this.horns[0].stop(0.6);
        this.horns[1].stop(0.6);
        this.gyas[0].stop(0.2);
        this.gyas[1].stop(0.2);
        this.sub.stop();
    }

    // Compile every code path before the listener hears anything: render a
    // short stretch of each section silently, then return to the start.
    warmUp() {
        const spots = this.def.warmSpots;
        const l = new Float32Array(128);
        const r = new Float32Array(128);
        for (let i = 0; i < spots.length; i = i + 1) {
            this.seek(spots[i]);
            this.playing = true;
            for (let b = 0; b < 90; b = b + 1) {
                this.process(l, r, 128);
            }
        }
        this.playing = false;
        this.seek(0.0);
    }

    // Jump to time t: rebuild, then apply only the state events before t.
    seek(t) {
        const wasPlaying = this.playing;
        this.build();
        let i = 0;
        while (i < this.events.length && this.events[i].t < t) {
            if (this.events[i].kind === "state") {
                this.apply(this.events[i], 0);
            }
            i = i + 1;
        }
        this.next = i;
        this.time = t;
        this.playing = wasPlaying;
    }

    apply(ev, delay) {
        const a = ev.a;
        const act = ev.act;
        if (act === "section") {
            this.section = a.index;
        } else if (act === "note") {
            const c = this.parts[a.part];
            c.held = [{ note: a.note, velocity: 0.85 }];
            c.velocity = 0.85;
            c.padActive = false;
            c.retarget(true);
        } else if (act === "off") {
            this.parts[a.part].allNotesOff();
        } else if (act === "set") {
            const c = this.parts[a.part];
            if (a.name === "tuning") {
                for (let k = 0; k < c.members.length; k = k + 1) {
                    if (c.members[k].cfg.register !== "ventricular" || a.value !== "gyuto") {
                        c.members[k].cfg.tuning = a.value;
                        c.members[k].singer.tuning = a.value;
                        if (a.value === "overtone" || a.value === "sygyt") {
                            c.members[k].singer.harmonic = c.harmonic;
                        }
                    }
                }
            } else {
                c.setGlobal(a.name, a.value);
            }
        } else if (act === "voice") {
            const singer = this.parts[a.part].members[a.index].singer;
            if (a.glide !== undefined) {
                singer.glideRate = 1.0 / Math.max(a.glide, 0.002);
            }
            singer.noteOn(a.note, 0.85);
        } else if (act === "voiceOff") {
            this.parts[a.part].members[a.index].singer.noteOff();
        } else if (act === "voiceSet") {
            this.parts[a.part].members[a.index].singer[VOICE_FIELDS[a.name]] = a.value;
        } else if (act === "env") {
            const singer = this.parts[a.part].members[a.index].singer;
            singer.attack = a.attack;
            singer.release = a.release;
        } else if (act === "orbit") {
            const c = this.parts[a.part];
            const m = c.members[a.index];
            m.cfg.oscRate = a.rate;
            m.cfg.oscDepth = a.depth;
            m.cfg.oscRound = a.round;
            m.cfg.oscShape = a.shape;
            c.applyOscillator(m.singer, m.cfg);
            if (a.phase !== undefined) {
                m.singer.oscPhase = a.phase;
            }
        } else if (act === "overtone") {
            const c = this.parts.solo;
            c.harmonic = a.harmonic;
            const singer = c.members[0].singer;
            singer.harmonic = a.harmonic;
            singer.noteOn(a.drone, 0.85);
        } else if (act === "kickTune") {
            this.kick.tailHz = a.hz;
        } else if (act === "dunk") {
            this.dunk.trigger(a.amp, delay);
        } else if (act === "horn") {
            this.horns[a.which].play(a.note, a.level, a.attack, a.growl);
        } else if (act === "hornStop") {
            this.horns[a.which].stop(a.release);
        } else if (act === "hornBend") {
            this.horns[a.which].bend(a.note);
        } else if (act === "gya") {
            this.gyas[a.which].note(a.note, a.level, a.grace, a.graceDur);
        } else if (act === "gyaStop") {
            this.gyas[a.which].stop(0.15);
        } else if (act === "conch") {
            this.conch.call(a.note, a.level, a.seconds);
        } else if (act === "kang") {
            this.kangling.call(a.note, a.level, a.seconds);
        } else if (act === "rolmo") {
            this.rolmo.strike(a.amp, a.bright, delay);
        } else if (act === "nga") {
            this.nga.strike(a.amp, delay);
        } else if (act === "bell") {
            this.bell.strike(a.amp, delay);
        } else if (act === "kick") {
            this.kick.trigger(a.amp, delay);
            this.kickOffsets.push(delay);
        } else if (act === "snare") {
            this.snare.trigger(a.amp, delay);
        } else if (act === "hat") {
            this.hats.hit(a.amp, a.open, delay);
        } else if (act === "sub") {
            if (a.level > 0.0) {
                this.sub.play(a.note - 12, a.level);
            } else {
                this.sub.stop();
            }
        } else if (act === "riser") {
            this.riser.rise(a.seconds, a.amp);
        } else if (act === "impact") {
            this.riser.impact(a.amp);
        } else if (act === "end") {
            this.ended = true;
            this.playing = false;
        }
    }

    process(outL, outR, n) {
        let done = 0;
        while (done < n) {
            const m = Math.min(64, n - done);
            this.processChunk(outL, outR, done, m);
            done = done + m;
        }
    }

    ritualInHall(rl, rr, m) {
        this.parts.monks.renderDry(rl, rr, 0, m);

        this.parts.upper.renderDry(rl, rr, 0, m);
        this.parts.solo.renderDry(rl, rr, 0, m);
        this.horns[0].render(rl, rr, 0, m, 0.9, 0.55);
        this.horns[1].render(rl, rr, 0, m, 0.55, 0.9);
        this.gyas[0].render(rl, rr, 0, m, 0.85, 0.5);
        this.gyas[1].render(rl, rr, 0, m, 0.5, 0.85);
        this.conch.render(rl, rr, 0, m, 0.75, 0.65);
        this.kangling.render(rl, rr, 0, m, 0.6, 0.8);
        this.rolmo.render(rl, rr, 0, m);
        this.nga.render(rl, rr, 0, m);
        this.bell.render(rl, rr, 0, m);
        for (let i = 0; i < m; i = i + 1) {
            rl[i] = rl[i] * 0.28;
            rr[i] = rr[i] * 0.28;
        }
        this.hall.process(rl, rr, m);

    }

    ritualInRoom(rl, rr, m) {
        const seats = this.room.seats;
        for (let k = 0; k < seats.length; k = k + 1) {
            seats[k].input.fill(0.0, 0, m);
        }
        const l = this.srcL;
        const r = this.srcR;
        l.fill(0.0);
        r.fill(0.0);
        const g = 0.28 * this.roomGain * 0.7071;
        this.parts.monks.renderDry(l, r, 0, m); this.toSeat(0, m, g);
        this.parts.upper.renderDry(l, r, 0, m); this.toSeat(1, m, g);
        this.parts.solo.renderDry(l, r, 0, m); this.toSeat(2, m, g);
        this.horns[0].render(l, r, 0, m, 1.0, 1.0); this.toSeat(3, m, g);
        this.horns[1].render(l, r, 0, m, 1.0, 1.0); this.toSeat(4, m, g);
        this.gyas[0].render(l, r, 0, m, 1.0, 1.0); this.toSeat(5, m, g);
        this.gyas[1].render(l, r, 0, m, 1.0, 1.0); this.toSeat(6, m, g);
        this.rolmo.render(l, r, 0, m); this.toSeat(7, m, g);
        this.nga.render(l, r, 0, m); this.toSeat(8, m, g);
        this.bell.render(l, r, 0, m);
        this.conch.render(l, r, 0, m, 1.0, 1.0);
        this.kangling.render(l, r, 0, m, 1.0, 1.0);
        this.toSeat(9, m, g);
        this.room.process(rl, rr, m, 0);
    }

    processChunk(outL, outR, offset, m) {
        const sr = this.sr;
        if (this.playing) {
            const end = this.time + m / sr;
            while (this.next < this.events.length && this.events[this.next].t < end) {
                const ev = this.events[this.next];
                let delay = Math.round((ev.t - this.time) * sr);
                if (delay < 0) {
                    delay = 0;
                }
                this.apply(ev, delay);
                this.next = this.next + 1;
            }
            this.time = end;
        }
        const rl = this.ritualL;
        const rr = this.ritualR;
        const dl = this.dropL;
        const dr = this.dropR;
        const bl = this.bassL;
        const br = this.bassR;
        rl.fill(0.0, 0, m); rr.fill(0.0, 0, m);
        dl.fill(0.0, 0, m); dr.fill(0.0, 0, m);
        bl.fill(0.0, 0, m); br.fill(0.0, 0, m);
        // sidechain envelope from the kick
        for (let i = 0; i < m; i = i + 1) {
            for (let k = 0; k < this.kickOffsets.length; k = k + 1) {
                if (this.kickOffsets[k] === i) {
                    this.sinceKick = 0.0;
                }
            }
            this.duck[i] = 1.0 - 0.75 * Math.exp(-this.sinceKick / (0.13 * sr));
            this.sinceKick = this.sinceKick + 1.0;
        }
        // shift pending kick offsets into the next chunk, compacting in place
        let keep = 0;
        for (let k = 0; k < this.kickOffsets.length; k = k + 1) {
            const v = this.kickOffsets[k] - m;
            if (v >= 0) {
                this.kickOffsets[keep] = v;
                keep = keep + 1;
            }
        }
        this.kickOffsets.length = keep;

        if (this.room !== null) {
            this.ritualInRoom(rl, rr, m);
        } else {
            this.ritualInHall(rl, rr, m);
        }
        // drop bus: throat bass (saturated, ducked), sub, kit, riser
        this.parts.bass.renderDry(bl, br, 0, m);
        for (let i = 0; i < m; i = i + 1) {
            const x = 0.5 * (bl[i] + br[i]) * 0.35;
            const y = (0.55 * x + 0.45 * softSaturate(x, 3.5)) * this.duck[i];
            dl[i] = dl[i] + y;
            dr[i] = dr[i] + y;
        }
        this.sub.render(dl, dr, 0, m, this.duck);
        this.kick.render(dl, dr, 0, m);
        this.snare.render(dl, dr, 0, m);
        this.hats.render(dl, dr, 0, m);
        this.riser.render(dl, dr, 0, m);
        this.dunk.render(dl, dr, 0, m);

        // master: sum, slow peak follower for gentle glue, soft clip
        for (let i = 0; i < m; i = i + 1) {
            let l = (rl[i] + dl[i]) * this.master;
            let r = (rr[i] + dr[i]) * this.master;
            const peak = Math.max(Math.abs(l), Math.abs(r));
            if (peak > this.envFollow) {
                this.envFollow = this.envFollow + (peak - this.envFollow) * 0.02;
            } else {
                this.envFollow = this.envFollow * 0.99995;
            }
            let g = 1.0;
            if (this.envFollow > 0.6) {
                g = Math.pow(0.6 / this.envFollow, 0.6);
            }
            l = l * g;
            r = r * g;
            outL[offset + i] = Math.tanh(l);
            outR[offset + i] = Math.tanh(r);
        }
    }

    telemetry() {
        const parts = {};
        for (let i = 0; i < PART_NAMES.length; i = i + 1) {
            parts[PART_NAMES[i]] = this.parts[PART_NAMES[i]].telemetry();
        }
        return {
            time: this.time,
            section: this.section,
            playing: this.playing,
            ended: this.ended,
            parts: parts,
            inst: {
                horn0: this.horns[0].level, horn1: this.horns[1].level,
                gya0: this.gyas[0].level, gya1: this.gyas[1].level,
                conch: this.conch.level, kang: this.kangling.level,
                rolmo: this.rolmo.level, nga: this.nga.level, bell: this.bell.level,
                kick: this.kick.level, snare: this.snare.level, hat: this.hats.level,
                sub: this.sub.level, riser: this.riser.level, dunk: this.dunk.level
            }
        };
    }
}
