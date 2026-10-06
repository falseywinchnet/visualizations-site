// "Fugue in C minor for throats": a five-minute fugue for physical monks,
// an overtone singer, upper voices, three throat basses and the ritual
// instruments, over a 140 BPM half-time grid.
//
// Everything grows from one original subject (two bars, C minor):
//   C G Ab-G F-Eb F-Eb D-C B C
// handled with the old devices: real answer at the fifth, a countersubject
// written against it, episodes that walk the circle of fifths with the
// subject's head, stretto at the octave one bar apart (checked consonant),
// augmentation into a chanted cantus firmus, inversion, a canon between
// chant and throat, four-part chorales harmonized by search, dominant and
// tonic pedals, and a Picardy close whose major third is the singer's own
// fifth harmonic.
//
// The bass drops borrow general bass-music technique, not any track's
// notes: call-and-response phrases, switching timbres within a bar
// (here three different throats rather than synth patches), pitch dives,
// a short "dunk" transient around 200 Hz at the head of each call, and
// syncopated gaps over half-time drums. Every bass note is a vocal tract
// running the vowel-space oscillator.
//
// The overtone singer carries two lines at once: for each melody note it
// chooses a drone and a harmonic of it (music.js mapOvertones), preferring
// drones in the current harmony.

import * as M from "../music.js?v=74884be0cf";
import { makeSingerConfig } from "../choir.js?v=1a24f9b503";
import {
    newTracks, append, chordSpan, chordAtBeat, harmonizeBeats, placeEntry, fillVoice,
    sortTrack, Score, MANTRA, orbitFor, rolmoPattern, horn, makeWriters, ORBITS
} from "./common.js?v=036c2aecc9";

export const TEMPO = 140.0;
export const BEAT = 60.0 / TEMPO;
export const BAR = 4.0 * BEAT;
export const PRELUDE = 28.0;   // free time before the grid
const FINALE = 26.0;           // free time after the grid

const KEY = M.makeKey(0, "minor");
const KEY_G = M.makeKey(7, "minor");
const KEY_EB = M.makeKey(3, "major");
const KEY_F = M.makeKey(5, "minor");

function at(beat) {
    return PRELUDE + beat * BEAT;
}

const W = makeWriters(at);

// ------------------------------------------------------------------ material

export const SUBJECT = M.lineFrom([[60, 1], [67, 1], [68, 0.5], [67, 0.5], [65, 0.5], [63, 0.5], [65, 0.5], [63, 0.5], [62, 0.5], [60, 0.5], [59, 1], [60, 1]]);
export const ANSWER = M.transposeLine(SUBJECT, 7);
export const COUNTER = M.lineFrom([[63, 1], [65, 1], [67, 1], [68, 1], [63, 1], [60, 1], [62, 1], [58, 1]]);
const HEAD = M.lineFrom([[60, 1], [67, 1], [68, 0.5], [67, 0.5], [65, 0.5], [63, 0.5]]); // one bar

// Bar numbers of the grid sections.
export const BARS = {
    expo: 0, episode1: 20, build1: 28, dropA: 36, episode2: 56, chorale: 64,
    develop: 80, build2: 100, dropB: 108, coda: 140, end: 148
};

export const SECTIONS = [
    { name: "Prelude", start: 0.0, text: "Monody over the horns' pedal: the overtone singer states the subject alone, choosing a drone and a harmonic for every note." },
    { name: "Exposition", start: at(BARS.expo * 4), text: "Tenor states the subject; the overtone singer answers at the fifth while the tenor takes the countersubject; then countertenor and alto enter. The monks enter with the subject slowed fourfold as a cantus firmus." },
    { name: "Episode", start: at(BARS.episode1 * 4), text: "The subject's head walks the circle of fifths (i–iv–VII–III–VI–ii°–V–i), the upper voices in canon a beat apart, gyaling doubling." },
    { name: "Stretto", start: at(BARS.build1 * 4), text: "Entries one bar apart at the octave over a dominant pedal: the monks hold G tuned to its harmonics while the cymbal accelerando becomes the snare roll." },
    { name: "Drop I", start: at(BARS.dropA * 4), text: "Call and response between throats: a ventricular basso growls the subject's head, a pressed baritone squeals the answer; fills switch throat every sixteenth. The chant sustains i–VI–iv–V with Gyuto tuning." },
    { name: "Interlude", start: at(BARS.episode2 * 4), text: "The subject upside down: overtone singer and gyaling in canon on the inversion over a sustained, slowly breathing throat drone." },
    { name: "Chorale", start: at(BARS.chorale * 4), text: "Four-part chorale on the subject in augmentation, harmonized by search: C minor, E-flat major, F minor, C minor. The overtone singer descants above." },
    { name: "Development", start: at(BARS.develop * 4), text: "Canon between chant and throat: the monks sing the subject and the bass imitates a bar later. Inversions in the upper voices; the drums return softly." },
    { name: "Stretto II", start: at(BARS.build2 * 4), text: "Every voice enters a bar apart over a tonic pedal; the half tone rises in the monks; silence, then the kangling." },
    { name: "Drop II", start: at(BARS.dropB * 4), text: "A chorale prelude over a drop: the cantus firmus in the monks three times (C, G, C) while three throats trade calls, triplets and dives above it." },
    { name: "Coda", start: at(BARS.coda * 4), text: "Tonic pedal and a last entry; iv–V–I with a Picardy third: the major third is the overtone singer's fifth harmonic, the same harmonic the Gyuto monks tune to." },
    { name: "Dissolution", start: at(BARS.end * 4), text: "The grid lets go: Om, horns rising to their upper partial, the bell three times." }
];

export const LENGTH = at(BARS.end * 4) + FINALE;

// ------------------------------------------------------------------ tracks

const RANGE = { S: [58, 77], A: [53, 66], T: [48, 69], monks: [35, 52], cont: [31, 46] };


