// "Steppe Cycle": a suite of throat-singing styles for physical voices, a
// jaw harp, a two-string lute and a frame drum. About five minutes, D.
//
// The idea. In Tuvan and Mongolian throat singing one body sounds two lines:
// a steady drone and a melody made of that drone's own harmonics, chosen by
// how the mouth is shaped. Over a D3 drone (147 Hz) harmonics 6, 8, 9, 10,
// 12 and 16 are A5, D6, E6, F#6, A6 and D7: a major pentatonic that is
// already inside the voice. Every melody here lives on those harmonics, and
// each section shows a different way of choosing them:
//   khöömei      the tongue listens to one resonance and moves it (feedback)
//   ezengileer   the same, with the lips rounding in a galloping triple pulse
//   dumchuktaar  lips sealed, the voice through the nose, tuned from the
//                singer's map of its own mouth (the hidden cavity moves the
//                peaks)
//   borbangnadyr the tongue rocks between two neighbouring harmonics
//   sygyt        two narrowings of the tongue (as MRI of Tuvan singers shows)
//                merge two resonances into one whistle 15-27 dB above its
//                neighbours
//   kargyraa     the false folds lock onto every second cycle of the vocal
//                folds by themselves (the self-oscillating larynx) and the
//                vowel walks onto harmonics of that sub-octave
//   khomus       the jaw harp is the same mechanism with a steel reed for a
//                glottis: a fixed buzz whose harmonics the mouth chooses
// The melodies and rhythms are original. The lute (doshpuluur) and drum
// (tungur) are signal models, not physical models; the voices are tubes.

import { makeSingerConfig } from "../choir.js?v=4bc8bf7bb1";
import { Score } from "./common.js?v=036c2aecc9";
import * as K from "./throatkit.js?v=8184da9860";

const DRONE = 50;        // D3: the overtone singers' drone
const KARGYRAA = 38;     // D2: the kargyraa (folds lock 70-150 Hz; D2 is 73 Hz)
const KHOMUS = 45;       // A2: the jaw harp's reed
const LUTE_LOW = 38;     // lute courses tuned D2 and A2

const GALLOP_BEAT = 0.45;   // 133 gallops a minute
const FAST_BEAT = 0.4;      // 150 in the last ride

// Section starts (seconds).
const T_WIND = 0.0;
const T_KHOOMEI = 38.0;
const T_GALLOP = 82.0;
const T_NASAL = 140.0;
const T_ROLL = 180.0;
const T_SYGYT = 224.0;
const T_RETURN = 284.0;
const LENGTH = 314.0;

export const SECTIONS = [
    { name: "Wind", start: T_WIND, text: "The lute sounds its open strings, D and A. The jaw harp enters: a steel reed buzzing at a fixed pitch in front of the mouth, its melody chosen by the mouth's shape. A kargyraa singer joins: his false folds lock onto every second cycle of his vocal folds by themselves, so a D2 voice sounds an octave lower again; he breathes when he must." },
    { name: "Khöömei", start: T_KHOOMEI, text: "One baritone on D3. His tongue listens to the second resonance of his mouth and moves it onto a harmonic of his own drone: A, D, E, F# and A again, the pentatonic that the harmonic series already contains. The lute answers each phrase." },
    { name: "Ezengileer", start: T_GALLOP, text: "The stirrup: the drum gallops, long-short-short, and the singer's lips round three times on every beat in the same rhythm, so the whistle pulses like hooves. A second singer joins a third below, tuning with his lips instead of his tongue." },
    { name: "Dumchuktaar", start: T_NASAL, text: "Lips sealed, velum open: the voice leaves through the nose. The tongue reshapes the closed mouth behind the lips as a side cavity, and the singer picks the shape where the wanted harmonic stands out from his own map of his mouth. The jaw harp answers." },
    { name: "Borbangnadyr", start: T_ROLL, text: "The rolling style: the tongue rocks between two neighbouring harmonics about seven times a second. Then three singers, three gestures (tongue, lips, nose), sing one descending line in canon on one drone, each two steps behind the last; where a gesture cannot reach a harmonic it sings its neighbour instead." },
    { name: "Sygyt", start: T_SYGYT, text: "The whistle. Two narrowings of the tongue, one at the ridge behind the teeth and one at the back, merge two resonances into one peak; the neighbouring harmonics fall 15 to 27 dB below. The line climbs to the 16th harmonic, D7, over the faster gallop, with the kargyraa walking its vowels below." },
    { name: "Return", start: T_RETURN, text: "The gallop stops. The whistle settles onto the 12th harmonic and then the 8th, the kargyraa takes a last breath and the lute's open strings ring out." }
];

