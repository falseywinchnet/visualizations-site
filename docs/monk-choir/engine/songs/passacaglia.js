// "Passacaglia on a Throat Ground": a ground bass and sixteen variations
// for physical monks, an overtone singer, upper voices and three throat
// basses, A minor, 140 BPM half time.
//
// Studied from a 30-second reference clip of bass-music sound design
// (measured in .dev/study/; nothing transcribed or reused): the sub and the
// mid-bass are independent layers (envelope correlation 0.007); the sub
// keeps its own phrasing, sounding about 83% of the time with a gap of
// roughly 1.5 beats every two bars; a tuned kick falls ~16 semitones into
// the sub's pitch on each half bar; the mid-bass "talks" in held vowel-like
// plateaus joined by fast V-shaped sweeps of its main resonance between
// about 1.6 kHz and 200 Hz; parallel descending resonance sweeps fill the
// sub gaps; a high tone near 2 kHz is sustained above with a slow vibrato.
//
// Here each of those is done with bodies: the talk is a throat holding and
// sweeping vowels; the parallel sweep is the throat itself lengthening
// (larynx down, lips out: every formant slides down together, about three
// semitones, the most a real tract can do, combined with a vowel sweep);
// the sustained top tone is a sygyt whistle. The form is Baroque: a
// passacaglia, the ground repeating in the bass while variations pile up
// above, which is also how a looped drop accumulates layers.

import * as M from "../music.js";
import { makeSingerConfig } from "../choir.js";
import {
    BEAT, BAR, newTracks, append, chordSpan, chordAtBeat, placeEntry, fillVoice, smoothFollower,
    sortTrack, Score, rolmoPattern, horn, makeWriters
} from "./common.js";

const INTRO = 18.0;
const OUTRO = 20.0;
const KEY = M.makeKey(9, "minor");

function at(beat) {
    return INTRO + beat * BEAT;
}

const W = makeWriters(at);

// Ground: two bars each on A, G, F, E (the descending lament tetrachord).
export const GROUND = [45, 43, 41, 40];
const GROUND_DEGREES = [0, 6, 5, 4]; // i, VII, VI, V
// Theme (original), eight bars over one statement of the ground.
export const THEME = M.lineFrom([
    [76, 2], [72, 1], [69, 1], [72, 2], [71, 1], [69, 1],
    [71, 2], [74, 1], [79, 1], [77, 1], [76, 1], [74, 2],
    [72, 2], [69, 1], [77, 1], [76, 1], [74, 1], [72, 2],
    [71, 2], [68, 1], [71, 1], [74, 2], [72, 1], [71, 1]
]);
// Sustained top line for the whistle: two bars per note where it can.
// Every note within the sygyt's reach on this body (about 910-1770 Hz).
const TOP = M.lineFrom([[88, 8], [86, 4], [83, 4], [84, 4], [89, 4], [83, 4], [88, 4]]);

const VARIATIONS = [
    ["Ground", "The monks sing the ground (A–G–F–E) on Om; the sub enters as its own layer, with its own breaths; a tuned kick falls onto the sub's note."],
    ["Talk", "A basso throat starts to talk: held vowels joined by quick V-shaped sweeps through vowel space."],
    ["Whistle", "A sygyt whistle sustains above, long tones with a slow vibrato, each one a harmonic of a drone chosen for the chord."],
    ["Theme", "The countertenor brings the theme over the ground."],
    ["Canon", "The tenor follows the theme a bar later, an octave down; the drums come in at half time."],
    ["Rise", "The ground doubles its speed in the monks; the throats rise (larynx up, tube shorter); the snare roll accelerates."],
    ["Drop I", "Full talk over the ground; in every sub gap the throat lengthens, all its formants sliding down together."],
    ["Drop I, triplets", "The talk turns to triplets; the theme sinks into the tenor; the whistle holds above."],
    ["Ground above", "Roles swap: the ground rises into the upper voices as a slow chorale, the gyaling play the theme, the sub holds without gaps."],
    ["Theme below", "The theme sinks into the chant; the whistle answers it; soft drums."],
    ["Chorale", "The theme harmonized in four parts by search, over the ground in the sub."],
    ["Stretto", "Theme entries a bar apart in three voices; roll, riser, silence, the kangling."],
    ["Drop II", "The three throats trade timbres within the bar (growl, squeal, chop) with dives and sweeps; Gyuto chord in the monks."],
    ["Drop II, alto", "The theme in the alto under the countertenor's held tones, the throats talking below."],
    ["Drop II, all", "Everything at once; every sub gap a lengthening sweep."],
    ["Coda", "The drums leave; the ground slows; it ends on an open fifth, the whistle on the singer's 12th harmonic."]
];

