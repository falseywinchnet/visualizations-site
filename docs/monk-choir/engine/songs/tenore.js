// "Tenore and the Breath Game": two vocal traditions that both make music
// out of the mechanics of the throat, set against each other and finally
// fused with the electronic drop of the other songs. F major, free time,
// then 116 BPM (the free chorale's pulse of 58 BPM is exactly its half time).
//
// The idea. Both traditions are games with the larynx rather than melodies
// laid on top of it:
//   - In the manner of the Sardinian cantu a tenore, four men: the bassu
//     sings with his false folds drawn in, and they touch on every second
//     cycle of the true folds, so the ear hears an octave below the sung
//     note (here the self-oscillating larynx of larynx.js does this by
//     itself; it locks only for drones of about 70-150 Hz, so every bassu
//     note below is F2, Bb2 or C3, 87-131 Hz, heard at 44-65 Hz); the contra
//     sings a fifth above him with both pairs of folds in step (ventricular
//     register, ratio 1: a throaty, buzzing timbre at the sung pitch); the
//     mesu boghe sings the octave or tenth; the boghe leads with a free
//     melody, and the others answer on nonsense syllables, the chord moving
//     slowly between tonic, subdominant and dominant.
//   - In the manner of the Inuit katajjaq, two women face to face trade
//     short motifs on the out-breath and the in-breath, voiced and breathed,
//     one step apart, faster and faster, until one of them breaks off.
// And the drop turns out to need nothing new: the bassu's sub-octave is
// already a sub-bass (the Sub here plays exactly the frequency his false
// folds create, so the drop's bass line is his line), and a motif of
// breathed out/in steps one sixteenth apart is already a shaker part.
// All melodies, chord rhythms and motifs are original; the syllables are
// generic ("bo, bi, bam, no"). These are mechanical sketches in the manner
// of the two traditions, not reproductions of either.
//
// Casting. The four parts are fixed: the three low tenore voices are the
// "bass" part, and the song seats that part in the room (bassInRoom), so
// the bassu blends with his tenore instead of passing through the drop's
// saturator; in the drops the dry Sub doubles his heard sub-octave. The
// boghe and the two women are "upper"; a second pair of women ("solo")
// joins only in the second drop (and gasps before the first). "monks" holds
// one silent singer: this piece does not use the chant.

import { makeSingerConfig } from "../choir.js?v=4bc8bf7bb1";
import { Score } from "./common.js?v=036c2aecc9";
import { voice, off, setSinger, section, compareTime } from "./throatkit.js?v=8184da9860";

export const TEMPO = 116.0;
export const BEAT = 60.0 / TEMPO;
export const BAR = 4.0 * BEAT;
const RATE16 = 4.0 / BEAT;        // sixteenths per second (7.73): the breath motifs on the grid
const RATE_TRIPLET = 3.0 / BEAT;  // triplet eighths per second (5.8)
const SLOW = 2.0 * BEAT;          // the free chorale's pulse, 58 BPM

const T_SOLO = 0.8;
const T_TENORE = 28.5;
const T_GAME = T_TENORE + 43.0 * SLOW;
export const GRID = T_GAME + 42.0;     // seconds: where the pulse locks to 116 BPM

function at(beat) {
    return GRID + beat * BEAT;
}

function barT(bar) {
    return at(4.0 * bar);
}

const T_CHORALE = barT(72);
const CHORALE_BEAT = 1.2;          // the closing chorale, 50 BPM, free
export const LENGTH = T_CHORALE + 36.0;


export const SECTIONS = [
    { name: "Boghe", start: 0.0, text: "The boghe, the lead voice, sings alone in free time: an original melody with slides, turns and a slow vibrato, three phrases falling home to the tonic." },
    { name: "Tenore", start: T_TENORE, text: "In the manner of a cantu a tenore: under each of the boghe's last notes the three others answer on nonsense syllables. The bassu's false folds touch every second cycle, so he is heard an octave below what he sings; the contra a fifth above him buzzes with both pairs of folds in step; the mesu boghe sings the tenth. The chord moves slowly: tonic, subdominant, dominant." },
    { name: "Breath game", start: T_GAME, text: "In the manner of a katajjaq: two women face to face trade short original motifs on the out-breath and the in-breath, voiced and only breathed, one step apart, so one inhales while the other exhales. The motifs change and the game speeds up until it reaches the coming tempo; then one of them breaks off. The bassu and contra begin to hum." },
    { name: "Game over the tenore", start: GRID, text: "The two layers meet at 116 BPM: the tenore sings a rhythmic chord on 'bo, bi-bam, no' while the breath motifs run in sixteenths, retuned to each chord; the boghe brings the tune; a soft kick enters." },
    { name: "Build", start: barT(24), text: "The tenore rises to the dominant and opens its vowel; the women's motif becomes a breath roll that doubles its speed; snare roll and riser; then everything stops for one in-breath." },
    { name: "Drop", start: barT(32), text: "The bassu's sub-octave becomes the bass line: a sub sounds exactly the pitch his false folds make, the kick tuned to it. The contra and mesu answer in short stabs; the breath motifs, mostly unvoiced and an eighth apart, are the shaker." },
    { name: "Break", start: barT(48), text: "The drums fall away to a pulse; the tenore turns back into a slow chorale over a held sub; the women only breathe." },
    { name: "Drop II", start: barT(56), text: "The first pair switches to triplets against the straight drums while a second pair takes the sixteenths; the bassu's line syncopates; the boghe sings the whole tune over the drop." },
    { name: "Chorale and dissolve", start: T_CHORALE, text: "Free time again: the tenore's chorale and the boghe's last phrase. The voices leave one by one, the bassu's sub-octave last, on a hum; the women's game is reduced to breath, and ends on one in-breath." }
];

// ------------------------------------------------------------------ harmony

// The three tenore chords and where each voice sits in them. The bassu's
// notes are chosen inside the false folds' locking range (87-131 Hz); the
// contra is a fifth above him; the mesu boghe moves by step (tenth, octave,
// octave). "alt" is the bassu's second note in the drop's bass line;
// "women" is the base note of the breath motifs (the chord's root).
const CHORDS = {
    I: { bassu: 41, contra: 48, mesu: 57, alt: 48, women: 65 },
    IV: { bassu: 46, contra: 53, mesu: 58, alt: 41, women: 58 },
    V: { bassu: 48, contra: 55, mesu: 60, alt: 43, women: 60 }
};
const VOICE_KEYS = ["bassu", "contra", "mesu"];
const TRIO = [0, 1, 2];

