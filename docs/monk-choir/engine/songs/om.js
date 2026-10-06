// "Om of Ten Throats": a slow ritual piece for ten physical voices and the
// ritual instruments. About five minutes and three quarters, on C.
//
// The idea. Nearly every voice here sings on one key note, C, and the music
// is made by what the throats do with it rather than by changing the note:
//   - the Gyuto chord: a monk on C2 (65 Hz) tunes his first resonance onto
//     one harmonic of his own voice and his second onto another, so one
//     voice sounds a chord. The harmony of the piece is the choice of those
//     two harmonics (5 and 10 is E and E, 4 and 10 C and E, 6 and 10 G and
//     E, 6 and 9 G and D), changed one monk after another;
//   - period doubling as form: two voices on C3 sing with self-oscillating
//     vocal folds (larynx.js). Drawing the false folds in lets them lock by
//     themselves onto every second cycle of the vocal folds, so the voice
//     sounds C2, an octave down. As in the Sardinian bassu, the doubling
//     settles in just after an m opens and lets go on a closing m, so each
//     phrase begins and ends on m;
//   - nasal khöömei through the Om: while the monks hold the m, one
//     baritone seals his lips, opens his velum and sings harmonics of his
//     C3 through the nose, shaping the closed mouth behind the lips;
//   - the overtone chorale: three baritones on one drone, each with two
//     tongue narrowings that merge two resonances into one sharp peak, put
//     three different harmonics forward, so the chorale's chords are made of
//     the drone's own harmonics. It is sung on G2, the one place the drone
//     leaves C (8 10 12 = G B D), and its last phrase climbs back to C3;
//   - the ritual instruments mark the form: dungchen in overlapping pairs,
//     conch, bell, cymbals accelerating and decelerating, the drum.
// The melodies and the chorale are original. The mantra syllables are the
// traditional "om mani padme hum".

import { makeSingerConfig } from "../choir.js?v=4bc8bf7bb1";
import { Score, MANTRA, rolmoPattern, horn, makeWriters } from "./common.js?v=036c2aecc9";
import * as K from "./throatkit.js?v=8184da9860";

const CHANT = 36;        // C2 (65 Hz): the Gyuto monks
const DOUBLED = 48;      // C3 (131 Hz): the folds voices; doubled they sound C2
const DRONE = 48;        // C3: the overtone singers' drone

// The pulse of the Gathering: 50 beats a minute, four to a bar.
const PULSE = 1.2;
const PULSE_BAR = 4.0 * PULSE;

// Section starts (seconds).
const T_INVOKE = 0.0;
const T_OM = 32.0;
const T_NOSE = 92.0;
const T_CHORDS = 140.0;
const T_CHORALE = 188.0;
const T_GATHER = 258.0;

// The cymbals' accelerando that opens the Gathering, and where its roll
// ends: the pulse starts on the crash.
const ROLL_START = T_GATHER + 0.5;
const ROLL_GAP = 1.4;
const ROLL_RATIO = 0.88;
const ROLL_COUNT = 20;

function rollEnd(t0, firstGap, ratio, count) {
    let t = t0;
    let gap = firstGap;
    for (let i = 0; i < count; i = i + 1) {
        t = t + gap;
        gap = gap * ratio;
    }
    return t;
}

const GRID = rollEnd(ROLL_START, ROLL_GAP, ROLL_RATIO, ROLL_COUNT);
const GATHER_BARS = 8;
const T_DISSOLVE = GRID + GATHER_BARS * PULSE_BAR;
const LENGTH = T_DISSOLVE + 40.0;

function pulseTime(bar, beat) {
    return GRID + bar * PULSE_BAR + beat * PULSE;
}

// makeWriters maps beats to seconds; this piece writes seconds directly.
function seconds(x) {
    return x;
}

const W = makeWriters(seconds);

export const SECTIONS = [
    { name: "Invocation", start: T_INVOKE, text: "Two dungchen take turns on one low C, overlapping so the drone never breaks. The conch calls twice, the bell opens the space and the cymbal strokes speed up into a roll." },
    { name: "The low Om", start: T_OM, text: "Two voices on C3 sing with self-oscillating vocal folds. Each phrase opens from an m; as the mouth opens their false folds are drawn in and lock by themselves onto every second cycle of the vocal folds, and the voice drops an octave to C2. Then four monks chant om mani padme hum on C2, each tuning his first resonance to his 5th harmonic and his second to his 10th: a major tenth inside one voice." },
    { name: "Through the nose", start: T_NOSE, text: "The monks hold the m of the Om. Over the hum a baritone seals his lips and opens his velum, so his voice leaves through the nose, and reshapes the closed mouth behind his lips to put single harmonics of his C3 forward: 5 to 9, E G B-flat C D (the 7th harmonic is a B-flat lower than the piano's). The melody is original." },
    { name: "Chord changes", start: T_CHORDS, text: "Same pitch, new chords. The monks open the mantra again, one syllable for each chord, and move their two resonances to other harmonics of their C2 one after another: 5 and 10 (E), 4 and 8 (C), 4 and 10 (C, E), 6 and 10 (G, E), 6 and 9 (G, D), and home to 5 and 10. The doubled voices breathe in and out on m." },
    { name: "Overtone chorale", start: T_CHORALE, text: "Three baritones on one drone, G2. Each narrows his tongue twice, at the ridge behind the teeth and at the back, merging two resonances into one sharp peak that lifts a single harmonic about 15 to 25 dB over its neighbours. The whistles fall onto one shared harmonic, open into G B D (harmonics 8, 10, 12) and move as an original three-part chorale, sliding between harmonics, with tongue trills on the cadences. For the last phrase each breathes and returns on C3: G C E." },
    { name: "Gathering", start: T_GATHER, text: "The cymbal strokes speed up into a roll and the drum settles into a slow pulse with a deep tone under it. Everyone together: the chant on the pulse, its resonances spread over a C major chord across the monks; the doubled voices, one of them walking its vowel over harmonics of its own sub-octave; a whistle melody; and a countertenor singing the mantra on an original line." },
    { name: "Dissolution", start: T_DISSOLVE, text: "The pulse lets go and the cymbals slow like a bouncing ball. Each doubled voice closes on an m: the false folds let go and its sub-octave vanishes. The whistles stop one by one, the horns rise to their upper partial and the Om closes into a hum." }
];

