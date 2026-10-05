// Composition toolkit: keys and diatonic transposition, a chorale
// harmonizer (dynamic programming over chord choices, then voice leading),
// the overtone mapper (melody pitch -> drone + harmonic), and an audit of
// vertical consonance and parallel motion.
//
// A line is an array of notes { beat, dur, pitch } (beats from the start of
// its section, MIDI pitch; pitch < 0 is a rest).

export function makeKey(tonicPc, mode) {
    let steps = [0, 2, 3, 5, 7, 8, 10]; // natural minor
    if (mode === "major") {
        steps = [0, 2, 4, 5, 7, 9, 11];
    }
    return { tonic: tonicPc, mode: mode, steps: steps };
}

function mod(a, n) {
    return ((a % n) + n) % n;
}

// Degree (0..6) and chromatic alteration of a pitch in a key.
export function degreeOf(pitch, key) {
    const pc = mod(pitch - key.tonic, 12);
    for (let d = 0; d < 7; d = d + 1) {
        if (key.steps[d] === pc) {
            return { degree: d, alter: 0 };
        }
    }
    for (let d = 0; d < 7; d = d + 1) {
        if (key.steps[d] + 1 === pc) {
            return { degree: d, alter: 1 };
        }
    }
    return { degree: 0, alter: 0 };
}

export function pitchOf(degree, octaveBase, key) {
    const oct = Math.floor(degree / 7);
    const d = mod(degree, 7);
    return octaveBase + key.tonic + 12 * oct + key.steps[d];
}

// Move a pitch by `steps` scale degrees. A raised seventh (leading tone)
// stays raised only if it lands on the seventh degree again.
export function diatonicShift(pitch, steps, key) {
    const info = degreeOf(pitch, key);
    const rel = pitch - key.tonic - info.alter;
    const octave = Math.floor((rel - key.steps[info.degree]) / 12);
    const target = info.degree + steps;
    let p = key.tonic + 12 * octave + 12 * Math.floor(target / 7) + key.steps[mod(target, 7)];
    if (info.alter === 1 && mod(target, 7) === 6 && key.mode === "minor") {
        p = p + 1;
    }
    return p;
}

export function shiftLine(line, steps, key) {
    const out = [];
    for (let i = 0; i < line.length; i = i + 1) {
        const n = line[i];
        out.push({ beat: n.beat, dur: n.dur, pitch: n.pitch < 0 ? n.pitch : diatonicShift(n.pitch, steps, key) });
    }
    return out;
}

export function transposeLine(line, semis) {
    const out = [];
    for (let i = 0; i < line.length; i = i + 1) {
        out.push({ beat: line[i].beat, dur: line[i].dur, pitch: line[i].pitch < 0 ? line[i].pitch : line[i].pitch + semis });
    }
    return out;
}

// Mirror a line around an axis pitch (inversion), diatonically.
export function invertLine(line, axisPitch, key) {
    const axis = degreeOf(axisPitch, key).degree + 7 * Math.floor((axisPitch - key.tonic) / 12);
    const out = [];
    for (let i = 0; i < line.length; i = i + 1) {
        const n = line[i];
        if (n.pitch < 0) {
            out.push({ beat: n.beat, dur: n.dur, pitch: n.pitch });
            continue;
        }
        const d = degreeOf(n.pitch, key).degree + 7 * Math.floor((n.pitch - key.tonic - degreeOf(n.pitch, key).alter) / 12);
        const mirrored = 2 * axis - d;
        out.push({ beat: n.beat, dur: n.dur, pitch: pitchOf(mirrored, 0, key) });
    }
    return out;
}

export function scaleRhythm(line, factor) {
    const out = [];
    for (let i = 0; i < line.length; i = i + 1) {
        out.push({ beat: line[i].beat * factor, dur: line[i].dur * factor, pitch: line[i].pitch });
    }
    return out;
}

export function shiftTime(line, beats) {
    const out = [];
    for (let i = 0; i < line.length; i = i + 1) {
        out.push({ beat: line[i].beat + beats, dur: line[i].dur, pitch: line[i].pitch });
    }
    return out;
}

// Build a line from [pitch, dur] pairs.
export function lineFrom(pairs, start) {
    const out = [];
    let b = start || 0;
    for (let i = 0; i < pairs.length; i = i + 1) {
        out.push({ beat: b, dur: pairs[i][1], pitch: pairs[i][0] });
        b = b + pairs[i][1];
    }
    return out;
}

export function lineLength(line) {
    if (line.length === 0) {
        return 0;
    }
    const last = line[line.length - 1];
    return last.beat + last.dur;
}

