// Ensemble presets. Each singer differs by body, register, key offset and
// small personal habits; nothing is a transposed copy of another.

import { makeSingerConfig } from "./choir.js?v=1a24f9b503";

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
        note: "Ventricular folds close every second glottal pulse: the sung note is joined by its sub-octave. Self-oscillating folds: the locking emerges from the airflow.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.32, rt60: 4.0, damping: 0.5 },
        singers: spread([
            singer("bass", "ventricular", 0, { octave: 0, vibratoDepth: 0.02, effort: 0.8, larynx: -0.5, larynxModel: "folds" }),
            singer("basso", "ventricular", 0, { octave: 0, vibratoDepth: 0.02, effort: 0.8, larynx: -0.5, larynxModel: "folds" }),
            singer("baritone", "ventricular", 0, { octave: 0, vibratoDepth: 0.03, effort: 0.8, larynx: -0.4, larynxModel: "folds" })
        ])
    },
    {
        id: "kargyraa",
        name: "Kargyraa",
        note: "Tuvan/Mongolian ventricular style. Self-oscillating folds: the false folds lock onto every second glottal cycle by themselves. Move the vowel to walk the overtones.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.22, rt60: 2.5, damping: 0.45 },
        singers: [singer("bass", "ventricular", 0, { octave: 0, vibratoDepth: 0.0, effort: 0.9, driftCents: 2.0, larynx: -0.3, larynxModel: "folds" })]
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
        note: "Two narrowings of the tongue, as measured by MRI in Tuvan singers: one at the ridge behind the teeth merges F2 and F3 into one sharp peak, one at the back moves it onto the harmonic. Neighbours fall 17-29 dB.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.25, rt60: 3.0, damping: 0.35 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "focus", press: 0.6, vibratoDepth: 0.0, effort: 0.9, driftCents: 2.0, epilarynx: 0.6, level: 2.0 })]
    },
    {
        id: "borbangnadyr",
        name: "Borbangnadyr (rolling)",
        note: "Khöömei whose tongue rocks the resonance between two neighbouring harmonics, so the overtone rolls. A herder's call walks over the drone.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.22, rt60: 2.6, damping: 0.4 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "overtone", press: 0.5, ornament: "trill", ornRate: 7.0, ornDepth: 1.0, melody: "call", melodyRate: 1.0, vibratoDepth: 0.0, effort: 0.85, driftCents: 2.0, epilarynx: 0.6, level: 3.0 })]
    },
    {
        id: "ezengileer",
        name: "Ezengileer (stirrup)",
        note: "The lips round three times and rest, like hooves: the whistle pulses in a gallop while the melody ripples.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.22, rt60: 2.6, damping: 0.4 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "overtone", press: 0.5, ornament: "gallop", ornRate: 2.2, ornDepth: 0.7, melody: "ripple", melodyRate: 1.1, vibratoDepth: 0.0, effort: 0.85, driftCents: 2.0, epilarynx: 0.6, level: 3.0 })]
    },
    {
        id: "chylandyk",
        name: "Chylandyk (whistle over growl)",
        note: "Ventricular sub-octave below, a sygyt whistle above: three layers from one throat.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.24, rt60: 2.8, damping: 0.4 },
        singers: [singer("baritone", "ventricular", 0, { octave: 0, tuning: "sygyt", ventRatio: 2, press: 0.5, melody: "high", melodyRate: 1.2, vibratoDepth: 0.0, effort: 0.9, driftCents: 2.0, epilarynx: 0.6, level: 9.0 })]
    },
    {
        id: "dumchuktaar",
        name: "Dumchuktaar (through the nose)",
        note: "Lips sealed, velum open. The tongue reshapes the hidden mouth cavity and the overtone comes out of the nose. Tuned from the singer's own map of mouth shapes.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.24, rt60: 2.8, damping: 0.4 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "nasal", press: 0.5, melody: "rise", melodyRate: 1.0, vibratoDepth: 0.0, effort: 0.85, driftCents: 2.0, level: 3.0 })]
    },
    {
        id: "uruulyn",
        name: "Uruulyn (labial)",
        note: "The lips tune: a small round opening for low overtones, spread for high ones.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.24, rt60: 2.8, damping: 0.4 },
        singers: [singer("baritone", "pressed", 0, { octave: 0, tuning: "labial", press: 0.5, melody: "rise", melodyRate: 1.4, vibratoDepth: 0.0, effort: 0.85, driftCents: 2.0, level: 2.4 })]
    },
    {
        id: "kargyraa-walk",
        name: "Kargyraa vowel walk",
        note: "The melody lives on harmonics of the sub-octave. The vowel walks onto them: even ones ring out, odd ones (true sub-harmonics) are subtler.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.22, rt60: 2.5, damping: 0.45 },
        singers: [singer("bass", "ventricular", 0, { octave: 0, tuning: "vowel", ventRatio: 2, press: 0.3, melody: "walk", melodyRate: 1.2, phrase: 7.0, breathGap: 0.9, vibratoDepth: 0.0, effort: 0.9, driftCents: 2.0, larynx: -0.4, level: 1.6, larynxModel: "folds" })]
    },
    {
        id: "overtone-canon",
        name: "Overtone canon",
        note: "Three throat singers on one drone, each with a different gesture (tongue, lips, nose), singing the same overtone line two steps apart.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.3, rt60: 3.4, damping: 0.4 },
        singers: spread([
            singer("baritone", "pressed", 0, { octave: 0, tuning: "overtone", press: 0.5, melody: "descent", melodyRate: 1.5, melodyOffset: 0, phrase: 9.0, vibratoDepth: 0.0, effort: 0.85, epilarynx: 0.6, level: 2.2 }),
            singer("baritone", "pressed", 0, { octave: 0, tuning: "labial", press: 0.5, melody: "descent", melodyRate: 1.5, melodyOffset: -2, phrase: 9.0, vibratoDepth: 0.0, effort: 0.85, level: 2.4 }),
            singer("bass", "pressed", 0, { octave: 0, tuning: "nasal", press: 0.5, melody: "descent", melodyRate: 1.5, melodyOffset: -4, phrase: 9.0, vibratoDepth: 0.0, effort: 0.85, level: 3.0 })
        ])
    },
    {
        id: "tenore",
        name: "Four throats (Sardinian tenore)",
        note: "Bassu with its folds dividing the pitch to a sub-octave; contra a fifth above with both pairs of folds in step; mesu boghe and boghe above in ordinary voice.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.18, rt60: 1.8, damping: 0.5 },
        singers: spread([
            singer("bass", "ventricular", 0, { octave: 0, ventRatio: 2, press: 0.3, larynx: -0.3, vibratoDepth: 0.02, effort: 0.85, level: 1.4 }),
            singer("baritone", "ventricular", 7, { octave: 0, ventRatio: 1, press: 0.5, vibratoDepth: 0.02, effort: 0.85, level: 1.2 }),
            singer("tenor", "chest", 12, { octave: 0, vibratoDepth: 0.08, effort: 0.7 }),
            singer("tenor", "chest", 16, { octave: 0, vibratoDepth: 0.12, effort: 0.75, level: 1.2 })
        ])
    },
    {
        id: "split-tone",
        name: "Split-tone women (umngqokolo)",
        note: "Women singing with the ventricular sub-octave and an overtone line on top: a lower, rough tone split from a high whistle.",
        pad: "harmonic",
        voicing: "stack",
        hall: { mix: 0.24, rt60: 2.4, damping: 0.45 },
        singers: spread([
            singer("alto", "ventricular", 0, { octave: 0, tuning: "overtone", ventRatio: 2, press: 0.5, melody: "call", melodyRate: 1.2, vibratoDepth: 0.0, effort: 0.85, epilarynx: 0.6, level: 4.8 }),
            singer("mezzo", "ventricular", 0, { octave: 0, tuning: "overtone", ventRatio: 2, press: 0.5, melody: "call", melodyRate: 1.2, melodyOffset: -4, vibratoDepth: 0.0, effort: 0.85, epilarynx: 0.6, level: 4.8 })
        ])
    },
    {
        id: "breath-game",
        name: "Breath game (in and out)",
        note: "Two women face to face trade short motifs on the out-breath and the in-breath, voiced and breathed, one step apart, in the manner of Inuit katajjaq. Hold a note.",
        pad: "vowel",
        voicing: "stack",
        hall: { mix: 0.12, rt60: 1.2, damping: 0.5 },
        singers: [
            singer("alto", "head", 0, { octave: 0, pan: -0.5, pattern: "rolling", patternRate: 6.5, patternOffset: 0, vibratoDepth: 0.0, attack: 0.02, release: 0.08, level: 2.6 }),
            singer("mezzo", "head", 0, { octave: 0, pan: 0.5, pattern: "rolling", patternRate: 6.5, patternOffset: 2, vibratoDepth: 0.0, attack: 0.02, release: 0.08, level: 2.6 })
        ]
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