// ------------------------------------------------------------------ material

// How each syllable of the mantra ends: the m of "om" and "hum" closes the
// lips (and holds the Gyuto tuning still), the d of "pad" taps the ridge.
const CLOSINGS = ["m", "", "", "d", "", "m"];

// The Gyuto chord progression of "Chord changes", one stage per syllable:
// [harmonic for F1, harmonic for F2] of the monks' C2. Measured reachable
// in these bodies (F1 and F2 within a few Hz of target); 5/12 and 7/14
// were tried and the first resonance does not follow (F1 stays near 410 Hz).
const CHORD_STAGES = [[5, 10], [4, 8], [4, 10], [6, 10], [6, 9], [5, 10]];

// Through the nose: [harmonic, seconds] over C3. Measured from this drone
// the nasal gesture puts harmonics 5-8 forward strongly (14-22 dB over the
// neighbours and loud), 9 somewhat weaker; 10 and 11 hardly at all, and 12
// up stands out but 20 dB softer, so the line keeps to E G B-flat C D.
const NASAL_PHRASES = [
    [[8, 2.2], [9, 1.0], [8, 1.0], [6, 2.0], [5, 1.6], [6, 1.4], [8, 3.0]],
    [[6, 1.2], [8, 1.0], [9, 1.6], [8, 1.6], [7, 1.4], [6, 1.0], [5, 1.2], [6, 1.0], [7, 1.2], [6, 2.6]],
    [[5, 1.4], [6, 1.0], [8, 1.0], [9, 1.2], [8, 0.6], [6, 0.6], [8, 2.0], [7, 1.0], [6, 1.4], [5, 1.6], [6, 1.2], [8, 4.0]]
];

// The focus whistle is loud only below about 1.5 kHz: above it the gesture
// needs nearly closed lips and the whistle, though still 20 dB over its
// neighbours, comes out some 30 dB softer (measured, these bodies). On a
// C3 drone that leaves harmonics 6-11, so a triad 8 10 12 would lose its
// top voice. On G2 (98 Hz) harmonics 8-14 are all loud: 8 10 12 is G B D.
// So the chorale is sung on G2, the dominant, and its last phrase moves the
// drone up a fourth to C3, where 6 8 10 (G C E) is the tonic: the low
// whistle keeps its G, the other two step up, B to C and D to E.
const CHORALE_LOW = 43;   // G2

// The overtone chorale: [low, middle, high] harmonics of the shared drone,
// seconds, which voice trills on it (-1 none), and the drone. On G2:
// 8 10 12 = G B D, 8 9 12 = G A D, 9 12 14 = A D F (the 14th harmonic is a
// low F, the natural seventh), 10 12 14 = B D F, 8 12 14 = G D F,
// 9 12 13 = A D E (13: a low E), 10 12 13 = B D E. On C3: 6 8 10 = G C E,
// 6 8 9 = G C D. The voices are cast to the harmonics each body sings
// loudest (singer 0 low, 1 middle, 2 high). Original.
const CHORALE = [
    // phrase 1, on G2: a cadence with a trill on A falling to G
    [[8, 10, 12], 4.0, -1, CHORALE_LOW],
    [[8, 9, 12], 3.5, -1, CHORALE_LOW],
    [[8, 10, 12], 3.5, -1, CHORALE_LOW],
    [[9, 12, 14], 4.0, 0, CHORALE_LOW],
    [[8, 10, 12], 5.5, -1, CHORALE_LOW],
    // phrase 2, on G2: around the natural seventh
    [[10, 12, 14], 3.5, -1, CHORALE_LOW],
    [[8, 12, 14], 3.5, -1, CHORALE_LOW],
    [[9, 12, 13], 3.5, -1, CHORALE_LOW],
    [[10, 12, 13], 3.5, -1, CHORALE_LOW],
    [[10, 12, 14], 4.5, 1, CHORALE_LOW],
    [[8, 10, 12], 5.5, -1, CHORALE_LOW],
    // phrase 3: the drone rises to C3
    [[6, 8, 10], 4.5, -1, DRONE],
    [[6, 8, 9], 4.0, 2, DRONE],
    [[6, 8, 10], 6.5, -1, DRONE]
];
// Where the singers breathe: [chord index, singer, seconds from the
// chord's start], staggered so the drone never stops. Before the last
// phrase each one breathes and comes back on the new drone.
const CHORALE_BREATHS = [[5, 1, -0.6], [5, 0, 0.9], [5, 2, 2.2], [11, 0, 0.0], [11, 1, 0.7], [11, 2, 1.4]];