// Chords per bar of the tempo sections.
const CYCLE = ["I", "I", "IV", "IV", "I", "I", "V", "V"];
const GAME_CHORDS = CYCLE.concat(CYCLE, CYCLE);                    // bars 0-23
const BUILD_CHORDS = ["I", "IV", "I", "V", "V", "V", "V", "V"];   // bars 24-31
const DROP_CHORDS = CYCLE.concat(CYCLE);                            // bars 32-47
const BREAK_CHORDS = ["I", "IV", "I", "V", "IV", "I", "V", "V"];  // bars 48-55
const DROP2_CHORDS = CYCLE.concat(["I", "I", "IV", "IV", "I", "V", "I", "I"]); // bars 56-71

function chordOfBar(bar) {
    if (bar < 24) {
        return GAME_CHORDS[bar];
    } else if (bar < 32) {
        return BUILD_CHORDS[bar - 24];
    } else if (bar < 48) {
        return DROP_CHORDS[bar - 32];
    } else if (bar < 56) {
        return BREAK_CHORDS[bar - 48];
    }
    return DROP2_CHORDS[bar - 56];
}

function hzOf(midi) {
    return 440.0 * Math.pow(2.0, (midi - 69.0) / 12.0);
}

// ------------------------------------------------------------------ melodies (original)

// The boghe's opening solo, free time: [pitch, seconds, vowel, ornament];
// pitch 0 is a breath. Three phrases, each a climb and a melismatic fall,
// the last reaching the high C and coming home to C over F's dominant.
const SOLO = [
    [60, 0.8, 0.45], [65, 1.6, 0.5, "turn"], [67, 0.35, 0.7], [65, 0.35, 0.5], [64, 0.45, 0.3], [62, 0.6, 0.5],
    [60, 0.45, 0.75], [62, 0.35, 0.5], [60, 2.2, 0.3], [0, 1.1],
    [65, 0.6, 0.5], [69, 1.4, 0.5, "turn"], [70, 0.45, 0.75], [69, 0.4, 0.5], [67, 0.4, 0.3], [65, 0.55, 0.5],
    [67, 0.3, 0.75], [65, 0.3, 0.5], [64, 0.5, 0.3], [62, 0.55, 0.5], [64, 0.4, 0.75], [65, 2.3, 0.45], [0, 1.0],
    [69, 0.7, 0.5], [72, 1.6, 0.5, "turn"], [70, 0.4, 0.75], [69, 0.4, 0.5], [67, 0.45, 0.3], [65, 0.5, 0.5],
    [64, 0.4, 0.75], [62, 0.5, 0.3], [60, 0.6, 0.5], [62, 0.35, 0.3], [60, 0.4, 0.5], [57, 0.6, 0.3], [60, 2.8, 0.45]
];

// The boghe's calls in the tenore section, in slow beats. Each ends on a
// long F the tenore enters under.
const CALL1 = [[60, 0.5, 0.45], [65, 1.0, 0.5], [67, 0.5, 0.75], [69, 0.5, 0.5], [67, 0.25, 0.3], [65, 0.25, 0.5], [64, 0.5, 0.3], [65, 4.5, 0.45]];
const CALL2 = [[69, 0.5, 0.5], [70, 0.5, 0.75], [72, 1.5, 0.5], [70, 0.5, 0.75], [69, 0.5, 0.5], [67, 0.5, 0.3], [65, 0.5, 0.5], [67, 0.5, 0.75], [64, 0.5, 0.3], [65, 4.0, 0.45]];
// Sung over the moving chords I IV I IV V I, two slow beats each.
const LINE3 = [[65, 1.0, 0.5], [69, 1.0, 0.45], [70, 1.5, 0.5], [69, 0.5, 0.75], [69, 0.5, 0.5], [67, 0.5, 0.3], [65, 1.0, 0.5],
    [62, 1.0, 0.3], [65, 1.0, 0.5], [64, 1.0, 0.45], [67, 0.5, 0.75], [64, 0.5, 0.3], [65, 2.5, 0.45]];

// The tune at tempo, eight bars over I I IV IV I I V V (beats), ending on
// the dominant's fifth, open, so it can repeat or lead on.
const TUNE = [
    [69, 2], [67, 1], [65, 1],
    [67, 1.5], [69, 0.5], [72, 2],
    [70, 3], [69, 1],
    [67, 1], [65, 1], [62, 2],
    [65, 2], [69, 2],
    [72, 1], [70, 1], [69, 1], [67, 1],
    [67, 2], [64, 2],
    [67, 3], [0, 1]
];
// Its first two bars, the hook the boghe calls in the first drop.
const HOOK = [[69, 2], [67, 1], [65, 1], [67, 1.5], [69, 0.5], [72, 1.5], [0, 0.5]];
// A cadence for the last four bars of the second drop (over I V I I).
const TUNE_END = [[69, 1], [67, 1], [65, 2], [67, 2], [64, 2], [65, 4], [65, 3.5], [0, 0.5]];
// The build: the boghe climbs while the tenore climbs to the dominant.
const BUILD_LINE = [[65, 4], [70, 4], [69, 4], [67, 4], [64, 4], [67, 4], [72, 6]];
// In the break, a long falling melisma over IV I V V.
const BREAK_LINE = [[70, 3], [69, 1], [69, 2], [65, 2], [67, 4], [67, 2], [64, 2]];
// The closing chorale's line (chorale beats) over I IV I V I.
const LAST_LINE = [[0, 0.5], [65, 0.5], [69, 1.0], [72, 1.0], [70, 1.5], [69, 0.5], [69, 0.5], [67, 0.5], [65, 1.0],
    [64, 1.0], [62, 0.5], [64, 0.5], [65, 5.0]];

// F major, for the boghe's turns (an upper neighbour from the scale).
const SCALE = [5, 7, 9, 10, 0, 2, 4];

function upperNeighbour(p) {
    for (let q = p + 1; q <= p + 3; q = q + 1) {
        if (SCALE.indexOf(((q % 12) + 12) % 12) >= 0) {
            return q;
        }
    }
    return p + 2;
}