// ------------------------------------------------------------------ melodies
// [harmonic, seconds] over the D3 drone; 0 holds.

const KHOOMEI_LINE = [
    [8, 1.6], [9, 0.8], [10, 1.6], [9, 0.8], [8, 1.2], [6, 2.4],
    [8, 1.0], [10, 1.0], [12, 2.0], [10, 0.8], [9, 0.8], [8, 2.4],
    [9, 1.2], [10, 0.6], [9, 0.6], [8, 1.2], [6, 1.2], [8, 3.0]
];

// in gallop beats
const GALLOP_LINE = [
    [10, 2], [12, 2], [10, 1], [9, 1], [8, 2],
    [9, 2], [10, 2], [9, 1], [8, 1], [6, 2],
    [8, 1], [9, 1], [10, 2], [12, 2], [10, 2],
    [9, 1], [8, 1], [9, 2], [8, 4]
];

// the lower voice of the pair: a third (or a fourth) below
const GALLOP_LOW = [
    [8, 2], [10, 2], [8, 1], [7, 1], [6, 2],
    [7, 2], [8, 2], [7, 1], [6, 1], [5, 2],
    [6, 1], [7, 1], [8, 2], [10, 2], [8, 2],
    [7, 1], [6, 1], [7, 2], [6, 4]
];

// through the nose: harmonics 5-11 are what the nasal gesture reaches
const NASAL_LINE = [
    [6, 1.4], [8, 1.4], [9, 0.7], [8, 0.7], [6, 1.4], [5, 2.1],
    [6, 0.7], [8, 0.7], [9, 1.4], [10, 1.4], [9, 0.7], [8, 2.1],
    [10, 1.4], [9, 0.7], [8, 0.7], [6, 1.4], [8, 2.8]
];

const ROLL_LINE = [
    [8, 2.0], [9, 1.0], [10, 2.0], [9, 1.0], [8, 2.5], [6, 1.5],
    [9, 2.0], [10, 1.0], [12, 2.5], [10, 1.5], [9, 1.0], [8, 3.0]
];

// the canon: one line, each voice two steps behind the last
const CANON_LINE = [12, 12, 10, 10, 9, 9, 8, 8, 6, 6, 8, 9, 10, 10, 9, 8];
const CANON_STEP = 1.1;

// in fast-gallop beats
const SYGYT_LINE = [
    [12, 2], [16, 2], [15, 1], [16, 1], [12, 2],
    [10, 2], [12, 2], [15, 2], [16, 2],
    [16, 1], [15, 1], [12, 2], [10, 2], [9, 2],
    [8, 2], [9, 1], [10, 1], [12, 4],
    [12, 2], [16, 4], [15, 1], [12, 1], [16, 4],
    [12, 2], [10, 2], [9, 2], [8, 2], [12, 4], [16, 4]
];

// kargyraa vowel walk: harmonics of the sub-octave (D1, 37 Hz); the even
// ones are also harmonics of the sung D2 and ring strongest
const WALK = [[6, 2.4], [8, 2.4], [10, 1.6], [8, 1.6], [6, 2.4], [7, 1.2], [8, 3.0]];

// jaw harp figures: [harmonic of A2, plucks]; it plucks in long-short-short
const KHOMUS_FIGURES = [[8, 3], [9, 3], [10, 3], [8, 3], [12, 3], [10, 3], [9, 3], [8, 6]];