// The whistle melody over the pulse: [harmonic, beats] of C3, inside the
// loud band 6-10 (G B-flat C D E), moving by step or through C; the singer
// breathes before the step marked in PULSE_WHISTLE_BREATH.
const PULSE_WHISTLE = [
    [10, 2], [9, 1], [10, 1], [9, 2], [8, 2],
    [6, 2], [8, 1], [9, 1], [10, 2], [8, 2],
    [9, 1], [10, 1], [9, 2], [8, 2], [7, 1], [6, 1],
    [8, 4]
];
const PULSE_WHISTLE_BREATH = 10;

// The countertenor's mantra line: [pitch, beats], C major pentatonic.
const CT_LINE = [
    [67, 3], [69, 1], [67, 2], [64, 2],
    [62, 2], [64, 2], [67, 4],
    [72, 3], [69, 1], [67, 2], [64, 2],
    [62, 2], [60, 2]
];

// The kargyraa vowel walk: harmonics of the doubled voice's sub-octave (C2),
// one step per pulse beat; the even ones are also harmonics of C3.
const WALK = "4 4 6 6 5 5 6 8 6 6 4 4 5 6 4 4";

// ------------------------------------------------------------------ writers

// One mantra syllable for the whole monks part: consonant onset, vowel.
function monkSyllable(s, t, index) {
    const syl = MANTRA[index];
    if (syl.c === "m") {
        s.at(t, "state", "set", { part: "monks", name: "hum", value: 1.0 });
        s.at(t + 0.09, "state", "set", { part: "monks", name: "hum", value: 0.0 });
    } else if (syl.c === "n") {
        s.at(t, "state", "set", { part: "monks", name: "stopTip", value: 1.0 });
        s.at(t, "state", "set", { part: "monks", name: "velumOpen", value: 1.0 });
        s.at(t + 0.08, "state", "set", { part: "monks", name: "stopTip", value: 0.0 });
        s.at(t + 0.1, "state", "set", { part: "monks", name: "velumOpen", value: 0.0 });
    } else if (syl.c === "p") {
        s.at(t, "state", "set", { part: "monks", name: "stopLip", value: 1.0 });
        s.at(t + 0.05, "state", "set", { part: "monks", name: "stopLip", value: 0.0 });
    } else {
        s.at(t, "state", "set", { part: "monks", name: "hum", value: 0.0 });
    }
    s.at(t, "state", "set", { part: "monks", name: "vowel", value: syl.v });
}

// The mantra over the given syllable lengths (seconds). `close` is the
// fraction of a syllable after which a closing m or d sounds; a late close
// keeps the mouth open (and the Gyuto chord audible) for longer. Returns
// the end time.
function monkMantra(s, t0, durs, close) {
    let t = t0;
    for (let i = 0; i < MANTRA.length; i = i + 1) {
        monkSyllable(s, t, i);
        const d = durs[i % durs.length];
        if (CLOSINGS[i] === "m") {
            s.at(t + d * close, "state", "set", { part: "monks", name: "hum", value: 1.0 });
        } else if (CLOSINGS[i] === "d") {
            s.at(t + d * 0.88, "state", "set", { part: "monks", name: "stopTip", value: 1.0 });
            s.at(t + d * 0.95, "state", "set", { part: "monks", name: "stopTip", value: 0.0 });
        }
        t = t + d;
    }
    return t;
}

// Both resonance targets of one monk.
function gyutoChord(s, t, index, h1, h2) {
    K.setSinger(s, t, "monks", index, "gyutoH1", h1);
    K.setSinger(s, t, "monks", index, "gyutoH2", h2);
}

// The same chord for all four monks, each a little after the last, so for a
// moment the old and the new chord sound together.
function gyutoStagger(s, t, h1, h2, step) {
    for (let i = 0; i < 4; i = i + 1) {
        gyutoChord(s, t + i * step, i, h1, h2);
    }
}

// One phrase of a doubled voice (bass part, self-oscillating folds). It
// begins on a hum (m) with the false folds open; as the lips part, the half
// tone draws the false folds in and they lock onto every second glottal
// cycle. Near the end the lips close again (the closing m) and the false
// folds are released, so the sub-octave vanishes before the voice stops.
// The vowel is chosen under the m and held: a vowel gliding while the folds
// were locked once blew the modelled folds wide open for a few milliseconds
// (a click about 12 times the voice's level), so the mouth stays still.
function doubledPhrase(s, t, index, len, vowel, note) {
    K.setSinger(s, t - 0.02, "bass", index, "own.hum", 1.0);
    K.setSinger(s, t - 0.02, "bass", index, "own.halftone", 0.0);
    K.vowel(s, t - 0.02, "bass", index, vowel);
    K.voice(s, t, "bass", index, note === undefined ? DOUBLED : note, 0.05);
    K.setSinger(s, t + 0.45, "bass", index, "own.hum", 0.0);
    K.setSinger(s, t + 0.45, "bass", index, "own.halftone", 0.8);
    K.setSinger(s, t + len - 1.6, "bass", index, "own.hum", 1.0);
    K.setSinger(s, t + len - 1.6, "bass", index, "own.halftone", 0.0);
    K.off(s, t + len, "bass", index);
}