export function composeTracks() {
    const tr = newTracks();
    const b0 = BARS.expo * 4;

    // ---- Exposition
    append(tr.T, M.shiftTime(SUBJECT, b0));
    harmonizeBeats(tr, M.shiftTime(SUBJECT, b0), KEY, b0, 8);
    append(tr.over, M.shiftTime(M.transposeLine(ANSWER, 12), b0 + 8));
    append(tr.T, M.shiftTime(COUNTER, b0 + 8));
    harmonizeBeats(tr, M.shiftTime(ANSWER, b0 + 8), KEY_G, b0 + 8, 8);
    placeEntry(tr.S, SUBJECT, b0 + 16, RANGE.S, [tr.T, tr.over], [0, 12]);
    placeEntry(tr.T, M.transposeLine(COUNTER, -7), b0 + 16, RANGE.T, [tr.S], [0, -12, 12]);
    harmonizeBeats(tr, M.shiftTime(SUBJECT, b0 + 16), KEY, b0 + 16, 8);
    fillVoice(tr.over, tr.chords, b0 + 16, 8, 2, [76, 92], [tr.S, tr.T], 79);
    placeEntry(tr.A, ANSWER, b0 + 24, RANGE.A, [], [0, -12]);
    placeEntry(tr.S, COUNTER, b0 + 24, RANGE.S, [tr.A], [0, 12]);
    harmonizeBeats(tr, M.shiftTime(ANSWER, b0 + 24), KEY_G, b0 + 24, 8, 4, 0);
    fillVoice(tr.T, tr.chords, b0 + 24, 8, 2, RANGE.T, [tr.A, tr.S], 55);
    // cantus firmus: the monks sing the subject four times slower (8 bars)
    const cantus = M.shiftTime(M.transposeLine(M.scaleRhythm(SUBJECT, 4), -24), b0 + 32);
    append(tr.monks, cantus);
    const cDeg = M.harmonize(cantus, KEY, 0, 4);
    for (let i = 0; i < cantus.length; i = i + 1) {
        chordSpan(tr, cantus[i].beat, cantus[i].dur, KEY, cDeg[i]);
    }
    append(tr.cont, cantus);
    // above the cantus: entries placed where they sound best
    placeEntry(tr.S, SUBJECT, b0 + 32, RANGE.S, [tr.monks], [0, 12, 7, -5]);
    placeEntry(tr.over, ANSWER, b0 + 40, [72, 96], [tr.monks, tr.S], [12, 24, 5, 17]);
    placeEntry(tr.T, SUBJECT, b0 + 48, RANGE.T, [tr.monks, tr.over], [0, -12, 7, -5]);
    placeEntry(tr.A, SUBJECT, b0 + 56, RANGE.A, [tr.monks, tr.T], [0, -12, 7, -5]);
    fillVoice(tr.A, tr.chords, b0 + 32, 24, 2, RANGE.A, [tr.S, tr.monks, tr.over, tr.T], 60);
    fillVoice(tr.T, tr.chords, b0 + 32, 16, 2, RANGE.T, [tr.S, tr.monks, tr.A], 55);
    fillVoice(tr.S, tr.chords, b0 + 40, 24, 2, RANGE.S, [tr.monks, tr.A, tr.T, tr.over], 67);
    // close of the exposition: iv - V half cadence, held
    const hc = b0 + 64;
    chordSpan(tr, hc, 8, KEY, 3);
    chordSpan(tr, hc + 8, 8, KEY, 4);
    append(tr.monks, [{ beat: hc, dur: 8, pitch: 41 }, { beat: hc + 8, dur: 8, pitch: 43 }]);
    append(tr.cont, [{ beat: hc, dur: 8, pitch: 29 + 12 }, { beat: hc + 8, dur: 8, pitch: 31 + 12 }]);
    append(tr.S, [{ beat: hc, dur: 8, pitch: 68 }, { beat: hc + 8, dur: 8, pitch: 67 }]);
    append(tr.A, [{ beat: hc, dur: 8, pitch: 60 }, { beat: hc + 8, dur: 8, pitch: 62 }]);
    append(tr.T, [{ beat: hc, dur: 8, pitch: 53 }, { beat: hc + 8, dur: 8, pitch: 59 }]);
    append(tr.over, [{ beat: hc, dur: 8, pitch: 77 }, { beat: hc + 8, dur: 8, pitch: 79 }]);

    // ---- Episode 1: circle of fifths with the head motif, canon a beat apart
    const e1 = BARS.episode1 * 4;
    const circle = [0, 3, 6, 2, 5, 1, 4, 0];
    for (let k = 0; k < 8; k = k + 1) {
        const deg = circle[k];
        chordSpan(tr, e1 + 4 * k, 4, KEY, deg);
        const motif = M.shiftTime(M.shiftLine(HEAD, deg, KEY), e1 + 4 * k);
        append(tr.S, M.fitRange(motif, RANGE.S[0], RANGE.S[1]));
        const echo = M.shiftTime(M.fitRange(M.shiftLine(HEAD, deg, KEY), RANGE.T[0], RANGE.T[1]), e1 + 4 * k + 1);
        const trimmed = [];
        for (let i = 0; i < echo.length; i = i + 1) {
            if (echo[i].beat < e1 + 4 * k + 4 - 1e-6) {
                const n = echo[i];
                trimmed.push({ beat: n.beat, dur: Math.min(n.dur, e1 + 4 * k + 4 - n.beat), pitch: n.pitch });
            }
        }
        append(tr.T, trimmed);
        const root = M.pitchOf(deg, 36, KEY);
        tr.monks.push({ beat: e1 + 4 * k, dur: 4, pitch: root });
        tr.cont.push({ beat: e1 + 4 * k, dur: 4, pitch: root - 12 >= 28 ? root - 12 : root });
    }
    fillVoice(tr.A, tr.chords, e1, 32, 2, RANGE.A, [tr.S, tr.T, tr.monks], 60);
    fillVoice(tr.over, tr.chords, e1, 32, 4, [76, 92], [tr.S, tr.A, tr.T, tr.monks], 79);

    // ---- Stretto 1 over a dominant pedal
    const s1 = BARS.build1 * 4;
    chordSpan(tr, s1, 32, KEY, 4);
    tr.monks.push({ beat: s1, dur: 30, pitch: 43 });
    tr.cont.push({ beat: s1, dur: 30, pitch: 43 });
    placeEntry(tr.S, SUBJECT, s1, RANGE.S, [], [0]);
    placeEntry(tr.T, SUBJECT, s1 + 4, RANGE.T, [tr.S], [-12, 0]);
    placeEntry(tr.over, SUBJECT, s1 + 8, [72, 96], [tr.S, tr.T], [12, 24]);
    placeEntry(tr.A, SUBJECT, s1 + 12, RANGE.A, [tr.over, tr.T], [0, -12]);
    placeEntry(tr.S, SUBJECT, s1 + 16, RANGE.S, [tr.A, tr.over], [0, 12]);
    placeEntry(tr.T, SUBJECT, s1 + 20, RANGE.T, [tr.S, tr.A], [-12, 0]);
    // the last bar breathes: everything stops before the drop
    fillVoice(tr.A, tr.chords, s1 + 20, 8, 2, RANGE.A, [tr.S, tr.T], 62);

    // ---- Drop I: i - VI - iv - V, two bars each
    const dA = BARS.dropA * 4;
    const dropDegrees = [0, 0, 5, 5, 3, 3, 4, 4];
    for (let b = 0; b < 20; b = b + 1) {
        const deg = dropDegrees[b % 8];
        chordSpan(tr, dA + 4 * b, 4, KEY, deg);
    }
    for (let b = 0; b < 20; b = b + 2) {
        const deg = dropDegrees[b % 8];
        tr.monks.push({ beat: dA + 4 * b, dur: 8, pitch: M.pitchOf(deg, 36, KEY) });
    }
    fillVoice(tr.T, tr.chords, dA, 80, 8, RANGE.T, [tr.monks], 55);
    fillVoice(tr.A, tr.chords, dA, 80, 8, RANGE.A, [tr.monks, tr.T], 60);
    // the countertenor soars the subject in augmentation over bars 8-11 and 16-19
    placeEntry(tr.S, M.scaleRhythm(SUBJECT, 2), dA + 32, RANGE.S, [tr.monks, tr.A, tr.T], [0, 12]);
    fillVoice(tr.S, tr.chords, dA, 32, 8, RANGE.S, [tr.monks, tr.A, tr.T], 67);
    fillVoice(tr.S, tr.chords, dA + 48, 32, 8, RANGE.S, [tr.monks, tr.A, tr.T], 67);
    // overtone hook: the head motif on the chord root, every two bars
    for (let b = 0; b < 20; b = b + 2) {
        const deg = dropDegrees[b % 8];
        const hook = M.shiftTime(M.shiftLine(HEAD, deg, KEY), dA + 4 * b + 4);
        append(tr.over, M.fitRange(hook, 74, 92));
    }

    // ---- Interlude: inversion in canon (overtones lead, gyaling follow)
    const i2 = BARS.episode2 * 4;
    const inv = M.invertLine(SUBJECT, 67, KEY);
    // harmonize exactly what is sung: the inversion slowed twofold, then at
    // its own speed on G, then once more on C closing to a cadence
    const invSlow = M.shiftTime(M.fitRange(M.scaleRhythm(inv, 2), 74, 92), i2);
    const invG = M.shiftTime(M.fitRange(M.transposeLine(inv, 7), 74, 92), i2 + 16);
    const invC = M.shiftTime(M.fitRange(inv, 74, 92), i2 + 24);
    harmonizeBeats(tr, invSlow, KEY, i2, 16);
    harmonizeBeats(tr, invG, KEY_G, i2 + 16, 8);
    harmonizeBeats(tr, invC, KEY, i2 + 24, 8, 0, 4);
    append(tr.over, invSlow);
    append(tr.over, invG);
    append(tr.over, invC);
    // continuo: a consonant chord tone every half bar under the inversion
    fillVoice(tr.cont, tr.chords, i2, 32, 2, RANGE.cont, [tr.over], 36);

    // ---- Chorale: subject in augmentation, four statements, harmonized
    const ch = BARS.chorale * 4;
    const keys = [KEY, KEY_EB, KEY_F, KEY];
    for (let k = 0; k < 4; k = k + 1) {
        const key = keys[k];
        let melody = M.scaleRhythm(SUBJECT, 2);
        if (k === 1) {
            // up a minor third and re-spelled on the E-flat major scale
            melody = M.scaleRhythm(majorize(M.transposeLine(SUBJECT, 3), KEY_EB), 2);
        } else if (k === 2) {
            melody = M.scaleRhythm(M.transposeLine(SUBJECT, 5), 2);
        }
        melody = M.shiftTime(M.fitRange(melody, 58, 72), ch + 16 * k);
        // one chord per melody note, but merge the eighth-note pairs
        const coarse = [];
        for (let i = 0; i < melody.length; i = i + 1) {
            if (melody[i].dur >= 2 || i % 2 === 0) {
                coarse.push({ beat: melody[i].beat, dur: melody[i].dur >= 2 ? melody[i].dur : 2, pitch: melody[i].pitch });
            }
        }
        const endDeg = k === 1 ? 0 : 0;
        const degs = M.harmonize(coarse, key, endDeg, 4);
        const v = M.voiceChorale(coarse, degs, key, { alto: RANGE.A, tenor: RANGE.T, bass: RANGE.monks });
        append(tr.S, melody);
        append(tr.A, v.alto);
        append(tr.T, v.tenor);
        append(tr.monks, v.bass);
        append(tr.cont, v.bass);
        for (let i = 0; i < coarse.length; i = i + 1) {
            chordSpan(tr, coarse[i].beat, coarse[i].dur, key, degs[i]);
        }
        if (k === 1 || k === 3) {
            append(tr.over, M.fitRange(M.transposeLine(melody, 12), 76, 92));
        }
    }

    // ---- Development: canon between chant and throat, inversions above
    const dv = BARS.develop * 4;
    const chant = M.shiftTime(M.transposeLine(M.scaleRhythm(SUBJECT, 2), -24), dv);
    const chant2 = M.shiftTime(M.transposeLine(M.scaleRhythm(M.shiftLine(SUBJECT, 3, KEY), 2), -24), dv + 32);
    const chant3 = M.shiftTime(M.transposeLine(M.scaleRhythm(SUBJECT, 2), -17), dv + 64);
    append(tr.monks, M.fitRange(chant, 35, 52));
    append(tr.monks, M.fitRange(chant2, 35, 52));
    append(tr.monks, M.fitRange(chant3, 35, 52));
    const mDeg = M.harmonize(tr.monks.filter(function inDev(n) { return n.beat >= dv && n.beat < dv + 80; }), KEY, 4, undefined);
    let mi = 0;
    for (let i = 0; i < tr.monks.length; i = i + 1) {
        const n = tr.monks[i];
        if (n.beat >= dv && n.beat < dv + 80) {
            chordSpan(tr, n.beat, n.dur, KEY, mDeg[mi]);
            mi = mi + 1;
        }
    }
    // the throat imitates the chant two bars later (a full subject length of
    // the original, the offset that tested clean), an octave below
    const devMonks = tr.monks.filter(function inDev2(n) { return n.beat >= dv && n.beat < dv + 72; });
    append(tr.cont, M.shiftTime(M.transposeLine(devMonks, -12), 8));
    const low = [tr.monks, tr.cont];
    placeEntry(tr.over, M.invertLine(SUBJECT, 67, KEY), dv + 8, [72, 96], low, [12, 24, 5, 17, 7, 19]);
    placeEntry(tr.S, M.invertLine(SUBJECT, 67, KEY), dv + 24, RANGE.S, low.concat([tr.over]), [0, -12, 7, 5, -5]);
    placeEntry(tr.T, SUBJECT, dv + 40, RANGE.T, low.concat([tr.S]), [0, -12, 7, -5, 5]);
    placeEntry(tr.over, ANSWER, dv + 48, [72, 96], low.concat([tr.T]), [12, 24, 5, 17, 0]);
    placeEntry(tr.A, M.invertLine(SUBJECT, 67, KEY), dv + 56, RANGE.A, low.concat([tr.over]), [0, -12, 7, -5, 5]);
    placeEntry(tr.S, SUBJECT, dv + 64, RANGE.S, low.concat([tr.A]), [0, 12, 7, 5, -5]);
    fillVoice(tr.A, tr.chords, dv, 56, 2, RANGE.A, low.concat([tr.over, tr.S, tr.T]), 60);
    fillVoice(tr.T, tr.chords, dv, 40, 2, RANGE.T, low.concat([tr.A, tr.S, tr.over]), 55);
    fillVoice(tr.S, tr.chords, dv, 24, 4, RANGE.S, low.concat([tr.A, tr.T, tr.over]), 67);
    fillVoice(tr.T, tr.chords, dv + 48, 32, 2, RANGE.T, low.concat([tr.A, tr.S, tr.over]), 55);

    // ---- Stretto 2 over a tonic pedal
    const s2 = BARS.build2 * 4;
    chordSpan(tr, s2, 32, KEY, 0);
    tr.monks.push({ beat: s2, dur: 30, pitch: 36 });
    tr.cont.push({ beat: s2, dur: 30, pitch: 36 });
    placeEntry(tr.T, SUBJECT, s2, RANGE.T, [], [0, -12]);
    placeEntry(tr.A, SUBJECT, s2 + 4, RANGE.A, [tr.T], [0, -12]);
    placeEntry(tr.S, SUBJECT, s2 + 8, RANGE.S, [tr.A, tr.T], [0, 12]);
    placeEntry(tr.over, SUBJECT, s2 + 12, [72, 96], [tr.S, tr.A], [12, 24]);
    placeEntry(tr.T, SUBJECT, s2 + 16, RANGE.T, [tr.over, tr.S], [0, -12]);
    placeEntry(tr.A, SUBJECT, s2 + 20, RANGE.A, [tr.T, tr.over], [0, -12]);

    // ---- Drop II: cantus firmus three times (C, G, C) + final 8 bars
    const dB = BARS.dropB * 4;
    const cfs = [
        M.transposeLine(M.scaleRhythm(SUBJECT, 4), -24),
        M.transposeLine(M.scaleRhythm(ANSWER, 4), -24),
        M.transposeLine(M.scaleRhythm(SUBJECT, 4), -24)
    ];
    for (let k = 0; k < 3; k = k + 1) {
        const cf = M.fitRange(M.shiftTime(cfs[k], dB + 32 * k), 35, 52);
        append(tr.monks, cf);
        const key = k === 1 ? KEY_G : KEY;
        const degs = M.harmonize(cf, key, 0, 4);
        for (let i = 0; i < cf.length; i = i + 1) {
            chordSpan(tr, cf[i].beat, cf[i].dur, key, degs[i]);
        }
        placeEntry(tr.S, k === 1 ? ANSWER : SUBJECT, dB + 32 * k + 8, RANGE.S, [tr.monks], [0, 12, -12, 7, -5]);
        placeEntry(tr.T, SUBJECT, dB + 32 * k + 16, RANGE.T, [tr.monks, tr.S], [0, -12, 7, -5]);
        placeEntry(tr.A, k === 1 ? SUBJECT : ANSWER, dB + 32 * k + 24, RANGE.A, [tr.monks, tr.T], [0, -12, 5, -7]);
    }
    for (let b = 0; b < 8; b = b + 1) {
        const deg = dropDegrees[b];
        chordSpan(tr, dB + 96 + 4 * b, 4, KEY, deg);
        if (b % 2 === 0) {
            tr.monks.push({ beat: dB + 96 + 4 * b, dur: 8, pitch: M.pitchOf(deg, 36, KEY) });
        }
    }
    placeEntry(tr.S, M.scaleRhythm(SUBJECT, 2), dB + 96, RANGE.S, [tr.monks], [0, 12]);
    placeEntry(tr.T, M.scaleRhythm(COUNTER, 2), dB + 96, RANGE.T, [tr.monks, tr.S], [-7, -19, 5]);
    // overtone hook: the head motif, built on the chord of the bar it is
    // sung in, placed where it clashes least with the cantus and entries
    for (let b = 0; b < 32; b = b + 2) {
        const hookStart = dB + 4 * b + 4;
        const pcs = chordAtBeat(tr.chords, hookStart);
        const rootDeg = degreeOfPc(pcs !== null ? pcs[0] : 0);
        const hook = M.fitRange(M.shiftLine(HEAD, rootDeg, KEY), 76, 94);
        placeEntry(tr.over, hook, hookStart, [72, 96], [tr.monks, tr.S, tr.T], [0, 12, -12, 7, -5]);
    }
    fillVoice(tr.A, tr.chords, dB, 128, 4, RANGE.A, [tr.monks, tr.S, tr.T, tr.over], 60);

    // ---- Coda: tonic pedal, last entry, iv - V - I (Picardy)
    const cd = BARS.coda * 4;
    chordSpan(tr, cd, 8, KEY, 0);
    chordSpan(tr, cd + 8, 8, KEY, 3);
    chordSpan(tr, cd + 16, 8, KEY, 4);
    tr.chords.push({ beat: cd + 24, dur: 8, key: KEY, degree: 0, pcs: [0, 4, 7] });
    tr.monks.push({ beat: cd, dur: 24, pitch: 36 });
    tr.monks.push({ beat: cd + 24, dur: 8, pitch: 36 });
    tr.cont.push({ beat: cd, dur: 32, pitch: 36 });
    append(tr.S, M.shiftTime(SUBJECT, cd));
    append(tr.S, [{ beat: cd + 8, dur: 8, pitch: 68 }, { beat: cd + 16, dur: 8, pitch: 67 }, { beat: cd + 24, dur: 8, pitch: 67 }]);
    append(tr.A, [{ beat: cd, dur: 8, pitch: 63 }, { beat: cd + 8, dur: 8, pitch: 60 }, { beat: cd + 16, dur: 8, pitch: 62 }, { beat: cd + 24, dur: 8, pitch: 64 }]);
    append(tr.T, [{ beat: cd, dur: 8, pitch: 55 }, { beat: cd + 8, dur: 8, pitch: 53 }, { beat: cd + 16, dur: 8, pitch: 59 }, { beat: cd + 24, dur: 8, pitch: 60 }]);
    // the overtone singer ends on drone C3, harmonic 10: a just major third
    tr.over.push({ beat: cd + 24, dur: 8, pitch: 76 });
    // the continuo throat stays where a basso can sing (G1 .. A-flat 2)
    for (let i = 0; i < tr.cont.length; i = i + 1) {
        while (tr.cont[i].pitch < RANGE.cont[0]) {
            tr.cont[i].pitch = tr.cont[i].pitch + 12;
        }
        while (tr.cont[i].pitch > RANGE.cont[1]) {
            tr.cont[i].pitch = tr.cont[i].pitch - 12;
        }
    }
    sortTrack(tr.S); sortTrack(tr.A); sortTrack(tr.T); sortTrack(tr.monks); sortTrack(tr.over); sortTrack(tr.cont);
    return tr;
}

