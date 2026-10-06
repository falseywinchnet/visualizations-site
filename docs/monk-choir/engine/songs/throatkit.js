// Score writers for the throat-singing pieces: the per-singer mechanisms of
// throat.js, larynx.js and choir.js setSinger, as timed events. Times are in
// seconds; a piece maps its own beats to seconds before calling these.
//
// Events written here (song.js apply):
//   voice / voiceOff    one singer starts or stops a note
//   singerSet           one singer's setting: "own.harmonic", tuning,
//                       ornament, ornRate, pattern, patternRate,
//                       larynxModel, "own.vowel", "own.hum", "own.halftone"...
//   tungur, pluck       frame drum and lute

export function voice(s, t, part, index, note, glide) {
    const a = { part: part, index: index, note: note };
    if (glide !== undefined) {
        a.glide = glide;
    }
    s.at(t, "state", "voice", a);
}

export function off(s, t, part, index) {
    s.at(t, "state", "voiceOff", { part: part, index: index });
}

export function setSinger(s, t, part, index, field, value) {
    s.at(t, "state", "singerSet", { part: part, index: index, field: field, value: value });
}

export function harmonic(s, t, part, index, n) {
    setSinger(s, t, part, index, "own.harmonic", n);
}

export function vowel(s, t, part, index, v) {
    setSinger(s, t, part, index, "own.vowel", v);
}

// An overtone melody: steps of [harmonic, seconds] from t0. A harmonic of 0
// holds the previous one. Returns the end time.
export function overtoneMelody(s, t0, part, index, steps) {
    let t = t0;
    for (let i = 0; i < steps.length; i = i + 1) {
        if (steps[i][0] > 0) {
            harmonic(s, t, part, index, steps[i][0]);
        }
        t = t + steps[i][1];
    }
    return t;
}

// The galloping hoof rhythm on the frame drum: per beat a strong stroke near
// the centre, then two light rim strokes (long-short-short), with a little
// push before the downbeat every fourth beat.
export function gallop(s, t0, beats, beatSec, amp) {
    for (let b = 0; b < beats; b = b + 1) {
        const t = t0 + b * beatSec;
        s.at(t, "trigger", "tungur", { amp: amp, bright: 0.25 });
        s.at(t + 0.5 * beatSec, "trigger", "tungur", { amp: amp * 0.45, bright: 0.85 });
        s.at(t + 0.75 * beatSec, "trigger", "tungur", { amp: amp * 0.55, bright: 0.8 });
    }
}

// A steady walking pulse on the drum (one stroke a beat, an accent per bar).
export function walk(s, t0, beats, beatSec, amp, perBar) {
    for (let b = 0; b < beats; b = b + 1) {
        const accent = b % perBar === 0;
        s.at(t0 + b * beatSec, "trigger", "tungur", { amp: accent ? amp : amp * 0.55, bright: accent ? 0.2 : 0.6 });
    }
}

// The lute: a drone of root and fifth, strummed down-up in the gallop.
export function luteGallop(s, t0, beats, beatSec, root, amp) {
    for (let b = 0; b < beats; b = b + 1) {
        const t = t0 + b * beatSec;
        s.at(t, "trigger", "pluck", { note: root, amp: amp, pan: 0.35 });
        s.at(t + 0.012, "trigger", "pluck", { note: root + 7, amp: amp * 0.8, pan: 0.65 });
        s.at(t + 0.5 * beatSec, "trigger", "pluck", { note: root + 7, amp: amp * 0.45, pan: 0.65 });
        s.at(t + 0.75 * beatSec, "trigger", "pluck", { note: root, amp: amp * 0.5, pan: 0.35 });
    }
}

// A plucked melody: notes [pitch, seconds] from t0 over a drone string that
// sounds again on every long note. Returns the end time.
export function luteMelody(s, t0, notes, droneNote, amp) {
    let t = t0;
    for (let i = 0; i < notes.length; i = i + 1) {
        const p = notes[i][0];
        const d = notes[i][1];
        if (p > 0) {
            s.at(t, "trigger", "pluck", { note: p, amp: amp, pan: 0.6 });
            if (d >= 0.6 && droneNote > 0) {
                s.at(t + 0.008, "trigger", "pluck", { note: droneNote, amp: amp * 0.55, pan: 0.4 });
            }
            // a quick tremolo on the longest notes, as the lute is played
            if (d >= 1.2) {
                for (let k = 1; k < Math.floor(d / 0.11); k = k + 1) {
                    s.at(t + k * 0.11, "trigger", "pluck", { note: p, amp: amp * 0.35, pan: 0.6 });
                }
            }
        }
        t = t + d;
    }
    return t;
}

// A breath game for one singer: switch its motif on at t (its own clock
// starts with the note) and off at t1.
export function breathGame(s, t, t1, part, index, note, pattern, stepsPerSecond, offset) {
    setSinger(s, t - 0.01, part, index, "pattern", pattern);
    setSinger(s, t - 0.01, part, index, "patternRate", stepsPerSecond);
    setSinger(s, t - 0.01, part, index, "patternOffset", offset);
    voice(s, t, part, index, note, 0.02);
    off(s, t1, part, index);
    setSinger(s, t1 + 0.3, part, index, "pattern", "none");
}

export function section(s, t, index) {
    s.at(t, "state", "section", { index: index });
}

export function compareTime(a, b) {
    return a.t - b.t;
}