// ------------------------------------------------------------------ the tenore's syllables

// A figure: syllables [beat, consonant, vowel] relative to a chord's start,
// sung by the three together. Vowel 0 ooh, 0.25 oh, 0.5 ah, 0.75 eh, 1 eeh;
// consonant "p" (a lip stop: b) or "d" (a tongue-tip stop), or none.
const FIG_ENTRY = [[0, "", 0.2], [1.0, "p", 0.3], [1.5, "p", 0.5]];            // "oo - bo ba"
const FIG_A = [[0, "p", 0.3], [0.75, "p", 0.85], [1.0, "p", 0.5], [1.5, "d", 0.3]];   // "bo bi-ba do"
const FIG_B = [[0, "p", 0.5], [0.5, "p", 0.3], [1.0, "p", 0.85], [1.5, "p", 0.3]];   // "ba bo bi bo"
const FIG_END = [[0, "p", 0.3], [1.0, "p", 0.2], [2.0, "", 0.12]];               // "bo - bu - oo"
// At tempo, one bar (beats): "bo . . bi-ba . do-ba".
const OSTINATO = [[0, "p", 0.3], [1.5, "p", 0.85], [2, "p", 0.5], [3, "d", 0.3], [3.5, "p", 0.6]];
// In the break, half time: "bo . bi do".
const SLOW_FIG = [[0, "p", 0.3], [2, "p", 0.75], [3, "d", 0.4]];

// The tenore section in slow beats: [beat, chord, figure].
const TENORE_CYCLE1 = [[5.5, "I", FIG_ENTRY], [8, "IV", FIG_A], [10, "I", FIG_B], [12, "V", FIG_A], [14, "I", FIG_END]];
const TENORE_CYCLE2 = [[22, "I", FIG_ENTRY], [24, "IV", FIG_A], [26, "V", FIG_B], [28, "I", FIG_END]];
const TENORE_CYCLE3 = [[30, "I", FIG_A], [32, "IV", FIG_B], [34, "I", FIG_A], [36, "IV", FIG_B], [38, "V", FIG_A], [40, "I", FIG_END]];
// The closing chorale (chorale beats).
const TENORE_LAST = [[0, "I", FIG_A], [3, "IV", FIG_B], [5, "I", FIG_A], [7, "V", FIG_B], [9, "I", FIG_END]];

// ------------------------------------------------------------------ breath motifs (original)

// Steps: d +1 out-breath / -1 in-breath, v 1 voiced / 0 breath only,
// p semitones above the base note, w vowel; {r: 1} a rest.
function voicedOut(p, w) {
    return { d: 1, v: 1, p: p, w: w };
}

function voicedIn(p, w) {
    return { d: -1, v: 1, p: p, w: w };
}

function breathOut(w) {
    return { d: 1, v: 0, p: 0, w: w };
}

function breathIn(w) {
    return { d: -1, v: 0, p: 0, w: w };
}

function rest() {
    return { r: 1 };
}

// Free game, phase 1: "saw" - low out, high in, out, a breathed in. One
// step apart, one singer always breathes in while the other breathes out.
const SAW = [voicedOut(0, 0.45), voicedIn(7, 0.15), voicedOut(0, 0.5), breathIn(0.25)];
// Phase 2: "hush and climb", six steps.
const HUSH = [voicedOut(0, 0.6), breathIn(0.3), voicedOut(7, 0.35), voicedIn(12, 0.1), breathOut(0.5), voicedIn(0, 0.2)];
// Phase 3: "knock", eight steps, with one silence.
const KNOCK = [voicedOut(0, 0.5), breathIn(0.3), voicedOut(0, 0.3), voicedIn(7, 0.15), breathOut(0.4), breathIn(0.3), voicedOut(12, 0.1), rest()];
// At tempo, half a bar of sixteenths: two voiced pairs and breath.
const TICK = [voicedOut(0, 0.45), breathIn(0.3), breathOut(0.5), voicedIn(7, 0.15), voicedOut(0, 0.5), breathIn(0.3), voicedOut(7, 0.35), breathIn(0.25)];
// At tempo, a whole bar, more voice: the motif begins to sing.
const SING = [voicedOut(0, 0.5), voicedIn(7, 0.2), voicedOut(0, 0.45), breathIn(0.3), voicedOut(12, 0.1), breathIn(0.3), voicedOut(7, 0.3), voicedIn(0, 0.2),
    voicedOut(0, 0.55), breathIn(0.3), breathOut(0.5), voicedIn(7, 0.15), voicedOut(0, 0.4), voicedIn(0, 0.2), breathOut(0.45), rest()];
// The build's breath roll, then the same roll voiced.
const ROLL = [breathOut(0.5), breathIn(0.3)];
const ROLL_VOICED = [voicedOut(0, 0.5), voicedIn(7, 0.2)];
// The drop's shaker: mostly breath, voiced accents; still one step apart,
// so one singer breathes in on every sixteenth the other breathes out.
const SHAKER = [voicedOut(0, 0.4), breathIn(0.3), breathOut(0.5), breathIn(0.3), breathOut(0.5), breathIn(0.3), voicedOut(7, 0.25), breathIn(0.3),
    voicedOut(0, 0.4), breathIn(0.3), breathOut(0.5), breathIn(0.3), breathOut(0.5), voicedIn(12, 0.1), breathOut(0.5), breathIn(0.3)];
// The break: breath only, a soft tick.
const BREATH_TICK = [breathOut(0.5), breathIn(0.3), breathOut(0.45), breathIn(0.3)];
// Drop II, the first pair in triplet eighths (six steps, two beats).
const TRIPLET = [voicedOut(0, 0.45), breathIn(0.3), voicedIn(7, 0.15), breathOut(0.5), voicedOut(12, 0.1), breathIn(0.3)];
// Drop II, the second pair in sixteenths (fifths only: the soprano sings an octave up).
const SECOND = [breathOut(0.6), breathIn(0.35), voicedOut(0, 0.3), breathIn(0.35), breathOut(0.6), voicedIn(7, 0.1), breathOut(0.6), breathIn(0.35)];
// The ending: the game reduced to breath.
const BREATH_ONLY = [breathOut(0.4), breathIn(0.2), breathOut(0.5), breathIn(0.2)];
// One in-breath.
const GASP = [breathIn(0.2)];