// Fit a line into [lo, hi] by whole octaves (shift the whole line).
export function fitRange(line, lo, hi) {
    let min = 999;
    let max = -999;
    for (let i = 0; i < line.length; i = i + 1) {
        if (line[i].pitch >= 0) {
            min = Math.min(min, line[i].pitch);
            max = Math.max(max, line[i].pitch);
        }
    }
    let shift = 0;
    while (min + shift < lo) {
        shift = shift + 12;
    }
    while (max + shift > hi && min + shift - 12 >= lo) {
        shift = shift - 12;
    }
    return transposeLine(line, shift);
}

// ------------------------------------------------------------------ chords

// Triads by scale degree, with the minor-key dominant raised.
export function chordTones(degree, key) {
    const root = pitchOf(degree, 0, key);
    const third = pitchOf(degree + 2, 0, key);
    let fifth = pitchOf(degree + 4, 0, key);
    let t = third;
    if (key.mode === "minor" && degree === 4) {
        t = third + 1; // V is major in minor
    }
    if (key.mode === "minor" && degree === 6 && false) {
        fifth = fifth + 0;
    }
    return [mod(root, 12), mod(t, 12), mod(fifth, 12)];
}

const FUNCTION_OF = [0, 1, 0, 1, 2, 0, 2]; // T, PD, T, PD, D, T(PD), D by degree

function transitionCost(a, b) {
    if (a === b) {
        return 2.5;
    }
    const fa = FUNCTION_OF[a];
    const fb = FUNCTION_OF[b];
    let cost = 1.0;
    if (fa === 0 && fb === 1) { cost = 0.2; }
    if (fa === 1 && fb === 2) { cost = 0.1; }
    if (fa === 2 && fb === 0) { cost = 0.15; }
    if (fa === 2 && fb === 1) { cost = 2.0; } // retrogression
    if (fa === 1 && fb === 0) { cost = 1.2; }
    if (mod(b - a, 7) === 3) { cost = cost - 0.3; } // root down a fifth
    if (a === 4 && b === 5) { cost = 0.4; } // deceptive cadence
    return cost;
}

// Choose one chord (scale degree) per melody note by dynamic programming.
// `endDegrees` restricts the final chord(s), `penultimate` the one before.
export function harmonize(melody, key, endDegree, penultimate) {
    const n = melody.length;
    const cand = [];
    for (let i = 0; i < n; i = i + 1) {
        const pc = mod(melody[i].pitch, 12);
        const list = [];
        for (let d = 0; d < 7; d = d + 1) {
            if (d === 1 && key.mode === "minor") {
                continue; // skip the diminished ii in this simple harmonizer
            }
            if (d === 6 && key.mode === "major") {
                continue;
            }
            const tones = chordTones(d, key);
            if (tones.indexOf(pc) >= 0) {
                list.push(d);
            }
        }
        if (i === n - 1 && endDegree !== undefined) {
            list.length = 0;
            list.push(endDegree);
        }
        if (i === n - 2 && penultimate !== undefined && chordTones(penultimate, key).indexOf(pc) >= 0) {
            list.length = 0;
            list.push(penultimate);
        }
        if (list.length === 0) {
            list.push(0);
        }
        cand.push(list);
    }
    const cost = [];
    const back = [];
    for (let i = 0; i < n; i = i + 1) {
        cost.push(new Array(cand[i].length).fill(1e9));
        back.push(new Array(cand[i].length).fill(-1));
    }
    for (let k = 0; k < cand[0].length; k = k + 1) {
        cost[0][k] = cand[0][k] === 0 ? 0 : 0.8;
    }
    for (let i = 1; i < n; i = i + 1) {
        for (let k = 0; k < cand[i].length; k = k + 1) {
            for (let j = 0; j < cand[i - 1].length; j = j + 1) {
                const c = cost[i - 1][j] + transitionCost(cand[i - 1][j], cand[i][k]);
                if (c < cost[i][k]) {
                    cost[i][k] = c;
                    back[i][k] = j;
                }
            }
        }
    }
    let best = 0;
    for (let k = 1; k < cand[n - 1].length; k = k + 1) {
        if (cost[n - 1][k] < cost[n - 1][best]) {
            best = k;
        }
    }
    const out = new Array(n);
    for (let i = n - 1; i >= 0; i = i - 1) {
        out[i] = cand[i][best];
        best = back[i][best];
    }
    return out;
}

function nearestTone(prev, pcs, lo, hi) {
    let best = -1;
    let bestD = 1e9;
    for (let p = lo; p <= hi; p = p + 1) {
        if (pcs.indexOf(mod(p, 12)) < 0) {
            continue;
        }
        const d = Math.abs(p - prev);
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    }
    return best;
}

function parallelPerfect(a0, a1, b0, b1) {
    const i0 = mod(a0 - b0, 12);
    const i1 = mod(a1 - b1, 12);
    if (a0 === a1 && b0 === b1) {
        return false;
    }
    return (i0 === 7 && i1 === 7) || (i0 === 0 && i1 === 0);
}