// The whistles. In the tube model a large sudden move of the tongue
// through the focus gesture's narrow ridge constriction clicks (measured on
// lone singers: 10-70 times the whistle's level for moves of three or more
// harmonics, or two downward; single steps and the nasal gesture stay
// clean). So a whistle moves between harmonics by sliding through the ones
// between, SLIDE seconds each, and a whistle's very first note (while the
// singer is still learning the map of his mouth, about 0.3 s, the tongue
// waits in the middle of the gesture, near 1.37 kHz) starts on the harmonic
// nearest that and falls into place. Both are ordinary throat-singing
// gestures: the slide, and the entry from above.
const SLIDE = 0.12;
const ENTRY_HZ = 1373.0;

// The harmonic each solo singer is putting forward, as the score is written.
const current = [0, 0, 0];

function hz(note) {
    return 440.0 * Math.pow(2.0, (note - 69.0) / 12.0);
}

// Move solo singer `index` to harmonic h from time t; returns when it
// arrives.
function moveTo(s, t, index, h, step) {
    const dt = step === undefined ? SLIDE : step;
    let tt = t;
    while (Math.abs(h - current[index]) > 1) {
        current[index] = current[index] + (h > current[index] ? 1 : -1);
        K.harmonic(s, tt, "solo", index, current[index]);
        tt = tt + dt;
    }
    current[index] = h;
    K.harmonic(s, tt, "solo", index, h);
    return tt;
}

// A solo singer starts its drone (C3 unless given) on harmonic h; the
// harmonic is set first so the piano roll knows what it draws. The drone
// starts on its pitch: a pitch glide at the start would drag the tongue
// along with the moving harmonic.
function whistleOn(s, t, index, h, note) {
    current[index] = h;
    K.harmonic(s, t - 0.01, "solo", index, h);
    K.voice(s, t, "solo", index, note === undefined ? DRONE : note, 0.005);
}

// A first entrance: from the harmonic nearest the waiting tongue, a held
// glint, then a fall onto h. The voice swells in slowly (a 1.6 s attack),
// so that whatever move the tongue makes when the map is first ready is
// made almost silently; a singer whose tongue still waits where his last
// (nasal) map left it clicked there at full level.
function whistleEnter(s, t, index, h, note) {
    const drone = note === undefined ? DRONE : note;
    s.at(t - 0.02, "state", "env", { part: "solo", index: index, attack: 1.6, release: 0.25 });
    s.at(t + 4.0, "state", "env", { part: "solo", index: index, attack: 0.08, release: 0.25 });
    whistleOn(s, t, index, Math.round(ENTRY_HZ / hz(drone)), drone);
    return moveTo(s, t + 0.6, index, h, 0.2);
}

// A whistle breathes before time t and comes back on the harmonic it left,
// then slides to h.
function whistleBreath(s, t, index, h, note) {
    K.off(s, t - 0.75, "solo", index);
    whistleOn(s, t, index, current[index], note);
    moveTo(s, t + 0.15, index, h);
}

// A cadence ornament: the tongue rocks between harmonic n and n + 1.
function trill(s, t, index, len) {
    K.setSinger(s, t, "solo", index, "ornRate", 5.5);
    K.setSinger(s, t, "solo", index, "ornDepth", 1.0);
    K.setSinger(s, t, "solo", index, "ornament", "trill");
    K.setSinger(s, t + len, "solo", index, "ornament", "none");
}

// When chorale singer v breathes around chord k (seconds from the chord's
// start), or null.
function breathAt(k, v) {
    for (let b = 0; b < CHORALE_BREATHS.length; b = b + 1) {
        if (CHORALE_BREATHS[b][0] === k && CHORALE_BREATHS[b][1] === v) {
            return CHORALE_BREATHS[b][2];
        }
    }
    return null;
}

// A melody in [value, beats] steps on the pulse grid from (bar, beat).
function pulseSteps(steps, bar, beat) {
    const out = [];
    let b = bar * 4 + beat;
    for (let i = 0; i < steps.length; i = i + 1) {
        out.push({ t: pulseTime(0, b), value: steps[i][0], dur: steps[i][1] * PULSE });
        b = b + steps[i][1];
    }
    return out;
}

// ------------------------------------------------------------------ score