// lute answers: [pitch, seconds]
const LUTE_ANSWER_A = [[62, 0.4], [64, 0.4], [66, 0.8], [64, 0.4], [62, 1.4]];
const LUTE_ANSWER_B = [[69, 0.4], [66, 0.4], [64, 0.4], [62, 0.4], [57, 1.6]];
const LUTE_ANSWER_C = [[57, 0.4], [62, 0.4], [64, 0.8], [66, 0.4], [69, 0.4], [66, 1.4]];

// ------------------------------------------------------------------ writers

// A melody of [harmonic, beats] at a beat length, for one singer.
function beatMelody(s, t0, part, index, line, beatSec) {
    const steps = [];
    for (let i = 0; i < line.length; i = i + 1) {
        steps.push([line[i][0], line[i][1] * beatSec]);
    }
    return K.overtoneMelody(s, t0, part, index, steps);
}

// The jaw harp: plucks long-short-short, a harmonic per figure.
function khomusRun(s, t0, beats, beatSec, figures, amp) {
    let t = t0;
    let f = 0;
    let left = figures[0][1];
    const end = t0 + beats * beatSec;
    let k = 0;
    while (t < end - 0.01) {
        if (left === figures[f][1]) {
            K.harmonic(s, t - 0.005, "upper", 0, figures[f][0]);
        }
        const sub = k % 3;
        let gap = beatSec * 0.5;
        if (sub !== 0) {
            gap = beatSec * 0.25;
        }
        K.voice(s, t, "upper", 0, KHOMUS);
        K.off(s, t + 0.05, "upper", 0);
        t = t + gap;
        k = k + 1;
        left = left - 1;
        if (left <= 0) {
            f = (f + 1) % figures.length;
            left = figures[f][1];
        }
    }
    return t;
}

// Open strings of the lute, slowly, with a tremolo now and then.
function luteOpen(s, t0, seconds, amp) {
    let t = t0;
    let k = 0;
    while (t < t0 + seconds) {
        s.at(t, "trigger", "pluck", { note: LUTE_LOW, amp: amp, pan: 0.4 });
        s.at(t + 0.03, "trigger", "pluck", { note: LUTE_LOW + 7, amp: amp * 0.8, pan: 0.6 });
        if (k % 3 === 2) {
            for (let j = 1; j < 10; j = j + 1) {
                s.at(t + 0.6 + j * 0.1, "trigger", "pluck", { note: LUTE_LOW + 7, amp: amp * 0.3, pan: 0.6 });
            }
        }
        t = t + 2.4 + 0.2 * (k % 2);
        k = k + 1;
    }
}

// The kargyraa: a breath-length vowel walk, repeated, between t0 and t1.
function kargyraa(s, t0, t1, walk) {
    K.voice(s, t0, "bass", 0, KARGYRAA, 0.1);
    let t = t0 + 0.4;
    let i = 0;
    while (t < t1 - 0.5) {
        K.harmonic(s, t, "bass", 0, walk[i % walk.length][0]);
        t = t + walk[i % walk.length][1];
        i = i + 1;
    }
    K.off(s, t1, "bass", 0);
}

// The canon: voice v sings CANON_LINE delayed by 2v steps; the lip and nose
// gestures swap the harmonics they cannot reach for neighbours.
function canon(s, t0) {
    const reachLow = [6, 7, 5];
    const reachHigh = [16, 13, 11];
    for (let v = 0; v < 3; v = v + 1) {
        const start = t0 + 2 * v * CANON_STEP;
        K.voice(s, start - 0.3, "solo", v, DRONE, 0.05);
        for (let i = 0; i < CANON_LINE.length; i = i + 1) {
            let n = CANON_LINE[i];
            if (n < reachLow[v]) {
                n = reachLow[v] + 1;
            }
            if (n > reachHigh[v]) {
                n = reachHigh[v] - 1;
            }
            K.harmonic(s, start + i * CANON_STEP, "solo", v, n);
        }
        K.off(s, start + CANON_LINE.length * CANON_STEP + 0.6, "solo", v);
    }
    return t0 + (CANON_LINE.length + 4) * CANON_STEP + 0.6;
}

// ------------------------------------------------------------------ score