// Four-part voicing: soprano is the melody; bass takes chord roots (or
// thirds for smoothness); alto and tenor take the nearest chord tones,
// avoiding parallel fifths/octaves and crossing where possible.
export function voiceChorale(melody, degrees, key, ranges) {
    const n = melody.length;
    const bass = [];
    const alto = [];
    const tenor = [];
    let pb = Math.round((ranges.bass[0] + ranges.bass[1]) / 2);
    let pa = Math.round((ranges.alto[0] + ranges.alto[1]) / 2);
    let pt = Math.round((ranges.tenor[0] + ranges.tenor[1]) / 2);
    for (let i = 0; i < n; i = i + 1) {
        const tones = chordTones(degrees[i], key);
        const s = melody[i].pitch;
        // bass: root, or the third if it moves less than half as far
        let b = nearestTone(pb, [tones[0]], ranges.bass[0], ranges.bass[1]);
        const b3 = nearestTone(pb, [tones[1]], ranges.bass[0], ranges.bass[1]);
        if (i > 0 && i < n - 1 && b3 >= 0 && Math.abs(b3 - pb) * 2 < Math.abs(b - pb) && mod(s, 12) !== tones[1]) {
            b = b3;
        }
        // no parallel fifths or octaves between the outer voices: try the
        // root an octave away, then the third
        if (i > 0 && parallelPerfect(melody[i - 1].pitch, s, pb, b)) {
            const alternatives = [b + 12, b - 12, b3];
            for (let k = 0; k < alternatives.length; k = k + 1) {
                const alt = alternatives[k];
                if (alt >= ranges.bass[0] && alt <= ranges.bass[1] && !parallelPerfect(melody[i - 1].pitch, s, pb, alt) && mod(s, 12) !== mod(alt, 12) + 0 - (k === 2 ? 0 : 0)) {
                    b = alt;
                    break;
                }
            }
        }
        // inner voices: try the options, keep the cheapest legal pair
        let bestA = -1;
        let bestT = -1;
        let bestCost = 1e9;
        for (let a = ranges.alto[0]; a <= ranges.alto[1]; a = a + 1) {
            if (tones.indexOf(mod(a, 12)) < 0 || a > s) {
                continue;
            }
            for (let t = ranges.tenor[0]; t <= ranges.tenor[1]; t = t + 1) {
                if (tones.indexOf(mod(t, 12)) < 0 || t > a || t < b) {
                    continue;
                }
                let c = Math.abs(a - pa) + Math.abs(t - pt);
                const present = [mod(s, 12), mod(a, 12), mod(t, 12), mod(b, 12)];
                for (let k = 0; k < 3; k = k + 1) {
                    if (present.indexOf(tones[k]) < 0) {
                        c = c + (k === 1 ? 6 : 3); // missing third is worse than missing fifth
                    }
                }
                if (i > 0) {
                    const prev = [melody[i - 1].pitch, alto[i - 1].pitch, tenor[i - 1].pitch, bass[i - 1].pitch];
                    const cur = [s, a, t, b];
                    for (let x = 0; x < 4; x = x + 1) {
                        for (let y = x + 1; y < 4; y = y + 1) {
                            if (parallelPerfect(prev[x], cur[x], prev[y], cur[y])) {
                                c = c + 20;
                            }
                        }
                    }
                }
                if (c < bestCost) {
                    bestCost = c;
                    bestA = a;
                    bestT = t;
                }
            }
        }
        if (bestA < 0) {
            bestA = nearestTone(pa, tones, ranges.alto[0], ranges.alto[1]);
            bestT = nearestTone(pt, tones, ranges.tenor[0], ranges.tenor[1]);
        }
        bass.push({ beat: melody[i].beat, dur: melody[i].dur, pitch: b });
        alto.push({ beat: melody[i].beat, dur: melody[i].dur, pitch: bestA });
        tenor.push({ beat: melody[i].beat, dur: melody[i].dur, pitch: bestT });
        pb = b;
        pa = bestA;
        pt = bestT;
    }
    return { alto: alto, tenor: tenor, bass: bass };
}

// ------------------------------------------------------------------ overtones

function hz(m) {
    return 440.0 * Math.pow(2.0, (m - 69) / 12);
}

