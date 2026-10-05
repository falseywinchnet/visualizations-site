// Ensemble presets. Each singer differs by body, register, key offset and
// small personal habits; nothing is a transposed copy of another.

import { makeSingerConfig } from "./choir.js";

function singer(type, register, interval, extra) {
    const c = makeSingerConfig(type, register, interval);
    if (extra) {
        const keys = Object.keys(extra);
        for (let i = 0; i < keys.length; i = i + 1) {
            c[keys[i]] = extra[keys[i]];
        }
    }
    return c;
}

function spread(list) {
    // Spread pans and give each singer slightly different habits.
    const n = list.length;
    for (let i = 0; i < n; i = i + 1) {
        if (n > 1 && list[i].pan === 0.0) {
            list[i].pan = -0.8 + 1.6 * i / (n - 1);
        }
        const h = Math.sin(12.9898 * (i + 1)) * 43758.5453;
        const r = h - Math.floor(h);
        list[i].detune = list[i].detune + (r - 0.5) * 14.0;
        list[i].onset = list[i].onset + r * 0.12;
        list[i].vibratoRate = list[i].vibratoRate + (r - 0.5) * 1.0;
        list[i].lengthScale = list[i].lengthScale * (0.96 + 0.08 * r);
    }
    return list;
}

export const PRESETS = [
    {
        id: "lone-monk",
        name: "Lone monk (physical)",
        note: "The classic monk's body, decomposed from its formants, singing through a real tube.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.25, rt60: 2.8, damping: 0.4 },
        singers: [singer("classic", "chest", 0, { vibratoDepth: 0.15, driftCents: 3.0 })]
    },
    {
        id: "gyuto",
        name: "Gyuto tantric chant",
        note: "Deep voices near 65 Hz. Each monk tunes F1 to the 5th harmonic and F2 to the 10th: one voice, a chord.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.38, rt60: 4.5, damping: 0.5 },
        singers: spread([
            singer("basso", "chest", 0, { octave: -1, tuning: "gyuto", vibratoDepth: 0.03, effort: 0.75, larynx: -0.3, level: 1.8 }),
            singer("basso", "ventricular", 0, { octave: -1, tuning: "gyuto", vibratoDepth: 0.02, effort: 0.75, larynx: -0.3, level: 1.8 }),
            singer("bass", "chest", 0, { octave: -1, tuning: "gyuto", vibratoDepth: 0.03, effort: 0.7, larynx: -0.4, level: 1.8 }),
            singer("basso", "chest", 0, { octave: -1, tuning: "gyuto", vibratoDepth: 0.03, effort: 0.75, larynx: -0.2, level: 1.8 }),
            singer("bass", "ventricular", 0, { octave: -1, tuning: "gyuto", vibratoDepth: 0.02, effort: 0.7, larynx: -0.4, level: 1.8 })
        ])
    },
    {
        id: "dzoke",
        name: "Dzo-ke half tone",
        note: "Ventricular folds close every second glottal pulse: the sung note is joined by its sub-octave.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.32, rt60: 4.0, damping: 0.5 },
        singers: spread([
            singer("bass", "ventricular", 0, { octave: 0, vibratoDepth: 0.02, effort: 0.8, larynx: -0.5 }),
            singer("basso", "ventricular", 0, { octave: 0, vibratoDepth: 0.02, effort: 0.8, larynx: -0.5 }),
            singer("baritone", "ventricular", 0, { octave: 0, vibratoDepth: 0.03, effort: 0.8, larynx: -0.4 })
        ])
    },
    {
        id: "kargyraa",
        name: "Kargyraa",
        note: "Tuvan/Mongolian ventricular style: deep sub-octave growl; move the vowel to walk the overtones.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.22, rt60: 2.5, damping: 0.45 },
        singers: [singer("bass", "ventricular", 0, { octave: 0, vibratoDepth: 0.0, effort: 0.9, driftCents: 2.0, larynx: -0.3 })]
    },
    {
        id: "khoomei",
        name: "Khöömei (overtone)",
        note: "Pressed voice; the tongue moves a resonance onto one harmonic. Pad up/down picks the harmonic.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.25, rt60: 3.0, damping: 0.35 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "overtone", vibratoDepth: 0.0, effort: 0.85, driftCents: 2.0, epilarynx: 0.6, level: 2.2 })]
    },
    {
        id: "sygyt",
        name: "Sygyt (whistle)",
        note: "Tongue tip sealed behind the teeth clusters F2 and F3 into one sharp whistle on a high harmonic.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.25, rt60: 3.0, damping: 0.35 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "sygyt", vibratoDepth: 0.0, effort: 0.9, driftCents: 2.0, epilarynx: 0.6, level: 4.0 })]
    },
    {
        id: "schola",
        name: "Gregorian schola",
        note: "Eight men in unison, folded into each one's own range.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.42, rt60: 5.0, damping: 0.5 },
        singers: spread([
            singer("tenor", "chest", 0), singer("baritone", "chest", 0), singer("bass", "chest", 0), singer("tenor", "chest", 0),
            singer("baritone", "chest", 0), singer("bass", "chest", 0), singer("baritone", "chest", 0), singer("tenor", "head", 0)
        ])
    },
    {
        id: "organum",
        name: "Parallel organum",
        note: "Medieval polyphony: the vox principalis with a voice a fourth below and octave doublings.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.42, rt60: 5.0, damping: 0.5 },
        singers: spread([
            singer("tenor", "chest", 0, { octave: 0 }), singer("tenor", "chest", 0, { octave: 0 }),
            singer("baritone", "chest", -5, { octave: 0 }), singer("baritone", "chest", -5, { octave: 0 }),
            singer("bass", "chest", -12, { octave: 0 }), singer("bass", "chest", -17, { octave: 0 })
        ])
    },
    {
        id: "satb",
        name: "Monastery & convent (SATB)",
        note: "Sopranos tune F1 to their pitch as they climb (vowel modification). Play chords to split the parts.",
        pad: "vowel",
        voicing: "chord",
        hall: { mix: 0.38, rt60: 4.0, damping: 0.45 },
        singers: spread([
            singer("soprano", "head", 24, { tuning: "r1", vibratoDepth: 0.3, epilarynx: 0.45 }),
            singer("soprano", "head", 24, { tuning: "r1", vibratoDepth: 0.28, epilarynx: 0.45 }),
            singer("alto", "head", 16, { tuning: "r1", vibratoDepth: 0.25 }),
            singer("alto", "head", 16, { tuning: "r1", vibratoDepth: 0.25 }),
            singer("tenor", "chest", 7, { vibratoDepth: 0.22, epilarynx: 0.5 }),
            singer("tenor", "chest", 7, { vibratoDepth: 0.22, epilarynx: 0.5 }),
            singer("bass", "chest", 0, { vibratoDepth: 0.2, epilarynx: 0.5 }),
            singer("bass", "chest", 0, { vibratoDepth: 0.2, epilarynx: 0.5 })
        ])
    },
    {
        id: "countertenor",
        name: "Countertenor over monks",
        note: "A man's body in falsetto floating a twelfth over a monk drone.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.4, rt60: 4.5, damping: 0.45 },
        singers: spread([
            singer("countertenor", "falsetto", 19, { octave: 0, tuning: "r1", vibratoDepth: 0.25 }),
            singer("bass", "chest", 0, { octave: 0, vibratoDepth: 0.05 }),
            singer("basso", "chest", 0, { octave: 0, vibratoDepth: 0.04 }),
            singer("baritone", "chest", 7, { octave: 0, vibratoDepth: 0.05 })
        ])
    },
    {
        id: "keys",
        name: "Monks in different keys",
        note: "Four sections each a fixed interval apart: tonic, fourth, fifth and a fourth below.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.38, rt60: 4.0, damping: 0.45 },
        singers: spread([
            singer("bass", "chest", 0), singer("baritone", "chest", 5), singer("tenor", "chest", 7),
            singer("basso", "chest", -5), singer("treble", "head", 12, { tuning: "r1" }), singer("mezzo", "head", 7, { tuning: "r1" })
        ])
    }
];

export function presetById(id) {
    for (let i = 0; i < PRESETS.length; i = i + 1) {
        if (PRESETS[i].id === id) {
            return PRESETS[i];
        }
    }
    return PRESETS[0];
}