export function buildScore() {
    const s = new Score();
    for (let i = 0; i < current.length; i = i + 1) {
        current[i] = 0;
    }

    // Each monk breathes on his own clock, so the chant never stops at once.
    const breaths = [13.5, 15.0, 16.5, 18.0];
    for (let i = 0; i < 4; i = i + 1) {
        K.setSinger(s, 0.0, "monks", i, "phrase", breaths[i]);
        K.setSinger(s, 0.0, "monks", i, "breathGap", 0.9);
    }

    // ---- Invocation: the horns, the conch, the bell
    K.section(s, T_INVOKE, 0);
    s.at(0.5, "trigger", "bell", { amp: 0.8 });
    horn(s, 1.0, 0, CHANT, 10.0, 0.85, 0.35);
    s.at(4.5, "trigger", "conch", { note: 55, level: 0.85, seconds: 3.0 });
    horn(s, 8.5, 1, CHANT, 10.0, 0.9, 0.4);
    s.at(13.0, "trigger", "conch", { note: 55, level: 0.75, seconds: 3.6 });
    horn(s, 16.0, 0, CHANT, 11.0, 0.8, 0.4);
    s.at(19.0, "trigger", "bell", { amp: 0.55 });
    const crash = rolmoPattern(s, 20.5, 1.0, 0.8, 10, 0.35, true);
    s.at(crash, "trigger", "nga", { amp: 0.85 });
    horn(s, 24.5, 1, CHANT, 13.0, 0.6, 0.35);

    // ---- The low Om: the doubled voices alone, then the Gyuto chant
    K.section(s, T_OM, 1);
    doubledPhrase(s, T_OM + 1.0, 0, 11.0, 0.25);
    doubledPhrase(s, T_OM + 6.0, 1, 11.5, 0.3);
    doubledPhrase(s, T_OM + 13.5, 0, 12.0, 0.3);
    doubledPhrase(s, T_OM + 18.5, 1, 12.5, 0.25);
    doubledPhrase(s, T_OM + 33.0, 0, 13.0, 0.3);
    doubledPhrase(s, T_OM + 40.0, 1, 14.0, 0.35);
    horn(s, T_OM + 14.0, 0, CHANT, 12.0, 0.35, 0.3);
    const tChant = T_OM + 18.0;
    s.at(tChant, "trigger", "bell", { amp: 0.6 });
    s.at(tChant, "trigger", "nga", { amp: 0.8 });
    gyutoStagger(s, tChant - 0.5, 5, 10, 0.0);
    s.at(tChant, "state", "note", { part: "monks", note: CHANT });
    const tMantraEnd = monkMantra(s, tChant + 0.5, [8.0, 4.5, 5.0, 5.5, 4.5, 9.0], 0.72);
    s.at(tMantraEnd - 4.0, "trigger", "nga", { amp: 0.6 });
    horn(s, tChant + 12.0, 1, CHANT, 16.0, 0.35, 0.3);

    // ---- Through the nose: the monks hold the m, the nasal whistle
    K.section(s, T_NOSE, 2);
    s.at(T_NOSE, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(T_NOSE, "state", "set", { part: "monks", name: "vowel", value: 0.1 });
    s.at(T_NOSE, "trigger", "bell", { amp: 0.45 });
    let tn = T_NOSE + 1.5;
    for (let p = 0; p < NASAL_PHRASES.length; p = p + 1) {
        whistleOn(s, tn, 0, NASAL_PHRASES[p][0][0]);
        tn = K.overtoneMelody(s, tn, "solo", 0, NASAL_PHRASES[p]);
        K.off(s, tn, "solo", 0);
        s.at(tn, "trigger", "nga", { amp: 0.35 });
        tn = tn + 1.4;
    }
    // one soft doubled phrase deepens the hum under the second nasal phrase
    doubledPhrase(s, T_NOSE + 22.0, 1, 16.0, 0.15);

    // ---- Chord changes: the mantra again, one chord per syllable
    K.section(s, T_CHORDS, 3);
    s.at(T_CHORDS, "trigger", "rolmo", { amp: 0.4, bright: 0.6 });
    s.at(T_CHORDS, "trigger", "nga", { amp: 0.7 });
    const stage = 8.0;
    monkMantra(s, T_CHORDS + 0.5, [stage], 0.88);
    for (let k = 0; k < CHORD_STAGES.length; k = k + 1) {
        const tk = T_CHORDS + 0.5 + k * stage;
        if (k > 0) {
            gyutoStagger(s, tk + 0.6, CHORD_STAGES[k][0], CHORD_STAGES[k][1], 1.1);
            s.at(tk, "trigger", "rolmo", { amp: 0.22, bright: 0.5 });
        }
    }
    doubledPhrase(s, T_CHORDS + 3.0, 0, 14.0, 0.3);
    doubledPhrase(s, T_CHORDS + 10.0, 1, 15.0, 0.25);
    doubledPhrase(s, T_CHORDS + 19.0, 0, 13.0, 0.35);
    doubledPhrase(s, T_CHORDS + 27.0, 1, 14.0, 0.3);
    doubledPhrase(s, T_CHORDS + 34.0, 0, 13.5, 0.25);
    horn(s, T_CHORDS + 2.0, 0, CHANT, 18.0, 0.3, 0.3);
    horn(s, T_CHORDS + 18.0, 1, CHANT, 18.0, 0.3, 0.3);
    horn(s, T_CHORDS + 34.0, 0, CHANT, 14.0, 0.3, 0.3);
    s.at(T_CHORDS + 0.5 + 6 * stage - 1.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });

    // ---- Overtone chorale
    K.section(s, T_CHORALE, 4);
    K.setSinger(s, T_CHORALE - 3.0, "solo", 0, "tuning", "focus");
    s.at(T_CHORALE, "trigger", "bell", { amp: 0.55 });
    s.at(T_CHORALE + 12.0, "state", "off", { part: "monks" });
    // the three whistles fall one after another onto one shared harmonic
    // (G5, the 8th of G2), then open into the triad
    whistleEnter(s, T_CHORALE + 0.5, 0, 8, CHORALE_LOW);
    whistleEnter(s, T_CHORALE + 1.3, 1, 8, CHORALE_LOW);
    whistleEnter(s, T_CHORALE + 2.1, 2, 8, CHORALE_LOW);
    moveTo(s, T_CHORALE + 5.5, 1, 9);
    moveTo(s, T_CHORALE + 6.3, 1, 10);
    moveTo(s, T_CHORALE + 6.5, 2, 10, 0.5);
    moveTo(s, T_CHORALE + 7.6, 2, 12, 0.3);
    let tc = T_CHORALE + 8.5;
    const chordStart = [];
    for (let k = 0; k < CHORALE.length; k = k + 1) {
        chordStart.push(tc);
        const c = CHORALE[k];
        const droneBefore = k > 0 ? CHORALE[k - 1][3] : c[3];
        for (let v = 0; v < 3; v = v + 1) {
            const br = breathAt(k, v);
            if (br !== null && br < 0.0) {
                // breathes just before the chord, comes back on its old note
                K.off(s, tc + br - 0.75, "solo", v);
                whistleOn(s, tc + br, v, current[v], droneBefore);
            }
            if (br !== null && br >= 0.0) {
                // holds its old harmonic, breathes during the chord and comes
                // back on the new one (on the new drone, if it changed)
                if (c[3] !== droneBefore) {
                    K.off(s, tc + br - 0.75, "solo", v);
                    whistleOn(s, tc + br, v, c[0][v], c[3]);
                } else {
                    whistleBreath(s, tc + br, v, c[0][v], c[3]);
                }
            } else {
                moveTo(s, tc + 0.12 * v, v, c[0][v]);
            }
        }
        if (c[2] >= 0) {
            trill(s, tc + 1.0, c[2], c[1] - 1.8);
        }
        tc = tc + c[1];
    }
    s.at(chordStart[5], "trigger", "nga", { amp: 0.45 });
    s.at(chordStart[11], "trigger", "nga", { amp: 0.45 });
    s.at(chordStart[11], "trigger", "bell", { amp: 0.35 });
    // a doubled voice on G2 under the second phrase: its false folds add
    // G1, the deepest note of the piece
    doubledPhrase(s, chordStart[5] + 1.0, 0, 18.0, 0.2, CHORALE_LOW);
    const tChoraleEnd = tc;

    // ---- Gathering: accelerando into a slow pulse, everyone together
    K.section(s, T_GATHER, 5);
    K.off(s, Math.min(T_GATHER - 0.5, tChoraleEnd), "solo", 2);
    // the low whistle rises to C and both breathe; the middle one then holds
    // C (8) under the coming melody, breathing once more mid-pulse
    moveTo(s, T_GATHER + 1.0, 0, 8);
    whistleBreath(s, T_GATHER + 6.0, 0, 8);
    whistleBreath(s, T_GATHER + 9.0, 1, 8);
    whistleBreath(s, pulseTime(4, 0), 1, 8);
    rolmoPattern(s, ROLL_START, ROLL_GAP, ROLL_RATIO, ROLL_COUNT, 0.5, true);
    horn(s, T_GATHER, 0, CHANT, 12.0, 0.5, 0.35);
    horn(s, T_GATHER + 9.0, 1, CHANT, 14.0, 0.7, 0.4);
    s.at(T_GATHER + 2.0, "state", "note", { part: "monks", note: CHANT });
    gyutoStagger(s, T_GATHER + 1.5, 5, 10, 0.0);
    s.at(T_GATHER + 2.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(T_GATHER + 2.0, "state", "set", { part: "monks", name: "vowel", value: 0.25 });
    doubledPhrase(s, T_GATHER + 3.0, 0, GRID - T_GATHER - 3.6, 0.3);
    // on the pulse
    s.at(GRID, "trigger", "nga", { amp: 1.0 });
    s.at(GRID, "trigger", "conch", { note: 55, level: 0.8, seconds: 3.0 });
    for (let bar = 0; bar < GATHER_BARS; bar = bar + 1) {
        for (let beat = 0; beat < 4; beat = beat + 1) {
            const tb = pulseTime(bar, beat);
            s.at(tb, "trigger", "nga", { amp: beat === 0 ? 0.85 : 0.4 });
        }
        // the deep tone under each downbeat (C2, a sine on the drop bus)
        s.at(pulseTime(bar, 0), "state", "sub", { note: CHANT + 12, level: 0.3 });
        s.at(pulseTime(bar, 0) + 0.9, "state", "sub", { note: CHANT + 12, level: 0.0 });
        if (bar % 2 === 1) {
            s.at(pulseTime(bar, 2), "trigger", "rolmo", { amp: 0.35, bright: 0.6 });
        }
    }
    // the chant on the pulse: two mantras of two beats a syllable, then one
    // of one beat a syllable
    let tm = monkMantra(s, pulseTime(0, 0), [2.0 * PULSE], 0.85);
    tm = monkMantra(s, tm, [2.0 * PULSE], 0.85);
    monkMantra(s, tm, [PULSE, PULSE, PULSE, PULSE, PULSE, 3.0 * PULSE], 0.7);
    // its resonances spread over C major across the monks, a suspension, home
    gyutoChord(s, pulseTime(2, 0), 0, 4, 8);
    gyutoChord(s, pulseTime(2, 1), 1, 5, 10);
    gyutoChord(s, pulseTime(2, 2), 2, 6, 10);
    gyutoChord(s, pulseTime(2, 3), 3, 4, 10);
    gyutoStagger(s, pulseTime(6, 0), 6, 9, PULSE);
    gyutoStagger(s, pulseTime(7, 2), 5, 10, 0.5 * PULSE);
    // the doubled voices: one sings doubled phrases, the other walks its
    // vowel over harmonics of its sub-octave (kargyraa)
    doubledPhrase(s, pulseTime(0, 0), 0, 4 * PULSE_BAR - 0.3, 0.45);
    doubledPhrase(s, pulseTime(4, 0), 0, 4 * PULSE_BAR + 3.0, 0.4);
    K.setSinger(s, pulseTime(1, 0) - 0.5, "bass", 1, "melody", WALK);
    K.setSinger(s, pulseTime(1, 0) - 0.5, "bass", 1, "melodyRate", 1.0 / PULSE);
    K.setSinger(s, pulseTime(1, 0) - 0.5, "bass", 1, "tuning", "vowel");
    K.setSinger(s, pulseTime(1, 0) - 0.5, "bass", 1, "own.hum", 1.0);
    K.voice(s, pulseTime(1, 0), "bass", 1, DOUBLED, 0.05);
    K.setSinger(s, pulseTime(1, 0) + 0.45, "bass", 1, "own.hum", 0.0);
    K.setSinger(s, pulseTime(1, 0) + 0.45, "bass", 1, "own.halftone", 0.8);
    // the whistle melody, with the second singer holding C underneath
    const wh = pulseSteps(PULSE_WHISTLE, 1, 0);
    for (let i = 0; i < wh.length; i = i + 1) {
        if (i === PULSE_WHISTLE_BREATH) {
            whistleBreath(s, wh[i].t, 0, wh[i].value);
        } else {
            moveTo(s, wh[i].t, 0, wh[i].value);
        }
    }
    // the countertenor's mantra line, one syllable a note
    const ct = pulseSteps(CT_LINE, 1, 0);
    for (let i = 0; i < ct.length; i = i + 1) {
        const syl = MANTRA[i % MANTRA.length];
        K.voice(s, ct[i].t, "upper", 0, ct[i].value, 0.08);
        W.consonant(s, ct[i].t, "upper", 0, syl.c);
        s.at(ct[i].t, "state", "voiceSet", { part: "upper", index: 0, name: "vowel", value: 0.25 + 0.5 * syl.v });
    }
    s.at(pulseTime(4, 0), "trigger", "bell", { amp: 0.5 });
    s.at(pulseTime(6, 0), "trigger", "conch", { note: 55, level: 0.75, seconds: 3.4 });
    horn(s, pulseTime(2, 0), 0, CHANT, 3 * PULSE_BAR, 0.8, 0.4);
    horn(s, pulseTime(4, 2), 1, CHANT, 3 * PULSE_BAR, 0.85, 0.45);
    rolmoPattern(s, pulseTime(6, 0), PULSE, 0.82, 14, 0.5, false);

    // ---- Dissolution
    const tD = T_DISSOLVE;
    K.section(s, tD, 6);
    s.at(tD, "trigger", "rolmo", { amp: 1.0, bright: 0.9 });
    s.at(tD, "trigger", "nga", { amp: 1.0 });
    rolmoPattern(s, tD + 0.4, 0.12, 1.22, 13, 0.55, false);
    // the countertenor holds its C, then leaves
    K.off(s, tD + 5.0, "upper", 0);
    // the walking voice returns to a plain doubled hum and closes on m
    K.setSinger(s, tD, "bass", 1, "tuning", "none");
    K.setSinger(s, tD, "bass", 1, "melody", "");
    K.vowel(s, tD, "bass", 1, 0.3);
    K.setSinger(s, tD + 12.0, "bass", 1, "own.hum", 1.0);
    K.setSinger(s, tD + 12.0, "bass", 1, "own.halftone", 0.0);
    K.off(s, tD + 17.0, "bass", 1);
    // the whistles stop one by one; the last descends to the 8th harmonic
    K.off(s, tD + 4.0, "solo", 1);
    moveTo(s, tD + 3.0, 0, 10);
    moveTo(s, tD + 8.0, 0, 9);
    moveTo(s, tD + 12.0, 0, 10);
    moveTo(s, tD + 14.0, 0, 9);
    trill(s, tD + 14.5, 0, 3.0);
    moveTo(s, tD + 17.5, 0, 8);
    K.off(s, tD + 21.0, "solo", 0);
    // the chant: a last open om, closing into the hum
    gyutoStagger(s, tD, 5, 10, 0.0);
    monkSyllable(s, tD + 1.0, 0);
    s.at(tD + 13.0, "state", "set", { part: "monks", name: "hum", value: 1.0 });
    s.at(tD + 27.0, "state", "off", { part: "monks" });
    horn(s, tD, 0, CHANT, 12.0, 0.85, 0.4);
    s.at(tD + 8.0, "state", "hornBend", { which: 0, note: 48 });
    horn(s, tD + 10.0, 1, CHANT, 14.0, 0.75, 0.45);
    s.at(tD + 19.0, "state", "hornBend", { which: 1, note: 48 });
    s.at(tD + 9.0, "trigger", "bell", { amp: 0.6 });
    s.at(tD + 18.0, "trigger", "bell", { amp: 0.5 });
    s.at(tD + 28.0, "trigger", "bell", { amp: 0.7 });
    s.at(tD + 28.0, "trigger", "nga", { amp: 0.7 });
    s.at(LENGTH, "state", "end", {});

    s.events.sort(K.compareTime);
    return s.events;
}

// ------------------------------------------------------------------ parts

export function partConfigs() {
    // Four Gyuto monks on C2: chest voice, resonances on harmonics 5 and 10.
    const monks = [
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "gyuto", gyutoH1: 5, gyutoH2: 10, pan: -0.55, detune: -6, onset: 0.05, vibratoDepth: 0.02, effort: 0.75, larynx: -0.3, level: 1.0 }),
        Object.assign(makeSingerConfig("bass", "chest", 0), { octave: 0, tuning: "gyuto", gyutoH1: 5, gyutoH2: 10, pan: -0.2, detune: 5, onset: 0.1, vibratoDepth: 0.02, effort: 0.75, larynx: -0.3, level: 1.0, lengthScale: 1.02 }),
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "gyuto", gyutoH1: 5, gyutoH2: 10, pan: 0.2, detune: 8, onset: 0.0, vibratoDepth: 0.03, effort: 0.75, larynx: -0.2, level: 1.0, lengthScale: 0.98 }),
        Object.assign(makeSingerConfig("bass", "chest", 0), { octave: 0, tuning: "gyuto", gyutoH1: 5, gyutoH2: 10, pan: 0.55, detune: -3, onset: 0.14, vibratoDepth: 0.03, effort: 0.7, larynx: -0.3, level: 1.0, lengthScale: 0.97 })
    ];
    // A countertenor for the Gathering.
    const upper = [
        Object.assign(makeSingerConfig("countertenor", "falsetto", 0), { octave: 0, tuning: "r1", pan: 0.15, vibratoDepth: 0.18, level: 0.8 })
    ];
    // Three baritones: the first sings through the nose, then all three
    // use the two-constriction focus gesture.
    const solo = [
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "nasal", press: 0.55, epilarynx: 0.6, vibratoDepth: 0.0, driftCents: 1.0, effort: 0.85, level: 2.0, pan: -0.25 }),
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "focus", press: 0.6, epilarynx: 0.6, vibratoDepth: 0.0, driftCents: 1.0, effort: 0.85, level: 2.0, pan: 0.05, detune: 2, lengthScale: 1.02 }),
        Object.assign(makeSingerConfig("baritone", "pressed", 0), { octave: 0, tuning: "focus", press: 0.6, epilarynx: 0.6, vibratoDepth: 0.0, driftCents: 1.0, effort: 0.85, level: 2.0, pan: 0.3, detune: -2, lengthScale: 0.98 })
    ];
    // Two doubling voices: chest register with self-oscillating folds; their
    // own half tone (0 here) draws the false folds in only when the score
    // asks.
    const bass = [
        Object.assign(makeSingerConfig("basso", "chest", 0), { octave: 0, tuning: "none", larynxModel: "folds", pan: -0.35, vibratoDepth: 0.03, driftCents: 2.0, effort: 0.8, larynx: -0.3, level: 1.0, own: { halftone: 0.0 } }),
        Object.assign(makeSingerConfig("bass", "chest", 0), { octave: 0, tuning: "none", larynxModel: "folds", pan: 0.35, vibratoDepth: 0.03, driftCents: 2.0, effort: 0.8, larynx: -0.3, level: 1.0, lengthScale: 1.02, own: { halftone: 0.0 } })
    ];
    return { monks: monks, upper: upper, solo: solo, bass: bass };
}