export function buildScore() {
    const s = new Score();
    for (let i = 0; i < SECTIONS.length; i = i + 1) {
        K.section(s, SECTIONS[i].start, i);
    }

    // Wind: lute, jaw harp, kargyraa
    luteOpen(s, T_WIND + 0.5, 34.0, 0.55);
    khomusRun(s, T_WIND + 7.0, 40, 0.75, KHOMUS_FIGURES, 0.8);
    kargyraa(s, T_WIND + 18.0, T_KHOOMEI + 6.0, WALK);

    // Khöömei: a free melody in three phrases, a breath between them
    K.setSinger(s, T_KHOOMEI - 0.5, "solo", 0, "tuning", "overtone");
    let t = T_KHOOMEI + 1.0;
    const phrases = [[0, 6], [6, 12], [12, 18]];
    const answers = [LUTE_ANSWER_A, LUTE_ANSWER_B, LUTE_ANSWER_C];
    for (let p = 0; p < phrases.length; p = p + 1) {
        K.harmonic(s, t - 0.02, "solo", 0, KHOOMEI_LINE[phrases[p][0]][0]);
        K.voice(s, t, "solo", 0, DRONE, 0.05);
        const end = K.overtoneMelody(s, t, "solo", 0, KHOOMEI_LINE.slice(phrases[p][0], phrases[p][1]));
        K.off(s, end, "solo", 0);
        K.luteMelody(s, end + 0.3, answers[p], LUTE_LOW + 12, 0.6);
        t = end + 4.2;
    }
    luteOpen(s, T_KHOOMEI + 32.0, 10.0, 0.4);

    // Ezengileer: gallop on drum and lute, the stirrup ornament, a second
    // singer a third below
    const gallopBeats = Math.round((T_NASAL - T_GALLOP - 2.0) / GALLOP_BEAT);
    K.gallop(s, T_GALLOP, gallopBeats, GALLOP_BEAT, 0.55);
    K.luteGallop(s, T_GALLOP + 8 * GALLOP_BEAT, gallopBeats - 8, GALLOP_BEAT, LUTE_LOW, 0.5);
    // ezengileer is usually sung over a sygyt whistle: the focus gesture,
    // with the lips pulsing on top of it
    K.setSinger(s, T_GALLOP + 8 * GALLOP_BEAT - 0.5, "solo", 0, "tuning", "focus");
    K.setSinger(s, T_GALLOP + 8 * GALLOP_BEAT - 0.02, "solo", 0, "ornament", "gallop");
    K.setSinger(s, T_GALLOP + 8 * GALLOP_BEAT - 0.02, "solo", 0, "ornRate", 1.0 / GALLOP_BEAT);
    K.setSinger(s, T_GALLOP + 8 * GALLOP_BEAT - 0.02, "solo", 0, "ornDepth", 0.5);
    let g = T_GALLOP + 8 * GALLOP_BEAT;
    K.harmonic(s, g - 0.02, "solo", 0, GALLOP_LINE[0][0]);
    K.voice(s, g, "solo", 0, DRONE, 0.05);
    g = beatMelody(s, g, "solo", 0, GALLOP_LINE, GALLOP_BEAT);
    K.off(s, g, "solo", 0);
    // breath, then the pair
    g = g + 2 * GALLOP_BEAT;
    K.voice(s, g, "solo", 0, DRONE, 0.05);
    K.voice(s, g, "solo", 1, DRONE, 0.05);
    K.harmonic(s, g - 0.02, "solo", 1, GALLOP_LOW[0][0]);
    const g1 = beatMelody(s, g, "solo", 0, GALLOP_LINE, GALLOP_BEAT);
    beatMelody(s, g, "solo", 1, GALLOP_LOW, GALLOP_BEAT);
    K.off(s, g1, "solo", 0);
    K.off(s, g1, "solo", 1);
    K.setSinger(s, g1 + 0.5, "solo", 0, "ornament", "none");
    khomusRun(s, g1 + 0.2, Math.max(0, Math.round((T_NASAL - g1 - 1.0) / GALLOP_BEAT)), GALLOP_BEAT, KHOMUS_FIGURES, 0.8);

    // Dumchuktaar: quiet, the voice through the nose, the jaw harp answers
    K.walk(s, T_NASAL, 72, 0.55, 0.45, 4);
    let n = T_NASAL + 2.0;
    const nasalPhrases = [[0, 6], [6, 12], [12, 17]];
    for (let p = 0; p < nasalPhrases.length; p = p + 1) {
        K.harmonic(s, n - 0.02, "solo", 2, NASAL_LINE[nasalPhrases[p][0]][0]);
        K.voice(s, n, "solo", 2, DRONE, 0.05);
        const end = K.overtoneMelody(s, n, "solo", 2, NASAL_LINE.slice(nasalPhrases[p][0], nasalPhrases[p][1]));
        K.off(s, end, "solo", 2);
        if (p < 2) {
            khomusRun(s, end + 0.4, 8, 0.55, [[8 + 2 * p, 3], [9 + p, 3], [8, 2]], 0.7);
        }
        n = end + 5.0;
    }

    // Borbangnadyr: the rolling trill, then the three-gesture canon
    K.walk(s, T_ROLL, 40, 0.5, 0.4, 4);
    K.setSinger(s, T_ROLL - 0.6, "solo", 0, "tuning", "overtone");
    K.setSinger(s, T_ROLL - 0.5, "solo", 0, "ornament", "trill");
    K.setSinger(s, T_ROLL - 0.5, "solo", 0, "ornRate", 7.0);
    K.setSinger(s, T_ROLL - 0.5, "solo", 0, "ornDepth", 0.8);
    K.harmonic(s, T_ROLL + 0.5, "solo", 0, ROLL_LINE[0][0]);
    K.voice(s, T_ROLL + 0.5, "solo", 0, DRONE, 0.05);
    const rEnd = K.overtoneMelody(s, T_ROLL + 0.5, "solo", 0, ROLL_LINE);
    K.off(s, rEnd, "solo", 0);
    K.setSinger(s, rEnd + 0.4, "solo", 0, "ornament", "none");
    const cEnd = canon(s, rEnd + 2.0);
    K.luteMelody(s, cEnd - 4.0, LUTE_ANSWER_C, LUTE_LOW + 12, 0.5);

    // Sygyt: the focus gesture over the faster gallop; kargyraa below. The
    // kargyraa's dense harmonics and the lute sit on the whistle's own
    // harmonics (all are harmonics of D), so they step back and the whistle
    // forward, the lute softer and darker (measured: 21 dB over its neighbours
    // alone, 5 dB in the first balance, the lute the main masker).
    K.setSinger(s, T_SYGYT - 0.5, "solo", 0, "tuning", "focus");
    K.setSinger(s, T_SYGYT - 0.5, "solo", 0, "level", 3.8);
    K.setSinger(s, T_SYGYT - 0.5, "bass", 0, "level", 0.7);
    K.setSinger(s, T_RETURN + 9.0, "bass", 0, "level", 1.5);
    const fastBeats = Math.round((T_RETURN - T_SYGYT) / FAST_BEAT);
    K.gallop(s, T_SYGYT, fastBeats, FAST_BEAT, 0.6);
    K.luteGallop(s, T_SYGYT + 4 * FAST_BEAT, fastBeats - 4, FAST_BEAT, LUTE_LOW, 0.2);
    kargyraa(s, T_SYGYT + 2.0, T_RETURN + 8.0, [[6, 1.6], [8, 1.6], [10, 0.8], [12, 0.8], [10, 1.6], [8, 1.6], [6, 3.2]]);
    let w = T_SYGYT + 8 * FAST_BEAT;
    K.harmonic(s, w - 0.02, "solo", 0, SYGYT_LINE[0][0]);
    K.voice(s, w, "solo", 0, DRONE, 0.05);
    w = beatMelody(s, w, "solo", 0, SYGYT_LINE, FAST_BEAT);
    // the jaw harp doubles the gallop under the second half
    khomusRun(s, T_SYGYT + 34 * FAST_BEAT, 60, FAST_BEAT, KHOMUS_FIGURES, 0.8);
    // the second singer returns with his lips for the last climb
    K.voice(s, w - 16 * FAST_BEAT, "solo", 1, DRONE, 0.05);
    K.harmonic(s, w - 16 * FAST_BEAT - 0.02, "solo", 1, 8);
    beatMelody(s, w - 16 * FAST_BEAT, "solo", 1, [[8, 4], [10, 4], [9, 4], [12, 4]], FAST_BEAT);
    K.off(s, w, "solo", 1);

    // Return: the whistle settles, the lute rings out
    K.harmonic(s, T_RETURN + 1.0, "solo", 0, 12);
    K.harmonic(s, T_RETURN + 9.0, "solo", 0, 8);
    K.off(s, T_RETURN + 17.0, "solo", 0);
    luteOpen(s, T_RETURN + 4.0, 20.0, 0.45);
    s.at(LENGTH - 0.2, "state", "end", {});

    s.events.sort(K.compareTime);
    return s.events;
}