export const SECTIONS = [{ name: "Intro", start: 0.0, text: "The horns and the bell; the overtone singer holds a high E over an A drone." }];
for (let v = 0; v < VARIATIONS.length; v = v + 1) {
    SECTIONS.push({ name: (v + 1) + ". " + VARIATIONS[v][0], start: at(v * 32), text: VARIATIONS[v][1] });
}
SECTIONS.push({ name: "Outro", start: at(16 * 32), text: "Free time: Om, the horns rising to their upper partial, the bell." });

export const LENGTH = at(16 * 32) + OUTRO;

function varStart(v) {
    return v * 32;
}

// ------------------------------------------------------------------ tracks

const RANGE = { S: [62, 81], A: [55, 69], T: [48, 66], monks: [36, 52] };

function groundLine(start, factor, octave) {
    const out = [];
    for (let k = 0; k < 4; k = k + 1) {
        out.push({ beat: start + 8 * k * factor, dur: 8 * factor, pitch: GROUND[k] + 12 * octave });
    }
    return out;
}

function groundChords(tr, start) {
    for (let k = 0; k < 4; k = k + 1) {
        chordSpan(tr, start + 8 * k, 8, KEY, GROUND_DEGREES[k]);
    }
}

export function composeTracks() {
    const tr = newTracks();
    tr.top = [];
    for (let v = 0; v < 16; v = v + 1) {
        const b = varStart(v);
        if (v === 5) {
            // diminution: the ground twice, at double speed
            for (let k = 0; k < 4; k = k + 1) {
                chordSpan(tr, b + 4 * k, 4, KEY, GROUND_DEGREES[k]);
                chordSpan(tr, b + 16 + 4 * k, 4, KEY, GROUND_DEGREES[k]);
            }
            append(tr.monks, groundLine(b, 0.5, 0));
            append(tr.monks, groundLine(b + 16, 0.5, 0));
        } else if (v === 8) {
            groundChords(tr, b);
            // the ground rises: soprano carries it, slow, harmonized
            const melody = groundLine(b, 1, 2);
            append(tr.S, melody);
            const v4 = M.voiceChorale(melody, GROUND_DEGREES, KEY, { alto: [55, 66], tenor: [48, 60], bass: RANGE.monks });
            append(tr.A, v4.alto);
            append(tr.T, v4.tenor);
            append(tr.monks, groundLine(b, 1, 0));
        } else if (v === 15) {
            // coda: the first half of the ground, slowed, to an open fifth
            chordSpan(tr, b, 16, KEY, 0);
            chordSpan(tr, b + 16, 8, KEY, 6);
            tr.chords.push({ beat: b + 24, dur: 8, key: KEY, degree: 0, pcs: [9, 4] });
            append(tr.monks, [{ beat: b, dur: 16, pitch: 45 }, { beat: b + 16, dur: 8, pitch: 43 }, { beat: b + 24, dur: 8, pitch: 45 }]);
        } else {
            groundChords(tr, b);
            append(tr.monks, groundLine(b, 1, 0));
        }
    }
    // Theme and its variations above the ground
    append(tr.S, M.shiftTime(THEME, varStart(3)));
    append(tr.S, M.shiftTime(THEME, varStart(4)));
    placeEntry(tr.T, THEME, varStart(4) + 4, RANGE.T, [tr.S, tr.monks], [-12, -24, -5, -17]);
    smoothFollower(tr.T, varStart(4), varStart(5), [tr.S, tr.monks], tr.chords);
    // triplet variation: the theme moves down into the tenor
    placeEntry(tr.T, THEME, varStart(7), RANGE.T, [tr.monks], [-12, -24]);
    // theme below: in the chant, two octaves down
    const low = [];
    const chantTheme = M.fitRange(M.shiftTime(M.transposeLine(THEME, -24), varStart(9)), 40, 55);
    for (let i = 0; i < tr.monks.length; i = i + 1) {
        const n = tr.monks[i];
        if (n.beat < varStart(9) || n.beat >= varStart(10)) {
            low.push(n);
        }
    }
    tr.monks = low.concat(chantTheme);
    // chorale: theme harmonized over the ground (soprano theme, coarse chords)
    const cv = varStart(10);
    const theme2 = M.shiftTime(THEME, cv);
    const coarse = [];
    for (let i = 0; i < theme2.length; i = i + 1) {
        if (theme2[i].dur >= 2 || (theme2[i].beat - cv) % 2 === 0) {
            coarse.push({ beat: theme2[i].beat, dur: 2, pitch: theme2[i].pitch });
        }
    }
    const degs = [];
    for (let i = 0; i < coarse.length; i = i + 1) {
        const k = Math.floor((coarse[i].beat - cv) / 8);
        const base = GROUND_DEGREES[k];
        // prefer the ground's chord; if the melody note does not fit, the
        // chord a third above it on the ground (passacaglia reharmonization)
        const pc = ((coarse[i].pitch % 12) + 12) % 12;
        let d = base;
        if (M.chordTones(base, KEY).indexOf(pc) < 0) {
            d = (base + 2) % 7;
            if (M.chordTones(d, KEY).indexOf(pc) < 0) {
                d = (base + 5) % 7;
            }
        }
        degs.push(d);
    }
    const voiced = M.voiceChorale(coarse, degs, KEY, { alto: RANGE.A, tenor: RANGE.T, bass: RANGE.monks });
    append(tr.S, theme2);
    append(tr.A, voiced.alto);
    append(tr.T, voiced.tenor);
    // stretto
    const st = varStart(11);
    placeEntry(tr.S, THEME, st, RANGE.S, [tr.monks], [0, 12]);
    placeEntry(tr.A, THEME, st + 4, RANGE.A, [tr.monks, tr.S], [-12, -5, -7]);
    smoothFollower(tr.A, st, st + 32, [tr.monks, tr.S], tr.chords);
    placeEntry(tr.T, THEME, st + 8, RANGE.T, [tr.monks, tr.S, tr.A], [-12, -24, -17]);
    smoothFollower(tr.T, st, st + 32, [tr.monks, tr.S, tr.A], tr.chords);
    // drop II: the theme in the alto, the countertenor holding chord tones above
    placeEntry(tr.A, THEME, varStart(13), RANGE.A, [tr.monks], [-12, 0]);
    fillVoice(tr.S, tr.chords, varStart(13), 32, 8, RANGE.S, [tr.A, tr.monks], 72);
    placeEntry(tr.S, THEME, varStart(14), RANGE.S, [tr.monks], [0, 12]);
    // filler inner voices where the texture wants them
    fillVoice(tr.A, tr.chords, varStart(3), 64, 4, RANGE.A, [tr.S, tr.T, tr.monks], 64);
    fillVoice(tr.A, tr.chords, varStart(12), 32, 8, RANGE.A, [tr.S, tr.monks], 64);
    fillVoice(tr.A, tr.chords, varStart(14), 32, 8, RANGE.A, [tr.S, tr.monks], 64);
    fillVoice(tr.T, tr.chords, varStart(12), 64, 8, RANGE.T, [tr.S, tr.A, tr.monks], 57);
    fillVoice(tr.T, tr.chords, varStart(9), 32, 4, RANGE.T, [tr.S, tr.monks], 57);
    // the whistle: top line from variation 3 on, held through
    for (let v = 2; v < 15; v = v + 1) {
        if (v === 5 || v === 8 || v === 11) {
            continue; // rests: the rise (ground at double speed), ground above, stretto
        }
        append(tr.top, M.shiftTime(TOP, varStart(v)));
    }
    tr.top.push({ beat: varStart(15), dur: 32, pitch: 88 });
    sortTrack(tr.S); sortTrack(tr.A); sortTrack(tr.T); sortTrack(tr.monks); sortTrack(tr.top);
    return tr;
}