// ------------------------------------------------------------------ the game's clock

// Both players of a breath game read one shared clock: steps counted from
// its first knot, at a rate that is constant between knots ([time, steps
// per second]). A singer's own motif clock starts at its note-on (singer.js
// updatePerformance: position = time since note-on x rate + offset), so
// every change of rate also sets the offset that keeps the position
// continuous. A player lagging by `lag` steps is that many steps behind.
function clockSteps(knots, t) {
    let steps = 0.0;
    for (let k = 0; k < knots.length; k = k + 1) {
        const a = knots[k][0];
        const b = k + 1 < knots.length ? knots[k + 1][0] : 1e9;
        if (t <= a) {
            break;
        }
        steps = steps + (Math.min(t, b) - a) * knots[k][1];
    }
    return steps;
}

function clockRate(knots, t) {
    let r = knots[0][1];
    for (let k = 0; k < knots.length; k = k + 1) {
        if (knots[k][0] <= t + 1e-9) {
            r = knots[k][1];
        }
    }
    return r;
}

function clockTime(knots, steps) {
    let acc = 0.0;
    for (let k = 0; k < knots.length; k = k + 1) {
        const a = knots[k][0];
        const b = k + 1 < knots.length ? knots[k + 1][0] : 1e9;
        const span = (b - a) * knots[k][1];
        if (steps <= acc + span) {
            return a + (steps - acc) / knots[k][1];
        }
        acc = acc + span;
    }
    return knots[knots.length - 1][0];
}

// An accelerating clock: rate rises from r0 to r1 over `seconds`,
// quadratically (slow at first, then pressing), in knots every `every` s.
function accelerando(t0, seconds, r0, r1, every) {
    const knots = [];
    const n = Math.round(seconds / every);
    for (let k = 0; k < n; k = k + 1) {
        const u = (k + 0.5) / n;
        knots.push([t0 + k * every, r0 + (r1 - r0) * u * u]);
    }
    knots.push([t0 + seconds, r1]);
    return knots;
}

// A breath game. game.knots: the clock; game.motifs: [[step, motif]] with
// each change at a multiple of the new motif's length, so every player
// starts the new motif on its first step; game.players: from makePlayer.
// Pattern changes reach each player when its own position arrives there, a
// few ms into the silent gap at the step's start.
function playGame(s, game) {
    const knots = game.knots;
    for (let i = 0; i < game.players.length; i = i + 1) {
        const p = game.players[i];
        const tOn = clockTime(knots, p.lag);
        setSinger(s, tOn - 0.01, p.part, p.index, "pattern", game.motifs[0][1]);
        setSinger(s, tOn - 0.01, p.part, p.index, "patternRate", clockRate(knots, tOn));
        setSinger(s, tOn - 0.01, p.part, p.index, "patternOffset", 0.0);
        voice(s, tOn, p.part, p.index, p.note, 0.004);
        for (let k = 0; k < knots.length; k = k + 1) {
            const tk = knots[k][0];
            if (tk <= tOn + 1e-6 || tk >= p.stop) {
                continue;
            }
            const rate = knots[k][1];
            const offset = clockSteps(knots, tk) - p.lag - (tk - tOn) * rate;
            setSinger(s, tk, p.part, p.index, "patternRate", rate);
            setSinger(s, tk, p.part, p.index, "patternOffset", offset);
        }
        for (let m = 1; m < game.motifs.length; m = m + 1) {
            const tc = clockTime(knots, game.motifs[m][0] + p.lag) + 0.003;
            if (tc < p.stop) {
                setSinger(s, tc, p.part, p.index, "pattern", game.motifs[m][1]);
            }
        }
        off(s, p.stop, p.part, p.index);
    }
}

// Retune both players of a game to a chord's base note (their motif clock
// runs on: a new note while sounding does not restart it). `transpose`
// per player, e.g. +12 for the soprano.
function retunePlayers(s, t, players, note) {
    for (let i = 0; i < players.length; i = i + 1) {
        const p = players[i];
        if (t > p.tOn + 0.01 && t < p.stop) {
            voice(s, t, p.part, p.index, note + p.transpose, 0.003);
        }
    }
}

// One player of a game: which singer, how many steps behind the clock,
// its base note (plus a fixed transposition) and when it stops.
function makePlayer(knots, part, index, lag, note, transpose, stop) {
    return { part: part, index: index, lag: lag, note: note + transpose, transpose: transpose, stop: stop, tOn: clockTime(knots, lag) };
}

// ------------------------------------------------------------------ the tenore writers

function chordNote(chordName, index) {
    return CHORDS[chordName][VOICE_KEYS[index]];
}

function tenoreChord(s, t, chordName, voices, glide) {
    for (let i = 0; i < voices.length; i = i + 1) {
        voice(s, t, "bass", voices[i], chordNote(chordName, voices[i]), glide);
    }
}

// One syllable for one tenore voice. The consonants are oral stops only:
// "p" closes the lips (b), "d" the tongue tip, the velum stays shut. A
// nasal (m, n, a hum) is avoided in this song: the hum decays
// exponentially and never quite reaches zero, so after the first one the
// tube's nasal branch stays in use for good, and later quick vowel moves
// (which change the tube's length and segmentation) click in it (measured:
// single-sample jumps up to 1.8 at a block peak of 0.05).
// The bassu stops nothing at all: a stop raises the pressure above the
// folds and robs them of drive, and his false folds would lose their lock.
// He sings the syllable as a quick rounding to "oo" (a "w") and then the
// vowel, darker than the others (he sings further back).
function syllable(s, t, index, cons, vow) {
    if (index === 0) {
        const v = 0.75 * vow;
        if (cons !== "") {
            s.at(t, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.02 });
            s.at(t + 0.06, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: v });
        } else {
            s.at(t, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: v });
        }
        return;
    }
    if (cons === "p") {
        s.at(t, "state", "voiceSet", { part: "bass", index: index, name: "stopLip", value: 1.0 });
        s.at(t + 0.045, "state", "voiceSet", { part: "bass", index: index, name: "stopLip", value: 0.0 });
    } else if (cons === "d") {
        s.at(t, "state", "voiceSet", { part: "bass", index: index, name: "stopTip", value: 1.0 });
        s.at(t + 0.04, "state", "voiceSet", { part: "bass", index: index, name: "stopTip", value: 0.0 });
    }
    s.at(t + 0.02, "state", "voiceSet", { part: "bass", index: index, name: "vowel", value: vow });
}

