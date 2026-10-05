// Shared composition helpers for the songs: track building, entry
// placement and filler voices (consonance-audited), the score event
// writers, the throat-bass riff vocabulary and percussion patterns.
// Event writers that need a clock come from makeWriters(at), where at()
// maps a grid beat to seconds for the song being built.

import * as M from "../music.js";

export const TEMPO = 140.0;
export const BEAT = 60.0 / TEMPO;
export const BAR = 4.0 * BEAT;

export function newTracks() {
    return { S: [], A: [], T: [], monks: [], over: [], cont: [], chords: [] };
}

export function append(track, line) {
    for (let i = 0; i < line.length; i = i + 1) {
        track.push(line[i]);
    }
}

export function chordSpan(tracks, beat, dur, key, degree) {
    tracks.chords.push({ beat: beat, dur: dur, key: key, degree: degree, pcs: M.chordTones(degree, key) });
}

export function chordAtBeat(chords, beat) {
    for (let i = chords.length - 1; i >= 0; i = i - 1) {
        const c = chords[i];
        if (beat >= c.beat - 1e-6 && beat < c.beat + c.dur - 1e-6) {
            return c.pcs;
        }
    }
    return null;
}

// Harmonize a line beat by beat and record the chords.
export function harmonizeBeats(tracks, line, key, start, beats, endDegree, penultimate) {
    const melody = [];
    for (let b = 0; b < beats; b = b + 1) {
        const p = M.pitchAt(line, start + b);
        melody.push({ beat: start + b, dur: 1, pitch: p < 0 ? key.tonic + 60 : p });
    }
    const degs = M.harmonize(melody, key, endDegree, penultimate);
    for (let b = 0; b < beats; b = b + 1) {
        chordSpan(tracks, start + b, 1, key, degs[b]);
    }
    return degs;
}

// Place `material` at `start` in `track`, choosing among `options`
// (semitone transpositions) the one least dissonant with `others`, within
// `range`.
export function placeEntry(track, material, start, range, others, options) {
    let best = null;
    let bestCost = 1e9;
    for (let i = 0; i < options.length; i = i + 1) {
        const line = M.shiftTime(M.transposeLine(material, options[i]), start);
        let lo = 999;
        let hi = -999;
        for (let k = 0; k < line.length; k = k + 1) {
            lo = Math.min(lo, line[k].pitch);
            hi = Math.max(hi, line[k].pitch);
        }
        if (lo < range[0] || hi > range[1]) {
            continue;
        }
        const audit = M.auditConsonance([line].concat(others), start, start + M.lineLength(material));
        let cost = audit.strongDissonant * 3 + audit.dissonant + i * 0.01;
        for (let k = 0; k < others.length; k = k + 1) {
            cost = cost + 3 * M.auditParallels(line, others[k], start, start + M.lineLength(material));
        }
        if (cost < bestCost) {
            bestCost = cost;
            best = line;
        }
    }
    if (best !== null) {
        append(track, best);
    }
    return best;
}

// A free voice of chord tones, one note per `step` beats, moving to the
// nearest tone that is least dissonant with the other lines.
export function fillVoice(track, chords, start, beats, step, range, others, startPitch) {
    let prev = startPitch;
    for (let b = start; b < start + beats - 1e-6; b = b + step) {
        const pcs = chordAtBeat(chords, b);
        if (pcs === null) {
            continue;
        }
        let best = -1;
        let bestCost = 1e9;
        for (let p = range[0]; p <= range[1]; p = p + 1) {
            if (pcs.indexOf(((p % 12) + 12) % 12) < 0) {
                continue;
            }
            const probe = [{ beat: b, dur: step, pitch: p }];
            const audit = M.auditConsonance([probe].concat(others), b, b + step);
            let cost = Math.abs(p - prev) * 0.5 + audit.dissonant * 4;
            for (let k = 0; k < others.length; k = k + 1) {
                if (isParallelPerfect(prev, p, M.pitchAt(others[k], b - step), M.pitchAt(others[k], b))) {
                    cost = cost + 8;
                }
            }
            if (cost < bestCost) {
                bestCost = cost;
                best = p;
            }
        }
        if (best >= 0) {
            track.push({ beat: b, dur: step, pitch: best });
            prev = best;
        }
    }
}