// ------------------------------------------------------------------ the throats' talk

// A talk hit: [position, length] on the bar's grid (16 or 12 steps),
// throat (0 growl basso, 1 squeal baritone, 2 chop bass), interval above
// the bar's ground note, held vowel (0 ooh .. 1 eeh), and gestures:
// "V" a fast dip to ooh and back at the onset, "dive" a fall of a fifth,
// "lengthen" the throat-lengthening sweep (with a falling vowel).
const TALK = {
    a: { grid: 16, hits: [[0, 4, 0, 0, 0.9, "V"], [4, 2, 0, 0, 0.5], [6, 2, 0, 0, 0.2], [8, 2, 0, 0, 0.75, "V"], [10, 2, 2, 7, 0.3]] },
    b: { grid: 16, hits: [[0, 2, 0, 0, 0.3], [2, 2, 0, 0, 0.85], [4, 4, 0, 3, 0.5, "V"], [8, 2, 0, 5, 0.9], [10, 2, 1, 12, 0.95, "V"]] },
    c: { grid: 16, hits: [[0, 3, 0, 0, 0.6, "V"], [3, 1, 2, 0, 0.3], [4, 2, 0, 7, 0.9], [6, 2, 0, 0, 0.4, "V"], [8, 2, 1, 12, 0.85], [10, 2, 1, 15, 0.5]] },
    sparse: { grid: 16, hits: [[0, 6, 0, 0, 0.8, "V"], [8, 4, 0, 0, 0.3]] },
    trip: { grid: 12, hits: [[0, 2, 0, 0, 0.85, "V"], [2, 2, 0, 0, 0.3], [4, 2, 0, 3, 0.6], [6, 2, 0, 0, 0.9, "V"], [8, 2, 1, 12, 0.4], [10, 2, 0, 7, 0.2, "dive"]] },
    switch: { grid: 16, hits: [[0, 2, 0, 0, 0.8, "V"], [2, 1, 1, 12, 0.9], [3, 1, 2, 0, 0.3], [4, 2, 0, 0, 0.5], [6, 1, 1, 15, 0.85], [7, 1, 2, 7, 0.2], [8, 2, 0, 3, 0.9, "V"], [10, 1, 1, 19, 0.95], [11, 1, 2, 0, 0.3]] }
};
// The fill that lives in the sub's gap (last 1.5 beats of every other bar).
const GAP_FILL = [[10, 6, 0, 0, 0.9, "lengthen"]];