function figure(s, t0, beatSec, fig, voices) {
    for (let k = 0; k < fig.length; k = k + 1) {
        for (let i = 0; i < voices.length; i = i + 1) {
            syllable(s, t0 + fig[k][0] * beatSec, voices[i], fig[k][1], fig[k][2]);
        }
    }
}

// A run of chords with their figures: entries [beat, chord, figure].
function tenoreRun(s, t0, beatSec, entries) {
    for (let i = 0; i < entries.length; i = i + 1) {
        const e = entries[i];
        const t = t0 + e[0] * beatSec;
        tenoreChord(s, t, e[1], TRIO, 0.03);
        figure(s, t, beatSec, e[2], TRIO);
    }
}

function tenoreOff(s, t, voices) {
    for (let i = 0; i < voices.length; i = i + 1) {
        off(s, t, "bass", voices[i]);
    }
}

function tenoreEnv(s, t, voices, attack, release) {
    for (let i = 0; i < voices.length; i = i + 1) {
        s.at(t, "state", "env", { part: "bass", index: voices[i], attack: attack, release: release });
    }
}

// The boghe (upper 0): a line of [pitch, beats, vowel, ornament] from t0,
// legato with a short portamento; pitch 0 is a breath. A "turn" sings the
// upper neighbour first and falls onto the note.
function bogheLine(s, t0, beatSec, line) {
    let t = t0;
    for (let i = 0; i < line.length; i = i + 1) {
        const n = line[i];
        const dur = n[1] * beatSec;
        if (n[0] <= 0) {
            off(s, t, "upper", 0);
            t = t + dur;
            continue;
        }
        const vow = n.length > 2 && n[2] !== undefined ? n[2] : (i % 2 === 0 ? 0.5 : 0.3);
        s.at(t, "state", "voiceSet", { part: "upper", index: 0, name: "vowel", value: vow });
        if (n.length > 3 && n[3] === "turn") {
            voice(s, t, "upper", 0, upperNeighbour(n[0]), 0.02);
            voice(s, t + Math.min(0.09, 0.3 * dur), "upper", 0, n[0], 0.025);
        } else {
            voice(s, t, "upper", 0, n[0], 0.035);
        }
        const next = i + 1 < line.length ? line[i + 1] : null;
        if (next === null || next[0] <= 0) {
            off(s, t + dur - 0.05, "upper", 0);
        }
        t = t + dur;
    }
    return t;
}

// ------------------------------------------------------------------ drums and the drop's bass

// The kit sits lower than in the other songs: here the drop's rhythm is
// carried as much by the women's breathing as by the drums.
const KIT = 0.5;

function kit(s, bar, density) {
    const b0 = bar * 4;
    if (density < 0) {
        // the break: a pulse only
        s.at(at(b0), "trigger", "kick", { amp: KIT * 0.55 });
        for (let e = 1; e < 8; e = e + 2) {
            s.at(at(b0 + e * 0.5), "trigger", "hat", { amp: KIT * 0.3, open: false });
        }
        return;
    }
    s.at(at(b0), "trigger", "kick", { amp: KIT * (density === 0 ? 0.55 : 1.0) });
    if (density >= 1) {
        // half time: the snare on the third beat, the chorale's pulse
        s.at(at(b0 + 2), "trigger", "snare", { amp: KIT * 0.9 });
        s.at(at(b0 + 2), "trigger", "kick", { amp: KIT * 0.5 });
        for (let e = 0; e < 8; e = e + 1) {
            s.at(at(b0 + e * 0.5), "trigger", "hat", { amp: KIT * (e % 2 === 1 ? 0.75 : 0.4), open: e === 7 && bar % 2 === 1 });
        }
    }
    if (density >= 2) {
        if (bar % 2 === 1) {
            s.at(at(b0 + 2.75), "trigger", "kick", { amp: KIT * 0.65 });
        }
        if (bar % 4 === 1) {
            s.at(at(b0 + 3.75), "trigger", "snare", { amp: KIT * 0.3 });
        }
        if (bar % 8 === 7) {
            for (let k = 0; k < 4; k = k + 1) {
                s.at(at(b0 + 3 + 0.25 * k), "trigger", "snare", { amp: KIT * (0.4 + 0.12 * k) });
            }
        }
    }
}

// An accelerating snare roll from `fromBar` over `bars`, stopping at beat
// `stopBeat` of the last bar: quarters, eighths, sixteenths, thirty-seconds.
function snareRoll(s, fromBar, bars, stopBeat) {
    for (let b = 0; b < bars; b = b + 1) {
        const u = b / bars;
        let division = 1.0;
        if (u >= 0.25) {
            division = 0.5;
        }
        if (u >= 0.5) {
            division = 0.25;
        }
        if (u >= 0.75) {
            division = 0.125;
        }
        const beats = b === bars - 1 ? stopBeat : 4.0;
        for (let x = 0.0; x < beats - 1e-6; x = x + division) {
            s.at(at((fromBar + b) * 4 + x), "trigger", "snare", { amp: KIT * (0.2 + 0.6 * (b * 4 + x) / (bars * 4)) });
        }
    }
}

// One bar of the drop's bass: the bassu sings it legato, each onset a quick
// rounding to "oo" and back (a "wo"), so the air never stops and the false
// folds stay locked; the Sub
// sounds every note an octave down, which is exactly the pitch the false
// folds create, and the kick is tuned to it. Every second bar the line
// breathes for half a beat (a gap the breath motif fills).
// rhythm: [[beat, which]] with which 0 root, 1 the alternate note.
function dropBassBar(s, bar, rhythm, gap, subLevel) {
    const ch = CHORDS[chordOfBar(bar)];
    const b0 = bar * 4;
    s.at(at(b0), "state", "kickTune", { hz: hzOf(ch.bassu - 12) });
    s.at(at(b0), "trigger", "dunk", { amp: 0.25 });
    for (let k = 0; k < rhythm.length; k = k + 1) {
        const t = at(b0 + rhythm[k][0]);
        const note = rhythm[k][1] === 0 ? ch.bassu : ch.alt;
        voice(s, t, "bass", 0, note, 0.006);
        s.at(t, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.02 });
        s.at(t + 0.06, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: k % 2 === 0 ? 0.3 : 0.45 });
        s.at(t, "state", "sub", { note: note, level: subLevel });
    }
    if (gap) {
        off(s, at(b0 + 3.5) - 0.012, "bass", 0);
        s.at(at(b0 + 3.5) - 0.012, "state", "sub", { note: ch.bassu, level: 0.0 });
    }
}