// Free imitation: an imitating voice keeps its contour, but notes that
// clash on strong beats (beats 1 and 3) are moved to the nearest chord tone
// (within a minor third) that is consonant with the other voices; the
// adjustment Baroque counterpoint makes to a canon or tonal answer.
export function smoothFollower(track, from, to, others, chords) {
    for (let i = 0; i < track.length; i = i + 1) {
        const n = track[i];
        if (n.beat < from || n.beat >= to || ((n.beat % 2) + 2) % 2 > 1e-6) {
            continue;
        }
        const probe = [{ beat: n.beat, dur: 1, pitch: n.pitch }];
        if (M.auditConsonance([probe].concat(others), n.beat, n.beat + 1).dissonant === 0) {
            continue;
        }
        const pcs = chordAtBeat(chords, n.beat);
        let best = n.pitch;
        let bestCost = 1e9;
        for (let d = -3; d <= 3; d = d + 1) {
            const p = n.pitch + d;
            const pc = ((p % 12) + 12) % 12;
            if (pcs !== null && pcs.indexOf(pc) < 0) {
                continue;
            }
            const test = [{ beat: n.beat, dur: 1, pitch: p }];
            const dis = M.auditConsonance([test].concat(others), n.beat, n.beat + 1).dissonant;
            const cost = dis * 10 + Math.abs(d);
            if (cost < bestCost) {
                bestCost = cost;
                best = p;
            }
        }
        n.pitch = best;
    }
}

export function isParallelPerfect(a0, a1, b0, b1) {
    if (a0 < 0 || a1 < 0 || b0 < 0 || b1 < 0 || (a0 === a1 && b0 === b1)) {
        return false;
    }
    const i0 = ((a0 - b0) % 12 + 12) % 12;
    const i1 = ((a1 - b1) % 12 + 12) % 12;
    return (i0 === 7 && i1 === 7) || (i0 === 0 && i1 === 0);
}

export function compareBeat(a, b) {
    return a.beat - b.beat;
}

// Overlapping notes in one voice: the later note wins.
export function sortTrack(track) {
    track.sort(compareBeat);
    for (let i = 0; i + 1 < track.length; i = i + 1) {
        const end = track[i].beat + track[i].dur;
        if (end > track[i + 1].beat + 1e-6) {
            track[i].dur = Math.max(0.25, track[i + 1].beat - track[i].beat);
        }
    }
}


// One hit: position and length in sixteenths, throat (0 growl, 1 squeal,
// 2 chop), interval from the bar's root, vowel orbit, optional dive.
export const CALLS = [
    [[0, 3, 0, 0, "yoi"], [3, 1, 2, 0, "chop"], [4, 2, 0, 7, "growl"], [6, 2, 0, 8, "yoi"], [8, 4, 0, 7, "slow", -5], [14, 2, 2, 0, "chop"]],
    [[0, 2, 0, 0, "growl"], [3, 3, 0, 0, "yoi"], [6, 2, 2, 3, "chop"], [8, 2, 0, 7, "growl"], [10, 2, 0, 8, "growl"], [12, 4, 0, 7, "yoi", -12]],
    [[0, 4, 0, 0, "slow"], [4, 1, 2, 0, "chop"], [5, 1, 2, 0, "chop"], [6, 2, 0, 3, "yoi"], [8, 3, 0, 5, "growl"], [11, 1, 2, 7, "chop"], [12, 4, 0, 0, "yoi", 7]]
];
export const RESPONSES = [
    [[0, 2, 1, 12, "squeal"], [2, 2, 1, 15, "squeal"], [4, 4, 1, 19, "whine", -7], [10, 2, 1, 20, "squeal"], [12, 4, 1, 19, "whine"]],
    [[0, 3, 1, 19, "whine"], [3, 1, 1, 20, "squeal"], [4, 2, 1, 19, "squeal"], [6, 2, 1, 17, "squeal"], [8, 4, 1, 15, "whine", -12], [13, 3, 1, 12, "squeal"]],
    [[0, 2, 1, 24, "squeal", -12], [4, 2, 1, 19, "squeal"], [6, 2, 1, 20, "squeal"], [8, 2, 1, 19, "whine"], [10, 2, 1, 15, "whine"], [12, 4, 1, 14, "whine", -2]]
];
// Fill: throat switches every sixteenth.
export const FILL_INTERVALS = [0, 12, 7, 0, 15, 12, 7, 3, 0, 12, 19, 12, 7, 3, 2, 0];