function talkBar(s, bar, root, patternName, withGapFill) {
    const p = TALK[patternName];
    const steps = p.grid;
    const stepBeats = 4.0 / steps;
    const beat0 = bar * 4;
    const hits = [];
    for (let i = 0; i < p.hits.length; i = i + 1) {
        const h = p.hits[i];
        const end = (h[0] + h[1]) * stepBeats;
        if (withGapFill && end > 2.5 + 1e-6) {
            continue; // the gap belongs to the fill
        }
        hits.push({ pos: h[0] * stepBeats, len: h[1] * stepBeats, throat: h[2], interval: h[3], vowel: h[4], gesture: h.length > 5 ? h[5] : "" });
    }
    if (withGapFill) {
        for (let i = 0; i < GAP_FILL.length; i = i + 1) {
            const h = GAP_FILL[i];
            hits.push({ pos: h[0] * 0.25, len: h[1] * 0.25, throat: h[2], interval: h[3], vowel: h[4], gesture: h[5] });
        }
    }
    for (let i = 0; i < hits.length; i = i + 1) {
        const h = hits[i];
        const t = at(beat0 + h.pos);
        const tEnd = at(beat0 + h.pos + h.len);
        let note = root + h.interval;
        if (h.throat === 1) {
            note = note + 12;
        }
        s.at(t, "state", "voiceSet", { part: "bass", index: h.throat, name: "vowel", value: h.vowel });
        s.at(t, "state", "voice", { part: "bass", index: h.throat, note: note, glide: 0.004 });
        if (h.gesture === "V") {
            s.at(t + 0.005, "state", "voiceSet", { part: "bass", index: h.throat, name: "vowel", value: 0.02 });
            s.at(t + 0.07, "state", "voiceSet", { part: "bass", index: h.throat, name: "vowel", value: h.vowel });
        } else if (h.gesture === "dive") {
            s.at(t + 0.4 * (tEnd - t), "state", "voice", { part: "bass", index: h.throat, note: note - 7, glide: 0.06 });
        } else if (h.gesture === "lengthen") {
            s.at(t, "state", "voiceSet", { part: "bass", index: h.throat, name: "larynxGlide", value: 0.22 });
            s.at(t, "state", "voiceSet", { part: "bass", index: h.throat, name: "larynx", value: -1.0 });
            s.at(t, "state", "voiceSet", { part: "bass", index: h.throat, name: "protrusion", value: 0.8 });
            s.at(t + 0.05, "state", "voiceSet", { part: "bass", index: h.throat, name: "vowel", value: 0.05 });
            s.at(tEnd - 0.02, "state", "voiceSet", { part: "bass", index: h.throat, name: "larynxGlide", value: 0.05 });
            s.at(tEnd - 0.02, "state", "voiceSet", { part: "bass", index: h.throat, name: "larynx", value: 0.0 });
            s.at(tEnd - 0.02, "state", "voiceSet", { part: "bass", index: h.throat, name: "protrusion", value: 0.0 });
        }
        if (h.throat === 0 && h.pos === 0) {
            s.at(t, "trigger", "dunk", { amp: 0.7 });
        }
        s.at(tEnd - 0.012, "state", "voiceOff", { part: "bass", index: h.throat });
    }
}