// The contra and mesu answer in short chord stabs ("bam", "bi").
function stabs(s, bar, beats) {
    const chordName = chordOfBar(bar);
    for (let k = 0; k < beats.length; k = k + 1) {
        const t = at(bar * 4 + beats[k]);
        for (let i = 1; i < 3; i = i + 1) {
            voice(s, t, "bass", i, chordNote(chordName, i), 0.004);
            syllable(s, t, i, "p", k % 2 === 0 ? 0.5 : 0.85);
            off(s, t + 0.33 * BEAT, "bass", i);
        }
    }
}

// The tenore at tempo: a chord per bar (re-sung only when it changes) and
// the ostinato's syllables.
function tenoreBars(s, fromBar, bars, fig) {
    let last = "";
    for (let b = fromBar; b < fromBar + bars; b = b + 1) {
        const chordName = chordOfBar(b);
        if (chordName !== last) {
            tenoreChord(s, at(b * 4), chordName, TRIO, 0.02);
            last = chordName;
        }
        figure(s, at(b * 4), BEAT, fig, TRIO);
    }
}

// Base notes of a game's players follow the chords bar by bar.
function retuneByBars(s, players, fromBar, toBar) {
    let last = "";
    for (let b = fromBar; b < toBar; b = b + 1) {
        const chordName = chordOfBar(b);
        if (chordName !== last) {
            retunePlayers(s, at(b * 4), players, CHORDS[chordName].women);
            last = chordName;
        }
    }
}

// ------------------------------------------------------------------ the score