// ------------------------------------------------------------------ parts

export function partConfigs() {
    const upper = [
        // the jaw harp: a steel reed at A2 in front of a baritone's mouth,
        // the lips choosing harmonics; plucked (fast attack, ringing release)
        Object.assign(makeSingerConfig("baritone", "reed", 0), { octave: 0, tuning: "labial", vibratoDepth: 0.0, driftCents: 0.0, effort: 0.9, level: 1.4, pan: 0.45, attack: 0.002, release: 0.45 })
    ];
    const solo = [
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "overtone", press: 0.6, vibratoDepth: 0.0, driftCents: 1.0, effort: 0.88, epilarynx: 0.6, level: 2.4, pan: 0.0, attack: 0.25, release: 0.35 }),
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "labial", press: 0.5, vibratoDepth: 0.0, driftCents: 1.5, effort: 0.85, level: 2.4, pan: -0.35, lengthScale: 1.03, attack: 0.25, release: 0.35 }),
        Object.assign(makeSingerConfig("bass", "pressed", 0), { octave: 0, tuning: "nasal", press: 0.5, vibratoDepth: 0.0, driftCents: 1.5, effort: 0.85, level: 3.0, pan: 0.35, attack: 0.3, release: 0.4 })
    ];
    const bass = [
        Object.assign(makeSingerConfig("bass", "ventricular", 0), { octave: 0, tuning: "vowel", ventRatio: 2, press: 0.3, larynx: -0.4, larynxModel: "folds", vibratoDepth: 0.0, driftCents: 1.0, effort: 0.9, level: 1.5, pan: 0.0, phrase: 9.0, breathGap: 0.9, attack: 0.3, release: 0.5 })
    ];
    return { monks: [], upper: upper, solo: solo, bass: bass };
}