// The sub: its own layer, on the ground's note an octave down, with a gap
// over the last 1.5 beats of every other bar. The kick is tuned to it.
function subBar(s, bar, root, gap, level) {
    const beat0 = bar * 4;
    const hz = 440.0 * Math.pow(2.0, (root - 12 - 69) / 12.0);
    s.at(at(beat0), "state", "sub", { note: root, level: level });
    s.at(at(beat0), "state", "kickTune", { hz: hz });
    if (gap) {
        s.at(at(beat0 + 2.5), "state", "sub", { note: root, level: 0.0 });
    }
}

function kit(s, bar, density) {
    const beat0 = bar * 4;
    s.at(at(beat0), "trigger", "kick", { amp: 1.0 });
    if (density >= 1) {
        s.at(at(beat0 + 2), "trigger", "snare", { amp: 0.95 });
        s.at(at(beat0 + 2), "trigger", "kick", { amp: 0.55 });
        for (let e = 0; e < 8; e = e + 1) {
            s.at(at(beat0 + e * 0.5), "trigger", "hat", { amp: e % 2 === 1 ? 0.85 : 0.45, open: e === 7 && bar % 2 === 1 });
        }
    }
    if (density >= 2 && bar % 2 === 1) {
        s.at(at(beat0 + 1.5), "trigger", "kick", { amp: 0.6 });
        s.at(at(beat0 + 3.75), "trigger", "snare", { amp: 0.35 });
    }
    if (density >= 2 && bar % 8 === 7) {
        for (let k = 0; k < 4; k = k + 1) {
            s.at(at(beat0 + 3 + 0.25 * k), "trigger", "snare", { amp: 0.45 + 0.12 * k });
        }
    }
}

const OVERTONE_OPTS = { harmonics: [6, 8, 9, 10, 12, 16], droneLow: 43, droneHigh: 57, bandLow: 690, bandHigh: 1800, tolCents: 16, startDrone: 45, holdCost: 4.0 };