export function buildScore() {
    const s = new Score();
    for (let i = 0; i < SECTIONS.length; i = i + 1) {
        section(s, SECTIONS[i].start, i);
    }

    // ---- 1. the boghe alone (free time)
    bogheLine(s, T_SOLO, 1.0, SOLO);

    // ---- 2. the tenore: call and answer, then the boghe over moving chords
    bogheLine(s, T_TENORE, SLOW, CALL1);
    tenoreRun(s, T_TENORE, SLOW, TENORE_CYCLE1);
    tenoreOff(s, T_TENORE + 16.2 * SLOW, TRIO);
    bogheLine(s, T_TENORE + 16.5 * SLOW, SLOW, CALL2);
    tenoreRun(s, T_TENORE, SLOW, TENORE_CYCLE2);
    tenoreOff(s, T_TENORE + 29.6 * SLOW, TRIO);
    bogheLine(s, T_TENORE + 30.0 * SLOW, SLOW, LINE3);
    tenoreRun(s, T_TENORE, SLOW, TENORE_CYCLE3);
    tenoreOff(s, T_TENORE + 42.6 * SLOW, TRIO);

    // ---- 3. the breath game: two women, one step apart, accelerating from
    // 3.4 to 7.73 steps a second (the coming tempo's sixteenths)
    const gameStart = T_GAME + 0.8;
    const gameSeconds = GRID - 2.0 - gameStart;
    const gameKnots = accelerando(gameStart, gameSeconds, 3.4, RATE16, 0.5);
    const totalSteps = clockSteps(gameKnots, gameStart + gameSeconds);
    const lastStep = 8.0 * Math.floor(totalSteps / 8.0);
    // the mezzo (one step behind) breaks off first; the alto sings two
    // steps alone before she stops too
    const freePlayers = [
        makePlayer(gameKnots, "upper", 1, 0, 65, 0, clockTime(gameKnots, lastStep - 2.0)),
        makePlayer(gameKnots, "upper", 2, 1, 65, 0, clockTime(gameKnots, lastStep - 4.0))
    ];
    playGame(s, { knots: gameKnots, motifs: [[0, SAW], [48, HUSH], [120, KNOCK]], players: freePlayers });
    // the men begin to sing under the game's last phrase, on a closed "oo"
    // (not a hum: see syllable()): the bassu's sub-octave first, then the
    // contra's fifth, the vowels opening as the tempo nears
    s.at(T_GAME + 24.0, "state", "env", { part: "bass", index: 0, attack: 1.5, release: 0.25 });
    s.at(T_GAME + 24.0, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.0 });
    voice(s, T_GAME + 24.0, "bass", 0, CHORDS.I.bassu, 0.05);
    s.at(T_GAME + 29.0, "state", "env", { part: "bass", index: 1, attack: 1.5, release: 0.25 });
    s.at(T_GAME + 29.0, "state", "voiceSet", { part: "bass", index: 1, name: "vowel", value: 0.0 });
    voice(s, T_GAME + 29.0, "bass", 1, CHORDS.I.contra, 0.05);
    s.at(T_GAME + 35.5, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.15 });
    s.at(T_GAME + 37.5, "state", "voiceSet", { part: "bass", index: 1, name: "vowel", value: 0.2 });
    tenoreEnv(s, GRID - 0.5, [0, 1], 0.08, 0.25);

    // ---- 4. the game over the tenore, 116 BPM (bars 0-23), and the build
    // (24-31): one clock, doubling to thirty-seconds at bar 30
    const tempoKnots = [[GRID, RATE16], [barT(30), 2.0 * RATE16]];
    const cut = at(31 * 4 + 2);
    const tempoPlayers = [
        makePlayer(tempoKnots, "upper", 1, 0, CHORDS.I.women, 0, cut),
        makePlayer(tempoKnots, "upper", 2, 1, CHORDS.I.women, 0, cut)
    ];
    playGame(s, { knots: tempoKnots, motifs: [[0, TICK], [128, SING], [384, ROLL], [448, ROLL_VOICED]], players: tempoPlayers });
    retuneByBars(s, tempoPlayers, 0, 31);
    tenoreBars(s, 0, 28, OSTINATO);
    // bars 28-31: the dominant held, the vowel opening bar by bar
    tenoreChord(s, barT(28), "V", TRIO, 0.02);
    for (let b = 0; b < 4; b = b + 1) {
        for (let i = 0; i < 3; i = i + 1) {
            syllable(s, barT(28 + b), i, b === 0 ? "p" : "", 0.25 + 0.17 * b);
        }
    }
    tenoreOff(s, cut, TRIO);
    // the boghe: the tune twice from bar 8, then climbing through the build
    bogheLine(s, barT(8), BEAT, TUNE);
    bogheLine(s, barT(16), BEAT, TUNE);
    bogheLine(s, barT(24), BEAT, BUILD_LINE);
    off(s, cut, "upper", 0);
    // a soft pulse joins the game, the build's roll and riser
    for (let b = 16; b < 24; b = b + 1) {
        kit(s, b, b < 20 ? 0 : -1);
    }
    for (let b = 24; b < 28; b = b + 1) {
        kit(s, b, 0);
    }
    for (let b = 28; b < 31; b = b + 1) {
        for (let q = 0; q < 4; q = q + 1) {
            s.at(at(b * 4 + q), "trigger", "kick", { amp: 0.45 + 0.15 * (b - 28) + 0.03 * q });
        }
    }
    snareRoll(s, 24, 8, 2.0);
    s.at(barT(28), "trigger", "riser", { seconds: 3.5 * BAR, amp: 0.85 });
    // the stop: the second pair, silent until now, takes one in-breath
    const gaspT = at(31 * 4 + 3);
    const gaspKnots = [[gaspT, 2.5]];
    playGame(s, {
        knots: gaspKnots, motifs: [[0, GASP]], players: [
            makePlayer(gaspKnots, "solo", 0, 0, 72, 0, gaspT + 0.38),
            makePlayer(gaspKnots, "solo", 1, 0, 65, 0, gaspT + 0.38)
        ]
    });

    // ---- 5-7. drop, break, drop II (bars 32-71): one clock for the first
    // pair, sixteenths, then triplet eighths from bar 56
    const dropKnots = [[barT(32), RATE16], [barT(56), RATE_TRIPLET]];
    const dropEnd = barT(72);
    const dropPlayers = [
        makePlayer(dropKnots, "upper", 1, 0, CHORDS.I.women, 0, dropEnd),
        makePlayer(dropKnots, "upper", 2, 1, CHORDS.I.women, 0, dropEnd)
    ];
    playGame(s, { knots: dropKnots, motifs: [[0, SHAKER], [256, BREATH_TICK], [352, SHAKER], [384, TRIPLET]], players: dropPlayers });
    retuneByBars(s, dropPlayers, 32, 72);
    // the second pair: sixteenths in Drop II, the soprano an octave up
    const secondKnots = [[barT(56), RATE16]];
    const secondPlayers = [
        makePlayer(secondKnots, "solo", 0, 0, CHORDS.I.women, 12, dropEnd - 0.01),
        makePlayer(secondKnots, "solo", 1, 1, CHORDS.I.women, 0, dropEnd - 0.01)
    ];
    playGame(s, { knots: secondKnots, motifs: [[0, SECOND]], players: secondPlayers });
    retuneByBars(s, secondPlayers, 56, 72);

    // drop I
    s.at(barT(32), "trigger", "impact", { amp: 1.0 });
    s.at(barT(32), "trigger", "rolmo", { amp: 0.7, bright: 0.95 });
    s.at(barT(32), "state", "env", { part: "bass", index: 0, attack: 0.02, release: 0.08 });
    tenoreEnv(s, barT(32), [1, 2], 0.012, 0.06);
    for (let b = 32; b < 48; b = b + 1) {
        kit(s, b, 2);
        dropBassBar(s, b, [[0, 0], [1.5, 0], [3, 1]], b % 2 === 1, 0.45);
        stabs(s, b, [1.0, 2.5]);
    }
    bogheLine(s, barT(36), BEAT, HOOK);
    bogheLine(s, barT(44), BEAT, HOOK);

    // break: chorale over a held sub
    tenoreEnv(s, barT(48), TRIO, 0.08, 0.25);
    for (let b = 48; b < 56; b = b + 1) {
        const ch = CHORDS[chordOfBar(b)];
        kit(s, b, -1);
        s.at(barT(b), "state", "sub", { note: ch.bassu, level: 0.4 });
        s.at(barT(b), "state", "kickTune", { hz: hzOf(ch.bassu - 12) });
    }
    tenoreBars(s, 48, 8, SLOW_FIG);
    tenoreOff(s, at(56 * 4) - 0.06, TRIO);
    bogheLine(s, barT(52), BEAT, BREAK_LINE);
    snareRoll(s, 54, 2, 4.0);
    s.at(barT(54), "trigger", "riser", { seconds: 2.0 * BAR, amp: 0.7 });

    // drop II
    s.at(barT(56), "trigger", "impact", { amp: 1.0 });
    s.at(barT(56), "trigger", "rolmo", { amp: 0.75, bright: 1.0 });
    s.at(barT(56), "state", "env", { part: "bass", index: 0, attack: 0.02, release: 0.08 });
    tenoreEnv(s, barT(56), [1, 2], 0.012, 0.06);
    for (let b = 56; b < 72; b = b + 1) {
        kit(s, b, 2);
        dropBassBar(s, b, [[0, 0], [0.75, 0], [1.5, 1], [2.5, 0], [3, 1]], b % 2 === 1, 0.5);
        stabs(s, b, [1.0, 2.0]);
    }
    bogheLine(s, barT(56), BEAT, TUNE);
    bogheLine(s, barT(64), BEAT, TUNE.slice(0, 11));
    bogheLine(s, barT(68), BEAT, TUNE_END);

    // ---- 8. the closing chorale, free time, and the dissolve
    s.at(T_CHORALE, "state", "sub", { note: 41, level: 0.0 });
    tenoreEnv(s, T_CHORALE, TRIO, 0.1, 0.3);
    tenoreRun(s, T_CHORALE, CHORALE_BEAT, TENORE_LAST);
    bogheLine(s, T_CHORALE, CHORALE_BEAT, LAST_LINE);
    off(s, T_CHORALE + 14.0 * CHORALE_BEAT, "upper", 0);
    // the voices leave one by one: mesu, contra, then the bassu alone,
    // closing to "oo", his sub-octave the last thing sung
    off(s, T_CHORALE + 15.0 * CHORALE_BEAT, "bass", 2);
    off(s, T_CHORALE + 18.0 * CHORALE_BEAT, "bass", 1);
    s.at(T_CHORALE + 19.0 * CHORALE_BEAT, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.05 });
    s.at(T_CHORALE + 21.0 * CHORALE_BEAT, "state", "voiceSet", { part: "bass", index: 0, name: "vowel", value: 0.0 });
    s.at(T_CHORALE + 21.0 * CHORALE_BEAT, "state", "env", { part: "bass", index: 0, attack: 0.1, release: 1.2 });
    off(s, T_CHORALE + 24.0 * CHORALE_BEAT, "bass", 0);
    // the women: the game reduced to breath, softly, then one in-breath
    const endKnots = [[T_CHORALE + 2.0, 2.4]];
    const endPlayers = [
        makePlayer(endKnots, "upper", 1, 0, 65, 0, T_CHORALE + 20.0),
        makePlayer(endKnots, "upper", 2, 1, 65, 0, T_CHORALE + 20.0)
    ];
    setSinger(s, T_CHORALE + 1.0, "upper", 1, "own.effort", 0.3);
    setSinger(s, T_CHORALE + 1.0, "upper", 2, "own.effort", 0.3);
    playGame(s, { knots: endKnots, motifs: [[0, BREATH_ONLY]], players: endPlayers });
    const lastBreath = T_CHORALE + 30.5;
    const lastKnots = [[lastBreath, 1.4]];
    playGame(s, {
        knots: lastKnots, motifs: [[0, GASP]], players: [
            makePlayer(lastKnots, "upper", 1, 0, 65, 0, lastBreath + 0.68),
            makePlayer(lastKnots, "upper", 2, 0, 65, 0, lastBreath + 0.68)
        ]
    });

    s.at(LENGTH, "state", "end", {});
    s.events.sort(compareTime);
    return s.events;
}