export const ORBITS = {
    yoi: { cycles: 1.0, shape: "ramp", depth: 0.5, round: 0.6, vowel: 0.5 },
    growl: { perBeat: 4.0, shape: "step", depth: 0.4, round: 0.3, vowel: 0.45 },
    chop: { perBeat: 8.0, shape: "sine", depth: 0.35, round: 0.2, vowel: 0.3 },
    slow: { cycles: 0.5, shape: "triangle", depth: 0.5, round: 0.7, vowel: 0.5 },
    squeal: { perBeat: 6.0, shape: "sine", depth: 0.2, round: 0.1, vowel: 0.85 },
    whine: { cycles: 1.5, shape: "triangle", depth: 0.3, round: 0.2, vowel: 0.8 },
    breathe: { perBeat: 0.125, shape: "sine", depth: 0.35, round: 0.5, vowel: 0.4 }
};

// ------------------------------------------------------------------ events

export function Score() {
    this.events = [];
}

Score.prototype.at = function add(t, kind, act, a) {
    this.events.push({ t: t, kind: kind, act: act, a: a || {} });
};

export const MANTRA = [
    { c: "", v: 0.25 }, { c: "m", v: 0.5 }, { c: "n", v: 1.0 }, { c: "p", v: 0.5 }, { c: "m", v: 0.75 }, { c: "h", v: 0.0 }
];






export function orbitFor(name, lenBeats) {
    const o = ORBITS[name];
    let rate = 0.0;
    if (o.cycles !== undefined) {
        rate = o.cycles / (lenBeats * BEAT);
    } else {
        rate = o.perBeat / BEAT;
    }
    return { rate: rate, shape: o.shape, depth: o.depth, round: o.round, vowel: o.vowel };
}