export function buildScore() {
    const tr = composeTracks();
    const s = new Score();
    function chordAt(beat) {
        return chordAtBeat(tr.chords, beat);
    }

    // ---- intro (free time)
    s.at(0.0, "state", "section", { index: 0 });
    s.at(0.3, "trigger", "bell", { amp: 0.7 });
    horn(s, 0.8, 0, 33, 9.0, 0.7, 0.4);
    horn(s, 7.5, 1, 33, 10.0, 0.7, 0.45);
    s.at(3.0, "state", "set", { part: "solo", name: "tuning", value: "sygyt" });
    s.at(3.0, "state", "overtone", { drone: 45, harmonic: 12, pitch: 88 });
    s.at(3.0, "state", "voiceSet", { part: "solo", index: 0, name: "vibrato", value: 0.12 });
    s.at(INTRO - 2.0, "state", "off", { part: "solo" });
    s.at(INTRO - 0.5, "trigger", "nga", { amp: 0.8 });
    for (let i = 1; i < SECTIONS.length; i = i + 1) {
        s.at(SECTIONS[i].start, "state", "section", { index: i });
    }

    // ---- voices
    W.voiceLine(s, tr.S, 0);
    W.voiceLine(s, tr.A, 1);
    W.voiceLine(s, tr.T, 2);
    W.monksLine(s, tr.monks);
    W.overtoneLine(s, M.mapOvertones(tr.top, OVERTONE_OPTS, chordAt));
    // Om on the first statement of the ground
    s.at(at(0) + 0.05, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(at(16), "state", "set", { part: "monks", name: "hum", value: 0.0 });
    // tuning: Gyuto chord in the drops and the coda; free elsewhere
    const gyuto = [[6, 8], [12, 15], [15, 16]];
    s.at(at(0), "state", "set", { part: "monks", name: "tuning", value: "none" });
    for (let i = 0; i < gyuto.length; i = i + 1) {
        s.at(at(varStart(gyuto[i][0])), "state", "set", { part: "monks", name: "tuning", value: "gyuto" });
        s.at(at(varStart(gyuto[i][1])) - 0.01, "state", "set", { part: "monks", name: "tuning", value: "none" });
    }
    s.at(at(varStart(6)), "state", "set", { part: "monks", name: "halftone", value: 0.35 });
    s.at(at(varStart(8)), "state", "set", { part: "monks", name: "halftone", value: 0.0 });
    s.at(at(varStart(12)), "state", "set", { part: "monks", name: "halftone", value: 0.5 });
    // the whistle keeps a slow vibrato
    s.at(at(0), "state", "voiceSet", { part: "solo", index: 0, name: "vibrato", value: 0.1 });
    // chorale and "ground above": the upper voices breathe in vowel space
    for (const v of [8, 10]) {
        s.at(at(varStart(v)), "state", "set", { part: "upper", name: "osc.mode", value: "ratio" });
        s.at(at(varStart(v)), "state", "set", { part: "upper", name: "osc.rate", value: 0.5 / BAR });
        s.at(at(varStart(v)), "state", "set", { part: "upper", name: "osc.depth", value: 0.2 });
        s.at(at(varStart(v + 1)), "state", "set", { part: "upper", name: "osc.depth", value: 0.0 });
    }

    // ---- sub, kick, talk, drums per variation
    const talkPlan = [null, "sparse", "sparse", "a", "b", "c", "a", "trip", null, null, null, null, "switch", "c", "switch", null];
    const subGaps = [true, true, true, true, true, true, true, true, false, true, false, true, true, true, true, false];
    const drumDensity = [0, 0, 0, 0, 1, 1, 2, 2, -1, 0, -1, 1, 2, 2, 2, -1];
    // the sub carries the dynamic arc of the piece
    const subLevel = [0.22, 0.3, 0.36, 0.42, 0.55, 0.65, 1.0, 1.0, 0.3, 0.38, 0.32, 0.6, 1.0, 1.0, 1.0, 0.35];
    for (let v = 0; v < 16; v = v + 1) {
        for (let k = 0; k < 8; k = k + 1) {
            const bar = v * 8 + k;
            let root = GROUND[Math.floor(k / 2)];
            if (v === 5) {
                root = GROUND[k % 4];
            }
            if (v === 15) {
                root = k < 4 ? 45 : (k < 6 ? 43 : 45);
            }
            const gap = subGaps[v] && k % 2 === 1;
            subBar(s, bar, root, gap, subLevel[v]);
            if (talkPlan[v] !== null) {
                talkBar(s, bar, root, talkPlan[v], gap && v >= 6);
            }
            if (drumDensity[v] >= 0) {
                kit(s, bar, drumDensity[v]);
            }
        }
    }
    // the continuo throat breathes through the "ground above" and the chorale
    for (const v of [8, 10]) {
        s.at(at(varStart(v)), "state", "env", { part: "bass", index: 0, attack: 0.3, release: 0.7 });
        s.at(at(varStart(v)), "state", "orbit", { part: "bass", index: 0, rate: 0.125 / BEAT, shape: "sine", depth: 0.35, round: 0.5, phase: 0.0 });
        for (let k = 0; k < 4; k = k + 1) {
            s.at(at(varStart(v) + 8 * k), "state", "voice", { part: "bass", index: 0, note: GROUND[k], glide: 0.1 });
        }
        s.at(at(varStart(v + 1)) - 0.05, "state", "voiceOff", { part: "bass", index: 0 });
        s.at(at(varStart(v + 1)), "state", "env", { part: "bass", index: 0, attack: 0.003, release: 0.025 });
        s.at(at(varStart(v + 1)), "state", "orbit", { part: "bass", index: 0, rate: 0.0, shape: "sine", depth: 0.0, round: 0.0 });
    }
    // the rise: throats lift (tube shortens) across variation 6
    s.at(at(varStart(5)), "state", "voiceSet", { part: "bass", index: 0, name: "larynxGlide", value: 6.0 });
    s.at(at(varStart(5)), "state", "voiceSet", { part: "bass", index: 0, name: "larynx", value: 0.9 });
    s.at(at(varStart(6)) - 0.05, "state", "voiceSet", { part: "bass", index: 0, name: "larynxGlide", value: 0.05 });
    s.at(at(varStart(6)) - 0.05, "state", "voiceSet", { part: "bass", index: 0, name: "larynx", value: 0.0 });
    // builds: snare roll and riser; the breath before the drop
    for (const v of [5, 11]) {
        const b0 = v * 8;
        for (let b = 0; b < 8; b = b + 1) {
            let division = 1.0;
            if (b >= 2) { division = 0.5; }
            if (b >= 4) { division = 0.25; }
            if (b >= 6) { division = 0.125; }
            const beats = b === 7 ? 2.0 : 4.0;
            for (let x = 0.0; x < beats - 1e-6; x = x + division) {
                s.at(at((b0 + b) * 4 + x), "trigger", "snare", { amp: 0.2 + 0.6 * (b * 4 + x) / 30.0 });
            }
        }
        s.at(at((b0 + 4) * 4), "trigger", "riser", { seconds: 3.5 * BAR, amp: 0.9 });
        s.at(at((b0 + 7) * 4 + 2), "trigger", "kang", { note: 69, level: 0.85, seconds: 0.55 });
        s.at(at((b0 + 7) * 4 + 2), "state", "off", { part: "upper" });
        s.at(at((b0 + 7) * 4 + 2), "state", "sub", { note: 45, level: 0.0 });
        s.at(at((b0 + 8) * 4), "trigger", "impact", { amp: 1.0 });
        s.at(at((b0 + 8) * 4), "trigger", "rolmo", { amp: 0.9, bright: 1.0 });
    }
    // ritual colour
    horn(s, at(0), 0, 33, 6 * BAR, 0.45, 0.35);
    horn(s, at(16) - 1.0, 1, 33, 6 * BAR, 0.45, 0.35);
    horn(s, at(varStart(8)), 0, 33, 8 * BAR, 0.5, 0.35);
    horn(s, at(varStart(8) + 16) - 1.0, 1, 33, 8 * BAR, 0.5, 0.35);
    for (const v of [6, 12, 14]) {
        for (let k = 0; k < 8; k = k + 2) {
            s.at(at(varStart(v) + 4 * k), "state", "horn", { which: (k / 2) % 2, note: GROUND[k / 2], level: 1.0, attack: 0.05, growl: 0.55 });
            s.at(at(varStart(v) + 4 * k + 0.6), "state", "hornStop", { which: (k / 2) % 2, release: 0.2 });
        }
    }
    W.gyalingLine(s, M.shiftTime(M.transposeLine(THEME, -12), varStart(8)), 0.75);
    rolmoPattern(s, at(varStart(1)), 1.2, 0.84, 14, 0.35, true);
    rolmoPattern(s, at(varStart(8)), 0.25, 1.16, 11, 0.45, false);
    for (let v = 0; v < 16; v = v + 1) {
        s.at(at(varStart(v)), "trigger", "nga", { amp: 0.7 });
    }
    s.at(at(varStart(3)), "trigger", "bell", { amp: 0.5 });
    s.at(at(varStart(10)), "trigger", "bell", { amp: 0.6 });
    // coda: open fifth, whistle on harmonic 12 of the A drone
    s.at(at(varStart(15) + 24), "state", "overtone", { drone: 45, harmonic: 12, pitch: 88 });

    // ---- outro (free time)
    const tEnd = at(16 * 32);
    s.at(tEnd, "state", "off", { part: "upper" });
    s.at(tEnd, "state", "sub", { note: 45, level: 0.0 });
    s.at(tEnd, "state", "note", { part: "monks", note: 45 });
    s.at(tEnd + 0.2, "state", "set", { part: "monks", name: "hum", value: 0.0 });
    s.at(tEnd + 8.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(tEnd + 14.0, "state", "off", { part: "monks" });
    s.at(tEnd + 12.0, "state", "off", { part: "solo" });
    rolmoPattern(s, tEnd + 0.4, 0.12, 1.22, 12, 0.55, false);
    horn(s, tEnd, 0, 33, 8.0, 0.85, 0.4);
    s.at(tEnd + 6.0, "state", "hornBend", { which: 0, note: 45 });
    horn(s, tEnd + 6.0, 1, 33, 10.0, 0.8, 0.45);
    s.at(tEnd + 14.0, "state", "hornBend", { which: 1, note: 45 });
    s.at(tEnd + 8.0, "trigger", "bell", { amp: 0.6 });
    s.at(tEnd + 15.0, "trigger", "bell", { amp: 0.7 });
    s.at(LENGTH, "state", "end", {});
    s.events.sort(compareTime);
    return s.events;
}

function compareTime(a, b) {
    return a.t - b.t;
}

export function partConfigs() {
    const monks = [
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, pan: -0.5, detune: -5, onset: 0.04, vibratoDepth: 0.03, effort: 0.75, larynx: -0.3, level: 1.0 }),
        Object.assign(makeSingerConfig("bass", "ventricular", 0), { octave: 0, pan: -0.2, detune: 4, onset: 0.09, vibratoDepth: 0.03, effort: 0.8, larynx: -0.4, level: 0.6 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, pan: 0.1, detune: 6, vibratoDepth: 0.04, effort: 0.75, larynx: -0.2, level: 1.0, lengthScale: 1.03 }),
        Object.assign(makeSingerConfig("bass", "chest", 0), { octave: 0, pan: 0.35, detune: -3, onset: 0.07, vibratoDepth: 0.03, effort: 0.8, larynx: -0.3, level: 0.9, lengthScale: 0.98 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, pan: 0.6, detune: -8, onset: 0.12, vibratoDepth: 0.04, effort: 0.7, larynx: -0.3, level: 1.0, lengthScale: 0.97 })
    ];
    const upper = [
        Object.assign(makeSingerConfig("countertenor", "falsetto", 0), { octave: 0, tuning: "r1", pan: -0.35, vibratoDepth: 0.18, level: 1.0 }),
        Object.assign(makeSingerConfig("tenor", "head", 0), { octave: 0, pan: 0.35, vibratoDepth: 0.14, level: 0.95 }),
        Object.assign(makeSingerConfig("tenor", "chest", 0), { octave: 0, pan: 0.05, vibratoDepth: 0.12, epilarynx: 0.5, level: 0.9 })
    ];
    const solo = [
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "sygyt", vibratoDepth: 0.1, vibratoRate: 4.6, driftCents: 1.0, effort: 0.9, epilarynx: 0.6, level: 4.0, pan: 0.0 })
    ];
    const bass = [
        Object.assign(makeSingerConfig("basso", "ventricular", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, larynx: 0.0, level: 1.0, pan: 0.0, attack: 0.003, release: 0.025 }),
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, epilarynx: 0.7, level: 1.1, pan: 0.15, attack: 0.003, release: 0.02 }),
        Object.assign(makeSingerConfig("bass", "fry", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 0.5, effort: 1.0, level: 1.0, pan: -0.15, attack: 0.002, release: 0.015 })
    ];
    return { monks: monks, upper: upper, solo: solo, bass: bass };
}

export const PASSACAGLIA = {
    id: "passacaglia",
    title: "Passacaglia on a Throat Ground",
    sections: SECTIONS,
    length: LENGTH,
    grid: INTRO,
    bar: BAR,
    buildScore: buildScore,
    partConfigs: partConfigs,
    setup: function setupPassacaglia(engine) {
        engine.parts.upper.setGlobal("glide", 0.02);
        engine.parts.solo.setGlobal("glide", 0.03);
        engine.parts.monks.setGlobal("glide", 0.08);
        engine.parts.bass.setGlobal("halftone", 0.45);
        engine.parts.bass.setGlobal("vowelGlide", 0.01);
        engine.parts.bass.setGlobal("glide", 0.01);
        engine.parts.upper.setGlobal("vowelGlide", 0.05);
        engine.hall.mix = 0.4;
        engine.hall.setTime(4.0, 0.5);
    },
    warmSpots: [4.0, at(varStart(2) + 6), at(varStart(4) + 10), at(varStart(6) + 6), at(varStart(7) + 2), at(varStart(8) + 6), at(varStart(10) + 4), at(varStart(12) + 6), at(varStart(15) + 26)]
};

export { chordAtBeat };