// The overtone singer cannot sing a melody note directly: it sings a drone
// and lifts one of its harmonics. For each melody pitch, choose a drone
// (within the singer's range, preferably a tone of the current harmony and
// close to the previous drone) and a harmonic number whose frequency lands
// within `tolCents` of the pitch and inside the reachable resonance band.
export function mapOvertones(line, opts, chordAt) {
    const out = [];
    let prevDrone = opts.startDrone;
    for (let i = 0; i < line.length; i = i + 1) {
        const note = line[i];
        if (note.pitch < 0) {
            out.push({ beat: note.beat, dur: note.dur, drone: -1, harmonic: 0, pitch: -1, cents: 0 });
            continue;
        }
        let best = null;
        for (let oct = 0; oct <= 2 && best === null; oct = oct + 1) {
            const shifts = oct === 0 ? [0] : [12 * oct, -12 * oct];
            for (let si = 0; si < shifts.length; si = si + 1) {
                const target = note.pitch + shifts[si];
                const f = hz(target);
                if (f < opts.bandLow || f > opts.bandHigh) {
                    continue;
                }
                for (let h = 0; h < opts.harmonics.length; h = h + 1) {
                    const n = opts.harmonics[h];
                    const droneExact = 69 + 12 * Math.log2(f / n / 440.0);
                    const drone = Math.round(droneExact);
                    if (drone < opts.droneLow || drone > opts.droneHigh) {
                        continue;
                    }
                    const cents = 1200 * Math.log2(n * hz(drone) / f);
                    if (Math.abs(cents) > opts.tolCents) {
                        continue;
                    }
                    let cost = Math.abs(drone - prevDrone) * 0.25 + Math.abs(cents) * 0.05 + Math.abs(shifts[si]) * 0.3;
                    if (drone !== prevDrone) {
                        cost = cost + (opts.holdCost === undefined ? 1.5 : opts.holdCost);
                    }
                    const chord = chordAt ? chordAt(note.beat) : null;
                    if (chord !== null && chord.indexOf(mod(drone, 12)) < 0) {
                        cost = cost + 4.0;
                    }
                    if (chord !== null && chord[0] === mod(drone, 12)) {
                        cost = cost - 1.0;
                    }
                    if (best === null || cost < best.cost) {
                        best = { drone: drone, harmonic: n, pitch: target, cents: cents, cost: cost };
                    }
                }
            }
        }
        if (best === null) {
            out.push({ beat: note.beat, dur: note.dur, drone: -1, harmonic: 0, pitch: -1, cents: 0 });
            continue;
        }
        prevDrone = best.drone;
        out.push({ beat: note.beat, dur: note.dur, drone: best.drone, harmonic: best.harmonic, pitch: best.pitch, cents: best.cents });
    }
    return out;
}

// ------------------------------------------------------------------ audit

// Pitch sounding in a line at a beat, or -1.
export function pitchAt(line, beat) {
    for (let i = 0; i < line.length; i = i + 1) {
        const n = line[i];
        if (beat >= n.beat - 1e-6 && beat < n.beat + n.dur - 1e-6) {
            return n.pitch;
        }
    }
    return -1;
}

const DISSONANT = [1, 2, 6, 10, 11];

// Count dissonant pairs on every beat (and separately on strong beats:
// 1 and 3 of each bar) among the given lines.
export function auditConsonance(lines, fromBeat, toBeat) {
    let pairs = 0;
    let bad = 0;
    let strongPairs = 0;
    let strongBad = 0;
    for (let b = fromBeat; b < toBeat; b = b + 1) {
        const ps = [];
        for (let i = 0; i < lines.length; i = i + 1) {
            const p = pitchAt(lines[i], b);
            if (p >= 0) {
                ps.push(p);
            }
        }
        const strong = mod(b, 2) === 0;
        for (let x = 0; x < ps.length; x = x + 1) {
            for (let y = x + 1; y < ps.length; y = y + 1) {
                const iv = mod(Math.abs(ps[x] - ps[y]), 12);
                const dis = DISSONANT.indexOf(iv) >= 0;
                pairs = pairs + 1;
                if (dis) {
                    bad = bad + 1;
                }
                if (strong) {
                    strongPairs = strongPairs + 1;
                    if (dis) {
                        strongBad = strongBad + 1;
                    }
                }
            }
        }
    }
    return { pairs: pairs, dissonant: bad, strongPairs: strongPairs, strongDissonant: strongBad };
}

// Parallel perfect fifths/octaves between consecutive note onsets of two
// lines sampled on the beat.
export function auditParallels(a, b, fromBeat, toBeat) {
    let count = 0;
    for (let t = fromBeat + 1; t < toBeat; t = t + 1) {
        const a0 = pitchAt(a, t - 1);
        const a1 = pitchAt(a, t);
        const b0 = pitchAt(b, t - 1);
        const b1 = pitchAt(b, t);
        if (a0 < 0 || a1 < 0 || b0 < 0 || b1 < 0) {
            continue;
        }
        if (parallelPerfect(a0, a1, b0, b1)) {
            count = count + 1;
        }
    }
    return count;
}