export function rolmoPattern(s, t0, firstGap, ratio, count, amp, crash) {
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

export function horn(s, t, which, note, dur, level, growl) {
    s.at(t, "state", "horn", { which: which, note: note, level: level, attack: Math.min(2.0, dur * 0.3), growl: growl });
    s.at(t + dur, "state", "hornStop", { which: which, release: 1.4 });
}



export function makeWriters(at) {
    function consonant(s, t, part, index, c) {
        if (c === "m") {
            s.at(t, "state", "voiceSet", { part: part, index: index, name: "hum", value: 1.0 });
            s.at(t + 0.07, "state", "voiceSet", { part: part, index: index, name: "hum", value: 0.0 });
        } else if (c === "n") {
            s.at(t, "state", "voiceSet", { part: part, index: index, name: "stopTip", value: 1.0 });
            s.at(t, "state", "voiceSet", { part: part, index: index, name: "velumOpen", value: 1.0 });
            s.at(t + 0.06, "state", "voiceSet", { part: part, index: index, name: "stopTip", value: 0.0 });
            s.at(t + 0.08, "state", "voiceSet", { part: part, index: index, name: "velumOpen", value: 0.0 });
        } else if (c === "p") {
            s.at(t, "state", "voiceSet", { part: part, index: index, name: "stopLip", value: 1.0 });
            s.at(t + 0.04, "state", "voiceSet", { part: part, index: index, name: "stopLip", value: 0.0 });
        }
    }

    // A melodic line for one upper voice: notes with mantra syllables. Long
    // notes (two beats or more) are sung on open vowels with a slow orbit.
    function voiceLine(s, line, index) {
        for (let i = 0; i < line.length; i = i + 1) {
            const n = line[i];
            const t = at(n.beat);
            s.at(t, "state", "voice", { part: "upper", index: index, note: n.pitch });
            const syl = MANTRA[i % MANTRA.length];
            if (n.dur < 2) {
                consonant(s, t, "upper", index, syl.c);
                s.at(t, "state", "voiceSet", { part: "upper", index: index, name: "vowel", value: syl.v });
            } else {
                s.at(t, "state", "voiceSet", { part: "upper", index: index, name: "vowel", value: i % 2 === 0 ? 0.5 : 0.3 });
            }
            const next = i + 1 < line.length ? line[i + 1] : null;
            if (next === null || next.beat > n.beat + n.dur + 0.01) {
                s.at(at(n.beat + n.dur) - 0.03, "state", "voiceOff", { part: "upper", index: index });
            }
        }
    }

    function monksLine(s, line) {
        for (let i = 0; i < line.length; i = i + 1) {
            const n = line[i];
            const t = at(n.beat);
            s.at(t, "state", "note", { part: "monks", note: n.pitch });
            const syl = MANTRA[i % MANTRA.length];
            if (syl.c === "m") {
                s.at(t, "state", "set", { part: "monks", name: "hum", value: 1.0 });
                s.at(t + 0.09, "state", "set", { part: "monks", name: "hum", value: 0.0 });
            }
            s.at(t, "state", "set", { part: "monks", name: "vowel", value: syl.v * 0.6 + 0.15 });
            const next = i + 1 < line.length ? line[i + 1] : null;
            if (next === null || next.beat > n.beat + n.dur + 0.01) {
                s.at(at(n.beat + n.dur) - 0.04, "state", "off", { part: "monks" });
            }
        }
    }

    function overtoneLine(s, mapped) {
        for (let i = 0; i < mapped.length; i = i + 1) {
            const n = mapped[i];
            if (n.drone < 0) {
                continue;
            }
            s.at(at(n.beat), "state", "overtone", { drone: n.drone, harmonic: n.harmonic, pitch: n.pitch });
            const next = i + 1 < mapped.length ? mapped[i + 1] : null;
            if (next === null || next.beat > n.beat + n.dur + 0.01) {
                s.at(at(n.beat + n.dur) - 0.03, "state", "off", { part: "solo" });
            }
        }
    }

    // The continuo throat: long notes, breathing slowly through vowels.
    function continuoLine(s, line, from, to) {
        for (let i = 0; i < line.length; i = i + 1) {
            const n = line[i];
            if (n.beat < from || n.beat >= to) {
                continue;
            }
            s.at(at(n.beat), "state", "voice", { part: "bass", index: 0, note: n.pitch, glide: 0.08 });
            const next = i + 1 < line.length ? line[i + 1] : null;
            if (next === null || next.beat > n.beat + n.dur + 0.01 || next.beat >= to) {
                s.at(at(Math.min(n.beat + n.dur, to)) - 0.05, "state", "voiceOff", { part: "bass", index: 0 });
            }
        }
    }

    function bassHit(s, barBeat, hit, rootPitch) {
        const pos = hit[0];
        const len = hit[1];
        const throat = hit[2];
        const interval = hit[3];
        const orbit = orbitFor(hit[4], len * 0.25);
        const t = at(barBeat + pos * 0.25);
        const note = rootPitch + interval;
        s.at(t, "state", "orbit", { part: "bass", index: throat, rate: orbit.rate, shape: orbit.shape, depth: orbit.depth, round: orbit.round, phase: 0.0 });
        s.at(t, "state", "voiceSet", { part: "bass", index: throat, name: "vowel", value: orbit.vowel });
        s.at(t, "state", "voice", { part: "bass", index: throat, note: note, glide: 0.004 });
        if (hit.length > 5) {
            s.at(at(barBeat + (pos + len * 0.35) * 0.25), "state", "voice", { part: "bass", index: throat, note: note + hit[5], glide: 0.03 });
        }
        s.at(at(barBeat + (pos + len) * 0.25) - 0.012, "state", "voiceOff", { part: "bass", index: throat });
        if (throat === 0 && (pos === 0 || pos === 8)) {
            s.at(t, "trigger", "dunk", { amp: pos === 0 ? 0.8 : 0.5 });
        }
    }

    function dropBass(s, tracks, fromBar, bars, variety) {
        for (let b = 0; b < bars; b = b + 1) {
            const beat = (fromBar + b) * 4;
            const pcs = chordAtBeat(tracks.chords, beat);
            let rootPc = pcs !== null ? pcs[0] : 0;
            let root = 36 + rootPc;
            if (root > 41) {
                root = root - 12;
            }
            let pattern = null;
            if (b % 4 === 3) {
                pattern = [];
                for (let k = 0; k < 16; k = k + 1) {
                    const thr = k % 3;
                    pattern.push([k, 1, thr, FILL_INTERVALS[k] - (thr === 1 ? 0 : 0), thr === 1 ? "squeal" : (thr === 0 ? "growl" : "chop")]);
                }
            } else if (b % 2 === 0) {
                pattern = CALLS[(Math.floor(b / 2) + variety) % CALLS.length];
            } else {
                pattern = RESPONSES[(Math.floor(b / 2) + variety) % RESPONSES.length];
            }
            for (let h = 0; h < pattern.length; h = h + 1) {
                bassHit(s, beat, pattern[h], root);
            }
            s.at(at(beat), "state", "sub", { note: root, level: 1.0 });
        }
        s.at(at((fromBar + bars) * 4) - 0.02, "state", "sub", { note: 36, level: 0.0 });
    }

    function drums(s, fromBar, bars, intensity) {
        for (let b = 0; b < bars; b = b + 1) {
            const beat = (fromBar + b) * 4;
            s.at(at(beat), "trigger", "kick", { amp: 1.0 });
            s.at(at(beat + 2), "trigger", "snare", { amp: 0.95 * intensity });
            if (b % 2 === 1) {
                s.at(at(beat + 2.75), "trigger", "kick", { amp: 0.7 });
            }
            if (b % 4 === 2) {
                s.at(at(beat + 1.75), "trigger", "snare", { amp: 0.25 * intensity });
            }
            for (let e = 0; e < 8; e = e + 1) {
                s.at(at(beat + e * 0.5), "trigger", "hat", { amp: (e % 2 === 1 ? 0.9 : 0.5) * intensity, open: e === 7 && b % 2 === 1 });
            }
            if (b % 4 === 3) {
                for (let k = 0; k < 4; k = k + 1) {
                    s.at(at(beat + 3 + 0.25 * k), "trigger", "snare", { amp: (0.45 + 0.12 * k) * intensity });
                }
            }
            if (b % 8 === 0) {
                s.at(at(beat), "trigger", "rolmo", { amp: 0.75 * intensity, bright: 0.9 });
            }
        }
    }

    function softDrums(s, fromBar, bars) {
        for (let b = 0; b < bars; b = b + 1) {
            const beat = (fromBar + b) * 4;
            s.at(at(beat), "trigger", "kick", { amp: 0.6 });
            s.at(at(beat + 2), "trigger", "nga", { amp: 0.6 });
            for (let e = 1; e < 8; e = e + 2) {
                s.at(at(beat + e * 0.5), "trigger", "hat", { amp: 0.35, open: false });
            }
        }
    }

    function gyalingLine(s, line, level) {
        for (let i = 0; i < line.length; i = i + 1) {
            const n = line[i];
            const grace = n.dur >= 1 ? 2 : 0;
            s.at(at(n.beat), "state", "gya", { which: 0, note: n.pitch, level: level, grace: grace, graceDur: 0.06 });
            s.at(at(n.beat) + 0.05 + 0.02 * (i % 3), "state", "gya", { which: 1, note: n.pitch, level: level * 0.9, grace: i % 3 === 1 ? 3 : grace, graceDur: 0.08 });
        }
        const last = line[line.length - 1];
        s.at(at(last.beat + last.dur), "state", "gyaStop", { which: 0 });
        s.at(at(last.beat + last.dur) + 0.06, "state", "gyaStop", { which: 1 });
    }

    return {
        consonant: consonant,
        voiceLine: voiceLine,
        monksLine: monksLine,
        overtoneLine: overtoneLine,
        continuoLine: continuoLine,
        bassHit: bassHit,
        dropBass: dropBass,
        drums: drums,
        softDrums: softDrums,
        gyalingLine: gyalingLine
    };
}