// ------------------------------------------------------------------ singers

export function partConfigs() {
    // The tenore (bass part, seated in the room). The bassu runs the
    // self-oscillating larynx: his false folds, drawn in by the ventricular
    // register, find the every-second-cycle contact by themselves.
    const bass = [
        Object.assign(makeSingerConfig("bass", "ventricular", 0), { octave: 0, larynxModel: "folds", ventRatio: 2, press: 0.3, larynx: -0.3, vibratoDepth: 0.0, driftCents: 2.0, effort: 0.8, epilarynx: 0.45, level: 1.0, pan: -0.12, attack: 0.08, release: 0.25 }),
        Object.assign(makeSingerConfig("baritone", "ventricular", 0), { octave: 0, larynxModel: "pulse", ventRatio: 1, press: 0.5, vibratoDepth: 0.0, driftCents: 2.0, effort: 0.75, epilarynx: 0.6, level: 0.7, pan: 0.18, attack: 0.08, release: 0.25 }),
        Object.assign(makeSingerConfig("baritone", "chest", 0), { octave: 0, press: 0.2, vibratoDepth: 0.04, driftCents: 2.0, effort: 0.7, level: 0.75, pan: 0.38, attack: 0.08, release: 0.25, lengthScale: 0.98 })
    ];
    // The boghe and the two women of the breath game.
    const upper = [
        Object.assign(makeSingerConfig("tenor", "chest", 0), { octave: 0, press: 0.3, vibratoDepth: 0.16, vibratoRate: 5.6, driftCents: 3.0, effort: 0.85, epilarynx: 0.5, level: 0.85, pan: 0.0, attack: 0.06, release: 0.2 }),
        Object.assign(makeSingerConfig("alto", "head", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 2.0, effort: 0.8, level: 1.7, pan: -0.45, attack: 0.02, release: 0.08 }),
        Object.assign(makeSingerConfig("mezzo", "head", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 2.0, effort: 0.8, level: 1.7, pan: 0.45, attack: 0.02, release: 0.08 })
    ];
    // The second pair (Drop II, and the gasp before the first drop).
    const solo = [
        Object.assign(makeSingerConfig("soprano", "head", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 2.0, effort: 0.8, level: 1.3, pan: -0.75, attack: 0.02, release: 0.08 }),
        Object.assign(makeSingerConfig("mezzo", "head", 0), { octave: 0, vibratoDepth: 0.0, driftCents: 2.0, effort: 0.8, level: 1.3, pan: 0.75, attack: 0.02, release: 0.08, lengthScale: 0.97 })
    ];
    // Unused: one silent singer (the parts are fixed).
    const monks = [
        Object.assign(makeSingerConfig("bass", "chest", 0), { octave: 0, level: 0.0 })
    ];
    return { monks: monks, upper: upper, solo: solo, bass: bass };
}

function setupTenore(engine) {
    // no half tone for the whole bass part: only the two singers whose
    // register draws the false folds in (bassu, contra) have them
    engine.parts.bass.setGlobal("halftone", 0.0);
    engine.parts.bass.setGlobal("vowelGlide", 0.03);
    engine.parts.bass.setGlobal("glide", 0.03);
    engine.parts.upper.setGlobal("vowelGlide", 0.03);
    engine.parts.upper.setGlobal("glide", 0.03);
    engine.parts.solo.setGlobal("vowelGlide", 0.03);
    engine.hall.mix = 0.34;
    engine.hall.setTime(2.8, 0.55);
}

export const TENORE = {
    id: "tenore",
    title: "Tenore and the Breath Game",
    sections: SECTIONS,
    length: LENGTH,
    grid: GRID,
    bar: BAR,
    buildScore: buildScore,
    partConfigs: partConfigs,
    setup: setupTenore,
    warmSpots: [6.0, T_TENORE + 8.0, T_GAME + 30.0, barT(10), barT(29), barT(34), barT(50), barT(60), T_CHORALE + 8.0],
    rollLabels: {
        upper0: "Boghe (lead)",
        upper1: "Breath game: alto",
        upper2: "Breath game: mezzo",
        bass0: "Bassu (heard an octave down)",
        bass1: "Contra",
        bass2: "Mesu boghe",
        drone: "Second pair",
        monks: "(unused)"
    },
    bassInRoom: true
};