export const STEPPE = {
    id: "steppe",
    title: "Steppe Cycle",
    sections: SECTIONS,
    length: LENGTH,
    grid: T_GALLOP,
    bar: 4.0 * GALLOP_BEAT,
    bassInRoom: true,
    stageInstruments: ["tungur", "lute"],
    buildScore: buildScore,
    partConfigs: partConfigs,
    setup: function setupSteppe(engine) {
        engine.parts.solo.setGlobal("glide", 0.04);
        engine.parts.upper.setGlobal("glide", 0.01);
        engine.parts.bass.setGlobal("glide", 0.1);
        // outdoors, or a felt yurt: a short, dry space
        engine.hall.mix = 0.16;
        engine.hall.setTime(1.4, 0.55);
    },
    rollLabels: {
        upper0: "Khomus (jaw harp)", over: "Khöömei / sygyt", over1: "Labial khöömei", over2: "Nasal khöömei",
        drone: "Their drone (D3)", bass0: "Kargyraa", lute: "Doshpuluur (lute)"
    },
    warmSpots: [9.0, 22.0, T_KHOOMEI + 3.0, T_GALLOP + 6.0, T_NASAL + 4.0, T_ROLL + 3.0, T_ROLL + 26.0, T_SYGYT + 6.0, T_RETURN + 3.0]
};