function degreeOfPc(pc) {
    const steps = KEY.steps;
    for (let d = 0; d < 7; d = d + 1) {
        if (steps[d] === pc) {
            return d;
        }
    }
    return 0;
}

// Re-spell a minor-key line into a major key on the relative's scale.
function majorize(line, key) {
    const out = [];
    for (let i = 0; i < line.length; i = i + 1) {
        const n = line[i];
        const info = M.degreeOf(n.pitch, key);
        let p = n.pitch;
        if (info.alter === 1) {
            p = n.pitch - 1;
        }
        out.push({ beat: n.beat, dur: n.dur, pitch: p });
    }
    return out;
}

// ------------------------------------------------------------------ throat-bass riffs

const OVERTONE_OPTS = { harmonics: [6, 8, 9, 10, 12], droneLow: 43, droneHigh: 57, bandLow: 690, bandHigh: 1800, tolCents: 16, startDrone: 48, holdCost: 1.5 };

// Map the overtone line section by section: where the singer is a descant
// (interlude, chorale) its drone acts as a pedal and changes reluctantly.
export function mapOvertonesBySection(tr, chordAt) {
    const holdSpans = [[BARS.episode2 * 4, BARS.develop * 4]];
    const out = [];
    let chunk = [];
    let chunkHold = false;
    let prevDrone = 48;
    function flush() {
        if (chunk.length === 0) {
            return;
        }
        const opts = Object.assign({}, OVERTONE_OPTS, { startDrone: prevDrone, holdCost: chunkHold ? 7.0 : OVERTONE_OPTS.holdCost });
        const mapped = M.mapOvertones(chunk, opts, chordAt);
        for (let i = 0; i < mapped.length; i = i + 1) {
            out.push(mapped[i]);
            if (mapped[i].drone >= 0) {
                prevDrone = mapped[i].drone;
            }
        }
        chunk = [];
    }
    for (let i = 0; i < tr.over.length; i = i + 1) {
        const n = tr.over[i];
        let hold = false;
        for (let k = 0; k < holdSpans.length; k = k + 1) {
            if (n.beat >= holdSpans[k][0] && n.beat < holdSpans[k][1]) {
                hold = true;
            }
        }
        if (hold !== chunkHold) {
            flush();
            chunkHold = hold;
        }
        chunk.push(n);
    }
    flush();
    return out;
}