export const OM = {
    id: "om",
    title: "Om of Ten Throats",
    sections: SECTIONS,
    length: LENGTH,
    grid: GRID,
    bar: PULSE_BAR,
    bassInRoom: true,
    buildScore: buildScore,
    partConfigs: partConfigs,
    setup: function setupOm(engine) {
        // the song engine gives the bass part a half tone; here the score
        // draws each voice's false folds in itself
        engine.parts.bass.setGlobal("halftone", 0.0);
        engine.parts.bass.setGlobal("vowelGlide", 0.08);
        engine.parts.bass.setGlobal("glide", 0.06);
        engine.parts.solo.setGlobal("glide", 0.05);
        engine.parts.upper.setGlobal("glide", 0.05);
        engine.parts.upper.setGlobal("vowelGlide", 0.05);
        engine.parts.monks.setGlobal("glide", 0.08);
        // a large, slow hall
        engine.hall.mix = 0.5;
        engine.hall.setTime(5.5, 0.5);
    },
    rollLabels: {
        monks: "Gyuto chant (C2)", over: "Nasal, then focus whistle", over1: "Focus whistle 2", over2: "Focus whistle 3",
        drone: "Their drone (C3)", bass0: "Doubled voice 1 (folds)", bass1: "Doubled voice 2 (folds)", upper0: "Countertenor"
    },
    warmSpots: [2.0, T_OM + 3.0, T_OM + 22.0, T_NOSE + 4.0, T_CHORDS + 12.0, T_CHORALE + 12.0, GRID + 8.0, T_DISSOLVE + 3.0]
};