export function buildScore() {
    const tr = composeTracks();
    const s = new Score();
    function chordAt(beat) {
        return chordAtBeat(tr.chords, beat);
    }

    // ---- Prelude (free time): horns' pedal, the subject alone in overtones
    s.at(0.0, "state", "section", { index: 0 });
    s.at(0.3, "trigger", "bell", { amp: 0.7 });
    horn(s, 0.8, 0, 36, 10.0, 0.8, 0.35);
    horn(s, 8.5, 1, 36, 10.5, 0.8, 0.4);
    horn(s, 17.0, 0, 36, 10.0, 0.6, 0.35);
    s.at(2.5, "trigger", "conch", { note: 55, level: 0.8, seconds: 2.8 });
    const preludeLine = M.lineFrom([[72, 3], [79, 3], [80, 1.5], [79, 1.5], [77, 1.5], [75, 1.5], [77, 1.5], [75, 1.5], [74, 1.5], [72, 1.5], [71, 3], [72, 4]]);
    const preMapped = M.mapOvertones(preludeLine, OVERTONE_OPTS, function preludeChord() { return [0, 3, 7]; });
    for (let i = 0; i < preMapped.length; i = i + 1) {
        const n = preMapped[i];
        const t = 5.0 + n.beat * 0.62;
        if (n.drone >= 0) {
            s.at(t, "state", "overtone", { drone: n.drone, harmonic: n.harmonic, pitch: n.pitch });
        }
    }
    s.at(5.0 + 27 * 0.62 + 1.0, "state", "off", { part: "solo" });
    s.at(24.0, "trigger", "rolmo", { amp: 0.5, bright: 0.7 });
    rolmoPattern(s, 21.0, 0.8, 0.8, 9, 0.3, false);
    s.at(PRELUDE - 0.4, "trigger", "nga", { amp: 0.9 });

    // ---- section markers
    for (let i = 1; i < SECTIONS.length; i = i + 1) {
        s.at(SECTIONS[i].start, "state", "section", { index: i });
    }

    // ---- voices from the composed tracks
    W.voiceLine(s, tr.S, 0);
    W.voiceLine(s, tr.A, 1);
    W.voiceLine(s, tr.T, 2);
    W.monksLine(s, tr.monks);
    W.overtoneLine(s, mapOvertonesBySection(tr, chordAt));

    // monks' tuning: Gyuto chord on long held notes, free on melodies
    const gyutoSpans = [[BARS.expo + 16, BARS.expo + 20], [BARS.build1, BARS.build1 + 8], [BARS.dropA, BARS.dropA + 20], [BARS.build2, BARS.build2 + 8], [BARS.dropB + 24, BARS.dropB + 32], [BARS.coda, BARS.end]];
    s.at(at(0), "state", "set", { part: "monks", name: "tuning", value: "none" });
    for (let i = 0; i < gyutoSpans.length; i = i + 1) {
        s.at(at(gyutoSpans[i][0] * 4), "state", "set", { part: "monks", name: "tuning", value: "gyuto" });
        s.at(at(gyutoSpans[i][1] * 4) - 0.01, "state", "set", { part: "monks", name: "tuning", value: "none" });
    }
    // the half tone grows through the second stretto
    s.at(at(BARS.build2 * 4), "state", "set", { part: "monks", name: "halftone", value: 0.3 });
    s.at(at((BARS.build2 + 4) * 4), "state", "set", { part: "monks", name: "halftone", value: 0.6 });
    s.at(at(BARS.dropB * 4), "state", "set", { part: "monks", name: "halftone", value: 0.25 });
    s.at(at(BARS.coda * 4), "state", "set", { part: "monks", name: "halftone", value: 0.5 });
    // upper voices breathe in vowel space during the chorale, polyrhythmically
    s.at(at(BARS.chorale * 4), "state", "set", { part: "upper", name: "osc.mode", value: "ratio" });
    s.at(at(BARS.chorale * 4), "state", "set", { part: "upper", name: "osc.rate", value: 0.45 / BAR });
    s.at(at(BARS.chorale * 4), "state", "set", { part: "upper", name: "osc.depth", value: 0.18 });
    s.at(at(BARS.chorale * 4), "state", "set", { part: "upper", name: "osc.round", value: 0.35 });
    s.at(at(BARS.develop * 4), "state", "set", { part: "upper", name: "osc.depth", value: 0.0 });
    s.at(at(BARS.develop * 4), "state", "set", { part: "upper", name: "osc.round", value: 0.0 });
    s.at(at(BARS.dropA * 4), "state", "set", { part: "solo", name: "tuning", value: "sygyt" });
    s.at(at(BARS.episode2 * 4), "state", "set", { part: "solo", name: "tuning", value: "overtone" });
    s.at(at(BARS.dropB * 4), "state", "set", { part: "solo", name: "tuning", value: "sygyt" });
    s.at(at(BARS.coda * 4), "state", "set", { part: "solo", name: "tuning", value: "overtone" });

    // ---- continuo throat (sustained sections), breathing orbit
    const sustained = [[BARS.expo + 8, BARS.dropA], [BARS.episode2, BARS.build2 + 8], [BARS.coda, BARS.end]];
    for (let i = 0; i < sustained.length; i = i + 1) {
        const from = sustained[i][0] * 4;
        const o = orbitFor("breathe", 8);
        s.at(at(from), "state", "orbit", { part: "bass", index: 0, rate: o.rate, shape: o.shape, depth: o.depth, round: o.round, phase: 0.0 });
        s.at(at(from), "state", "env", { part: "bass", index: 0, attack: 0.25, release: 0.6 });
        s.at(at(from), "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.4 });
        W.continuoLine(s, tr.cont, from, sustained[i][1] * 4);
    }

    // ---- drops: throat call and response, drums, dunk
    for (const span of [[BARS.dropA, 20, 0], [BARS.dropB, 32, 1]]) {
        s.at(at(span[0] * 4), "state", "env", { part: "bass", index: 0, attack: 0.003, release: 0.025 });
        s.at(at(span[0] * 4), "trigger", "impact", { amp: 1.0 });
        W.dropBass(s, tr, span[0], span[1], span[2]);
        W.drums(s, span[0], span[1], 1.0);
    }
    W.softDrums(s, BARS.develop + 8, 12);

    // ---- ritual instruments woven through
    horn(s, at(BARS.expo * 4), 1, 36, 8 * BAR, 0.4, 0.3);
    horn(s, at((BARS.expo + 8) * 4) - 1.0, 0, 36, 8 * BAR, 0.35, 0.3);
    horn(s, at((BARS.expo + 16) * 4), 1, 41, 2 * BAR, 0.5, 0.35);
    horn(s, at((BARS.expo + 18) * 4), 0, 43, 2 * BAR, 0.55, 0.35);
    horn(s, at(BARS.build1 * 4), 0, 43, 7.5 * BAR, 0.6, 0.4);
    horn(s, at((BARS.build1 + 4) * 4), 1, 43, 3.5 * BAR, 0.8, 0.45);
    horn(s, at(BARS.episode2 * 4), 0, 36, 8 * BAR, 0.4, 0.3);
    horn(s, at(BARS.build2 * 4), 1, 36, 7.5 * BAR, 0.7, 0.45);
    horn(s, at((BARS.build2 + 2) * 4), 0, 43, 5.5 * BAR, 0.7, 0.45);
    horn(s, at(BARS.coda * 4), 0, 36, 8 * BAR + 4.0, 0.7, 0.4);
    horn(s, at((BARS.coda + 4) * 4), 1, 36, 4 * BAR + 6.0, 0.7, 0.45);
    for (let b = BARS.dropA; b < BARS.dropA + 20; b = b + 4) {
        s.at(at(b * 4), "state", "horn", { which: (b / 4) % 2, note: 48, level: 1.0, attack: 0.05, growl: 0.5 });
        s.at(at(b * 4 + 0.75), "state", "hornStop", { which: (b / 4) % 2, release: 0.25 });
    }
    for (let b = BARS.dropB; b < BARS.dropB + 32; b = b + 2) {
        s.at(at(b * 4), "state", "horn", { which: (b / 2) % 2, note: b % 4 === 0 ? 48 : 43, level: 1.0, attack: 0.05, growl: 0.55 });
        s.at(at(b * 4 + 0.6), "state", "hornStop", { which: (b / 2) % 2, release: 0.2 });
    }
    // gyaling: double the episode's soprano motif; canon on the inversion
    W.gyalingLine(s, M.transposeLine(tr.S.filter(function inEpisode(n) { return n.beat >= BARS.episode1 * 4 && n.beat < BARS.build1 * 4; }), 12), 0.7);
    W.gyalingLine(s, M.shiftTime(M.fitRange(M.invertLine(SUBJECT, 67, KEY), 60, 74), BARS.episode2 * 4 + 4), 0.75);
    W.gyalingLine(s, M.shiftTime(M.fitRange(M.scaleRhythm(M.invertLine(SUBJECT, 67, KEY), 2), 60, 74), BARS.episode2 * 4 + 16), 0.75);
    // rolmo: accelerando into each stretto's roll, decelerando after
    rolmoPattern(s, at(BARS.episode1 * 4), 1.2, 0.86, 16, 0.4, true);
    rolmoPattern(s, at(BARS.build1 * 4), BEAT * 2, 0.88, 22, 0.45, false);
    rolmoPattern(s, at(BARS.build2 * 4), BEAT * 2, 0.88, 22, 0.5, false);
    rolmoPattern(s, at(BARS.episode2 * 4), 0.3, 1.15, 10, 0.4, false);
    for (let b = BARS.chorale; b < BARS.develop; b = b + 4) {
        s.at(at(b * 4), "trigger", "rolmo", { amp: 0.35, bright: 0.5 });
        s.at(at(b * 4), "trigger", "nga", { amp: 0.55 });
    }
    for (let b = BARS.expo + 8; b < BARS.episode1 + 8; b = b + 2) {
        s.at(at(b * 4), "trigger", "nga", { amp: 0.5 });
    }
    // builds: snare rolls on the grid, risers, the breath, the kangling
    for (const bb of [BARS.build1, BARS.build2]) {
        for (let b = 0; b < 8; b = b + 1) {
            let division = 1.0;
            if (b >= 2) { division = 0.5; }
            if (b >= 4) { division = 0.25; }
            if (b >= 6) { division = 0.125; }
            const beats = b === 7 ? 2.0 : 4.0;
            for (let x = 0.0; x < beats - 1e-6; x = x + division) {
                const u = (b * 4 + x) / 30.0;
                s.at(at((bb + b) * 4 + x), "trigger", "snare", { amp: 0.2 + 0.6 * u });
            }
        }
        s.at(at((bb + 4) * 4), "trigger", "riser", { seconds: 3.5 * BAR, amp: 0.9 });
        s.at(at((bb + 7) * 4 + 2), "trigger", "kang", { note: 69, level: 0.85, seconds: 0.55 });
        s.at(at((bb + 7) * 4 + 2), "state", "off", { part: "upper" });
        s.at(at((bb + 7) * 4 + 2), "state", "off", { part: "solo" });
        s.at(at((bb + 7) * 4 + 2), "state", "voiceOff", { part: "bass", index: 0 });
    }
    // chorale and coda bells
    s.at(at(BARS.chorale * 4), "trigger", "bell", { amp: 0.5 });
    s.at(at((BARS.coda + 6) * 4), "trigger", "bell", { amp: 0.7 });

    // ---- Dissolution (free time)
    const tEnd = at(BARS.end * 4);
    s.at(tEnd, "state", "off", { part: "upper" });
    s.at(tEnd, "state", "voiceOff", { part: "bass", index: 0 });
    s.at(tEnd, "state", "note", { part: "monks", note: 36 });
    s.at(tEnd, "state", "set", { part: "monks", name: "tuning", value: "gyuto" });
    s.at(tEnd + 0.3, "state", "set", { part: "monks", name: "hum", value: 0.0 });
    s.at(tEnd + 9.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(tEnd + 15.0, "state", "off", { part: "monks" });
    s.at(tEnd, "state", "overtone", { drone: 48, harmonic: 10, pitch: 76 });
    s.at(tEnd + 6.0, "state", "overtone", { drone: 48, harmonic: 12, pitch: 79 });
    s.at(tEnd + 10.0, "state", "overtone", { drone: 48, harmonic: 16, pitch: 84 });
    s.at(tEnd + 14.0, "state", "off", { part: "solo" });
    rolmoPattern(s, tEnd + 0.5, 0.12, 1.22, 13, 0.6, false);
    horn(s, tEnd, 0, 36, 9.0, 0.9, 0.4);
    s.at(tEnd + 7.0, "state", "hornBend", { which: 0, note: 48 });
    horn(s, tEnd + 7.0, 1, 36, 12.0, 0.8, 0.45);
    s.at(tEnd + 16.5, "state", "hornBend", { which: 1, note: 48 });
    s.at(tEnd + 9.0, "trigger", "bell", { amp: 0.6 });
    s.at(tEnd + 15.0, "trigger", "bell", { amp: 0.5 });
    s.at(tEnd + 21.0, "trigger", "bell", { amp: 0.7 });
    s.at(tEnd + 21.0, "trigger", "nga", { amp: 0.7 });
    s.at(LENGTH, "state", "end", {});

    s.events.sort(compareTime);
    return s.events;
}

function compareTime(a, b) {
    return a.t - b.t;
}

// ------------------------------------------------------------------ parts

export function partConfigs() {
    const monks = [
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "none", pan: -0.5, detune: -5, onset: 0.04, vibratoDepth: 0.03, effort: 0.75, larynx: -0.3, level: 1.0 }),
        Object.assign(makeSingerConfig("bass", "ventricular", 0), { octave: 0, tuning: "none", pan: -0.2, detune: 4, onset: 0.09, vibratoDepth: 0.03, effort: 0.8, larynx: -0.4, level: 0.6 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "none", pan: 0.1, detune: 6, onset: 0.0, vibratoDepth: 0.04, effort: 0.75, larynx: -0.2, level: 1.0, lengthScale: 1.03 }),
        Object.assign(makeSingerConfig("bass", "chest", 0), { octave: 0, tuning: "none", pan: 0.35, detune: -3, onset: 0.07, vibratoDepth: 0.03, effort: 0.8, larynx: -0.3, level: 0.9, lengthScale: 0.98 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "none", pan: 0.6, detune: -8, onset: 0.12, vibratoDepth: 0.04, effort: 0.7, larynx: -0.3, level: 1.0, lengthScale: 0.97 })
    ];
    const upper = [
        Object.assign(makeSingerConfig("countertenor", "falsetto", 0), { octave: 0, tuning: "r1", pan: -0.35, vibratoDepth: 0.18, level: 1.0 }),
        Object.assign(makeSingerConfig("tenor", "head", 0), { octave: 0, pan: 0.35, vibratoDepth: 0.14, level: 0.95 }),
        Object.assign(makeSingerConfig("tenor", "chest", 0), { octave: 0, pan: 0.05, vibratoDepth: 0.12, epilarynx: 0.5, level: 0.9 })
    ];
    const solo = [
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "overtone", vibratoDepth: 0.0, driftCents: 1.0, effort: 0.9, epilarynx: 0.6, level: 3.2, pan: 0.0 })
    ];
    const bass = [
        Object.assign(makeSingerConfig("basso", "ventricular", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, larynx: -0.2, level: 1.0, pan: 0.0, attack: 0.003, release: 0.025 }),
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, epilarynx: 0.7, level: 1.1, pan: 0.0, attack: 0.003, release: 0.02 }),
        Object.assign(makeSingerConfig("bass", "fry", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, level: 1.0, pan: 0.0, attack: 0.002, release: 0.015 })
    ];
    return { monks: monks, upper: upper, solo: solo, bass: bass };
}

export const FUGUE = {
    id: "fugue",
    title: "Fugue in C minor for throats",
    sections: SECTIONS,
    length: LENGTH,
    grid: PRELUDE,
    bar: BAR,
    buildScore: buildScore,
    partConfigs: partConfigs,
    setup: function setupFugue(engine) {
        engine.parts.upper.setGlobal("glide", 0.02);
        engine.parts.solo.setGlobal("glide", 0.02);
        engine.parts.monks.setGlobal("glide", 0.06);
        engine.parts.bass.setGlobal("halftone", 0.4);
        engine.parts.bass.setGlobal("vowelGlide", 0.012);
        engine.parts.upper.setGlobal("vowelGlide", 0.05);
        engine.hall.mix = 0.45;
        engine.hall.setTime(4.6, 0.5);
    },
    warmSpots: [5.0, at(BARS.expo * 4 + 34), at(BARS.episode1 * 4 + 2), at(BARS.build1 * 4 + 20), at(BARS.dropA * 4 + 6), at(BARS.chorale * 4 + 4), at(BARS.develop * 4 + 40), at(BARS.dropB * 4 + 50), at(BARS.coda * 4 + 26)]
};
export { chordAtBeat };
