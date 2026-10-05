// Classic engine: the 2002 singing-monk voice, as reconstructed by MonkSynth.
//
// This file is a JavaScript port of the portable C DSP engine of MonkSynth
// (https://github.com/JonET/monksynth, commit 5afcfa7, dsp/voice.c, dsp/delay.c,
// dsp/synth.c). MonkSynth is a from-scratch reimplementation whose author studied
// the original plugin; its constants (formant table, 10-tick ramp, 1/32-semitone
// pitch quantization, vibrato jitter, delay taps) are the reference we reproduce.
//
// MonkSynth is MIT licensed:
//   Copyright (c) 2026 Jonathan Taylor
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// Every float operation of the C code is rounded to float32 with Math.fround so
// the port follows the reference arithmetic. Integer casts follow C truncation.

const fr = Math.fround;

export const CLASSIC_NUM_FORMANTS = 3;
const OVERLAP_BUF_SIZE = 10240;
const SPLINE_TBL_SIZE = 1280;
const SINE_TBL_SIZE = 1024;
const MAX_GRAIN = 3840;
const SPLINE_SEG_SIZE = 320;
const PITCH_TABLE_BASE = fr(8.175799);
const GRAIN_DURATION = fr(0.02);
const ASPIRATION_AMP_DEFAULT = fr(0.5);
const ASPIRATION_PERIOD1 = fr(0.000202);
const ASPIRATION_PERIOD2 = fr(0.000263);
const ENV_ANTICLICK = fr(0.003);
const PI = fr(3.14159265358979323846);
const TAU = fr(6.28318530717958647692);
const MIN_PITCH_HZ = 8.0;
const MAX_PITCH_HZ = 20000.0;
const RAMP_TICKS = 10;
const XY_PAD_GLIDE = fr(0.035);
const MAX_BUF = 8192;
const MAX_NOTES = 16;
export const CLASSIC_MAX_UNISON = 10;
const DELAY_LINE_SIZE = 96000;
const DELAY_TIME_L_44100 = 13653;
const DELAY_TIME_R_44100 = 17570;

const ENV_IDLE = 0;
const ENV_ATTACK = 1;
const ENV_DECAY = 2;
const ENV_SUSTAIN = 3;
const ENV_RELEASE = 4;

// Formant centre frequencies (Hz) at the five vowel positions of the pad axis.
// The column order is the sung order ooh, ow, ah, ayh, eeh.
export const CLASSIC_FORMANT_FREQS = [
    [280.0, 450.0, 800.0, 350.0, 270.0],
    [600.0, 800.0, 1150.0, 2000.0, 2140.0],
    [2240.0, 2830.0, 2900.0, 2800.0, 2950.0]
];
export const CLASSIC_FORMANT_BW = [32.5, 47.5, 62.5];

function clampf(x, lo, hi) {
    // NaN fails both comparisons and maps to lo, as in the C code.
    if (x > lo) {
        if (x < hi) {
            return x;
        }
        return hi;
    }
    return lo;
}

// C float -> uint32 / int truncation.
function truncInt(x) {
    return Math.trunc(x);
}

function sanitizeSampleRate(sr) {
    if (sr >= 1000.0 && sr <= 768000.0) {
        return fr(sr);
    }
    return fr(44100.0);
}

export function classicNoteToHz(note) {
    return fr(fr(440.0) * fr(Math.pow(2.0, fr(fr(note - 69.0) / 12.0))));
}

export function classicHzToNote(hz) {
    return fr(fr(fr(12.0) * fr(Math.log2(fr(hz / 440.0)))) + 69.0);
}

export function classicMidiNoteToFreq(note) {
    return classicNoteToHz(note);
}

// ---------------------------------------------------------------- voice

function makeVoice() {
    const v = {
        sample_rate: 44100.0,
        active: false,
        current_pitch: 0.0,
        target_pitch: 0.0,
        pitch_bend_offset: 0.0,
        glide_param: 0.0,
        min_glide: 0.0,
        pitch_step: 0.0,
        pitch_ramp_ticks: 0,
        vowel_step: 0.0,
        vowel_ramp_ticks: 0,
        ramp_counter: 0,
        ramp_period: 0,
        vibrato_phase: 0.0,
        vibrato_depth: 0.0,
        vibrato_rate: 0.0,
        random_jitter: 0.0,
        jitter_counter: 0,
        jitter_period: 0,
        sr_per_vib_tbl: 0.0,
        rng_state: 0,
        overlap_buf: new Float32Array(OVERLAP_BUF_SIZE),
        overlap_write_pos: 0,
        overlap_read_pos: 0,
        overlap_offset: 0,
        grain: new Float32Array(MAX_GRAIN),
        grain_len: 0,
        current_vowel: 0.0,
        target_vowel: 0.0,
        current_voice: 0.0,
        aspiration_amp: 0.0,
        grain_dirty: false,
        env_stage: ENV_IDLE,
        env_level: 0.0,
        env_attack: 0.0,
        env_decay: 0.0,
        env_sustain: 0.0,
        env_release: 0.0,
        sine_tbl: new Float32Array(SINE_TBL_SIZE),
        formant_tbl: [new Float32Array(SPLINE_TBL_SIZE), new Float32Array(SPLINE_TBL_SIZE), new Float32Array(SPLINE_TBL_SIZE)],
        cos_window: new Float32Array(MAX_GRAIN),
        exp_decay: new Float32Array(MAX_GRAIN * 4),
        aspiration: new Float32Array(MAX_GRAIN)
    };
    return v;
}

function buildSineTable(v) {
    for (let i = 0; i < SINE_TBL_SIZE; i = i + 1) {
        v.sine_tbl[i] = Math.sin(fr(fr(TAU * i) / SINE_TBL_SIZE));
    }
}

function buildFormantTables(v) {
    for (let f = 0; f < CLASSIC_NUM_FORMANTS; f = f + 1) {
        const pts = CLASSIC_FORMANT_FREQS[f];
        const padded = [pts[0], pts[0], pts[1], pts[2], pts[3], pts[4], pts[4]];
        for (let seg = 0; seg < 4; seg = seg + 1) {
            const p0 = padded[seg];
            const p1 = padded[seg + 1];
            const p2 = padded[seg + 2];
            const p3 = padded[seg + 3];
            for (let i = 0; i < SPLINE_SEG_SIZE; i = i + 1) {
                const t = fr(i / SPLINE_SEG_SIZE);
                const t2 = fr(t * t);
                const t3 = fr(t2 * t);
                const a = fr(2.0 * p1);
                const b = fr(fr(-p0 + p2) * t);
                const c = fr(fr(fr(fr(fr(2.0 * p0) - fr(5.0 * p1)) + fr(4.0 * p2)) - p3) * t2);
                const d = fr(fr(fr(fr(-p0 + fr(3.0 * p1)) - fr(3.0 * p2)) + p3) * t3);
                v.formant_tbl[f][seg * SPLINE_SEG_SIZE + i] = fr(0.5 * fr(fr(fr(a + b) + c) + d));
            }
        }
    }
}

function buildWindowAndDecay(v) {
    const n = v.grain_len;
    const sr = v.sample_rate;
    const attack_len = truncInt(fr(sr * fr(0.0018)));
    const release_start = truncInt(fr(sr * fr(0.013)));
    const release_len = truncInt(fr(sr * fr(0.007)));
    for (let i = 0; i < n; i = i + 1) {
        v.cos_window[i] = 1.0;
    }
    for (let i = 0; i < attack_len && i < n; i = i + 1) {
        v.cos_window[i] = fr(0.5 * fr(1.0 - fr(Math.cos(fr(fr(PI * i) / attack_len)))));
    }
    for (let i = release_start; i < n; i = i + 1) {
        v.cos_window[i] = fr(0.5 * fr(1.0 - fr(Math.cos(fr(fr(PI * (release_len + i)) / release_len)))));
    }
    const bw = fr(50.0 * PI);
    for (let i = 0; i < n * 4; i = i + 1) {
        v.exp_decay[i] = Math.exp(fr(fr(-bw * i) / sr));
    }
}

function buildAspiration(v) {
    const n = v.grain_len;
    const sr = v.sample_rate;
    const p1 = fr(sr * ASPIRATION_PERIOD1);
    const p2 = fr(sr * ASPIRATION_PERIOD2);
    const decay_len = v.grain_len * 4;
    for (let i = 0; i < n; i = i + 1) {
        const s1 = fr(Math.sin(fr(fr(TAU * i) / p1)));
        const d1_idx = truncInt(fr(i * 3.0));
        let d1 = 0.0;
        if (d1_idx < decay_len) {
            d1 = v.exp_decay[d1_idx];
        }
        const s2 = fr(Math.sin(fr(fr(TAU * i) / p2)));
        const d2_idx = truncInt(fr(i * fr(3.5)));
        let d2 = 0.0;
        if (d2_idx < decay_len) {
            d2 = v.exp_decay[d2_idx];
        }
        v.aspiration[i] = fr(fr(s1 * d1) + fr(s2 * d2));
    }
}

function nextRand(v) {
    v.rng_state = (Math.imul(v.rng_state, 1103515245) + 12345) >>> 0;
    return fr(((v.rng_state >>> 16) & 0x7FFF) / 32768.0);
}

function envTick(v) {
    let rate = 0.0;
    if (v.env_stage === ENV_ATTACK) {
        rate = fr(1.0 / fr(Math.max(v.env_attack, ENV_ANTICLICK) * v.sample_rate));
        v.env_level = fr(v.env_level + rate);
        if (v.env_level >= 1.0) {
            v.env_level = 1.0;
            if (v.env_decay > 0.0) {
                v.env_stage = ENV_DECAY;
            } else {
                v.env_stage = ENV_SUSTAIN;
            }
        }
    } else if (v.env_stage === ENV_DECAY) {
        if (v.env_decay > 0.0) {
            rate = fr(1.0 / fr(v.env_decay * v.sample_rate));
        } else {
            rate = 1.0;
        }
        v.env_level = fr(v.env_level - fr(rate * fr(1.0 - v.env_sustain)));
        if (v.env_level <= v.env_sustain) {
            v.env_level = v.env_sustain;
            v.env_stage = ENV_SUSTAIN;
        }
    } else if (v.env_stage === ENV_RELEASE) {
        rate = fr(1.0 / fr(Math.max(v.env_release, ENV_ANTICLICK) * v.sample_rate));
        v.env_level = fr(v.env_level - rate);
        if (v.env_level <= 0.0) {
            v.env_level = 0.0;
            v.env_stage = ENV_IDLE;
            v.active = false;
        }
    }
    return v.env_level;
}

function lookupFormant(v, formant, vowel) {
    const pos = fr(clampf(vowel, 0.0, 1.0) * (SPLINE_TBL_SIZE - 1));
    let idx = truncInt(pos);
    if (idx < 0) {
        idx = 0;
    }
    if (idx > SPLINE_TBL_SIZE - 2) {
        idx = SPLINE_TBL_SIZE - 2;
    }
    const frac = fr(pos - idx);
    const table = v.formant_tbl[formant];
    return fr(fr(table[idx] * fr(1.0 - frac)) + fr(table[idx + 1] * frac));
}

function grainPeriod(v, midi_note) {
    const internal = fr(clampf(midi_note, 0.0, 150.0) - 12.0);
    const table_idx = truncInt(fr(internal * 32.0));
    const freq = fr(fr(Math.pow(2.0, fr(table_idx / 384.0))) * PITCH_TABLE_BASE);
    const period = fr(v.sample_rate / freq);
    if (period >= 1.0) {
        return period;
    }
    return 1.0;
}

function applyPortamento(v) {
    if (v.min_glide > fr(0.001)) {
        v.ramp_counter = v.ramp_counter - 1;
        if (v.ramp_counter > 0) {
            return;
        }
        v.ramp_counter = v.ramp_period;
        if (v.pitch_ramp_ticks > 0) {
            v.pitch_ramp_ticks = v.pitch_ramp_ticks - 1;
            v.current_pitch = fr(v.current_pitch + v.pitch_step);
            if (v.pitch_ramp_ticks === 0) {
                v.current_pitch = v.target_pitch;
            }
        }
        if (v.vowel_ramp_ticks > 0) {
            v.vowel_ramp_ticks = v.vowel_ramp_ticks - 1;
            v.current_vowel = fr(v.current_vowel + v.vowel_step);
            if (v.vowel_ramp_ticks === 0) {
                v.current_vowel = v.target_vowel;
            }
        }
    } else if (v.glide_param > fr(0.001)) {
        const diff = fr(v.target_pitch - v.current_pitch);
        const rate = fr(12.0 / fr(fr(v.glide_param + fr(0.01)) * v.sample_rate));
        if (diff > fr(0.2)) {
            v.current_pitch = fr(v.current_pitch + rate);
        } else if (diff < fr(-0.2)) {
            v.current_pitch = fr(v.current_pitch - rate);
        } else {
            v.current_pitch = v.target_pitch;
        }
        v.current_vowel = v.target_vowel;
    } else {
        v.current_pitch = v.target_pitch;
        v.current_vowel = v.target_vowel;
    }
}

function computeVibrato(v) {
    const rate_scale = fr(Math.pow(4.0, fr(fr(v.vibrato_rate * 2.0) - 1.0)));
    const rate = fr(fr(fr(fr(v.vibrato_depth * fr(0.2)) + 1.0) * v.random_jitter) * rate_scale);
    v.vibrato_phase = fr(v.vibrato_phase + fr(rate / v.sr_per_vib_tbl));
    if (!(v.vibrato_phase < SINE_TBL_SIZE)) {
        v.vibrato_phase = fr(v.vibrato_phase % SINE_TBL_SIZE);
        if (!(v.vibrato_phase >= 0.0)) {
            v.vibrato_phase = 0.0;
        }
    }
    v.jitter_counter = v.jitter_counter + 1;
    if (v.jitter_counter >= v.jitter_period) {
        v.jitter_counter = 0;
        v.random_jitter = fr(fr(nextRand(v) * 2.0) + 5.0);
    }
    const idx = truncInt(v.vibrato_phase) % SINE_TBL_SIZE;
    return fr(fr(v.vibrato_depth + fr(0.2)) * v.sine_tbl[idx]);
}

function computeGrain(v) {
    const n = v.grain_len;
    const formant_scale = fr(fr(v.current_voice * 0.5) + fr(0.75));
    const sr = v.sample_rate;
    const formants = [0.0, 0.0, 0.0];
    for (let f = 0; f < CLASSIC_NUM_FORMANTS; f = f + 1) {
        formants[f] = fr(lookupFormant(v, f, v.current_vowel) * formant_scale);
    }
    const decay_len = n * 4;
    const bw0 = fr(CLASSIC_FORMANT_BW[0]);
    const bw1 = fr(CLASSIC_FORMANT_BW[1]);
    const bw2 = fr(CLASSIC_FORMANT_BW[2]);
    const bws = [bw0, bw1, bw2];
    for (let i = 0; i < n; i = i + 1) {
        const t = fr(i / sr);
        let sample = 0.0;
        for (let f = 0; f < CLASSIC_NUM_FORMANTS; f = f + 1) {
            const phase = fr(fr(TAU * formants[f]) * t);
            const sine_idx = (truncInt(fr(fr(phase / TAU) * SINE_TBL_SIZE)) >>> 0) % SINE_TBL_SIZE;
            const sine = v.sine_tbl[sine_idx];
            const decay_idx = truncInt(fr(fr(bws[f] * i) / 50.0));
            let decay = 0.0;
            if (decay_idx < decay_len) {
                decay = v.exp_decay[decay_idx];
            }
            sample = fr(sample + fr(sine * decay));
        }
        sample = fr(sample + fr(v.aspiration[i] * v.aspiration_amp));
        v.grain[i] = fr(sample * v.cos_window[i]);
    }
    v.grain_dirty = false;
}

function overlapAdd(v) {
    v.overlap_write_pos = (v.overlap_write_pos + v.overlap_offset) % OVERLAP_BUF_SIZE;
    const start = v.overlap_write_pos;
    for (let i = 0; i < v.grain_len; i = i + 1) {
        const pos = (start + i) % OVERLAP_BUF_SIZE;
        v.overlap_buf[pos] = v.overlap_buf[pos] + v.grain[i];
    }
}

function grainLenFor(sample_rate) {
    const len = truncInt(fr(sample_rate * GRAIN_DURATION));
    if (len > MAX_GRAIN) {
        return MAX_GRAIN;
    }
    return len;
}

function voiceInit(v, sample_rate) {
    sample_rate = sanitizeSampleRate(sample_rate);
    v.sample_rate = sample_rate;
    v.current_pitch = classicHzToNote(220.0);
    v.target_pitch = classicHzToNote(220.0);
    v.random_jitter = 4.0;
    v.jitter_period = 4586;
    v.sr_per_vib_tbl = fr(sample_rate / SINE_TBL_SIZE);
    v.rng_state = 12345;
    v.grain_len = grainLenFor(sample_rate);
    v.ramp_period = truncInt(fr(sample_rate * fr(0.01)));
    v.ramp_counter = v.ramp_period;
    v.current_vowel = 0.5;
    v.target_vowel = 0.5;
    v.current_voice = 0.5;
    v.vibrato_rate = 0.5;
    v.aspiration_amp = ASPIRATION_AMP_DEFAULT;
    v.grain_dirty = true;
    v.env_stage = ENV_IDLE;
    v.env_level = 0.0;
    v.env_attack = 0.0;
    v.env_decay = 0.0;
    v.env_sustain = 1.0;
    v.env_release = 0.0;
    buildSineTable(v);
    buildFormantTables(v);
    buildWindowAndDecay(v);
    buildAspiration(v);
}

function voiceHasEnvelope(v) {
    return v.env_attack > 0.0 || v.env_decay > 0.0 || v.env_sustain < 1.0 || v.env_release > 0.0;
}

function voiceNoteOn(v, pitch_hz) {
    const was_active = v.active;
    v.active = true;
    v.target_pitch = classicHzToNote(clampf(pitch_hz, MIN_PITCH_HZ, MAX_PITCH_HZ));
    if (!was_active) {
        v.current_pitch = v.target_pitch;
        v.grain_dirty = true;
        v.overlap_write_pos = v.overlap_read_pos;
        v.overlap_offset = 0;
    }
    if (voiceHasEnvelope(v)) {
        v.env_stage = ENV_ATTACK;
    } else {
        v.env_level = 1.0;
        v.env_stage = ENV_SUSTAIN;
    }
}

function voiceNoteOff(v) {
    if (voiceHasEnvelope(v)) {
        v.env_stage = ENV_RELEASE;
    } else {
        v.active = false;
        v.env_stage = ENV_IDLE;
        v.env_level = 0.0;
    }
}

function voiceIsActive(v) {
    return v.active || v.env_stage === ENV_RELEASE;
}

function voiceSetPitchDirect(v, hz) {
    const note = classicHzToNote(clampf(hz, MIN_PITCH_HZ, MAX_PITCH_HZ));
    v.target_pitch = note;
    v.current_pitch = note;
}

function effectiveGlide(v) {
    if (v.glide_param > v.min_glide) {
        return v.glide_param;
    }
    return v.min_glide;
}

function rampTicksFor(eff) {
    let n = RAMP_TICKS;
    if (eff > 0.5) {
        n = RAMP_TICKS + truncInt(fr(fr(eff - 0.5) * 180.0));
    }
    return n;
}

function voiceSetPitchTarget(v, hz) {
    const new_target = classicHzToNote(clampf(hz, MIN_PITCH_HZ, MAX_PITCH_HZ));
    const eff = effectiveGlide(v);
    if (eff < fr(0.001)) {
        v.current_pitch = new_target;
        v.pitch_ramp_ticks = 0;
    } else {
        const n = rampTicksFor(eff);
        v.pitch_step = fr(fr(new_target - v.current_pitch) / n);
        v.pitch_ramp_ticks = n;
    }
    v.target_pitch = new_target;
}

function voiceSetVowel(v, vowel) {
    const new_target = fr(clampf(vowel, 0.0, 1.0));
    const eff = effectiveGlide(v);
    if (eff < fr(0.001)) {
        v.current_vowel = new_target;
        v.vowel_ramp_ticks = 0;
    } else {
        const n = rampTicksFor(eff);
        v.vowel_step = fr(fr(new_target - v.current_vowel) / n);
        v.vowel_ramp_ticks = n;
    }
    v.target_vowel = new_target;
}

function voiceAmplitude(v) {
    const internal = fr(v.current_pitch - 12.0);
    return clampf(fr(fr(internal * fr(-1.0 / 72.0)) + 2.0), fr(0.1), 3.0);
}

function voiceProcess(v, output, n) {
    const has_envelope = voiceHasEnvelope(v) || v.env_stage === ENV_RELEASE;
    for (let i = 0; i < n; i = i + 1) {
        if (v.active || v.env_stage === ENV_RELEASE) {
            applyPortamento(v);
            const vib = computeVibrato(v);
            const pitch = fr(fr(v.current_pitch + v.pitch_bend_offset) + vib);
            const period = truncInt(grainPeriod(v, pitch));
            if (v.overlap_offset >= period || v.grain_dirty) {
                computeGrain(v);
                overlapAdd(v);
                v.overlap_offset = 0;
            }
        }
        v.overlap_offset = v.overlap_offset + 1;
    }
    while (v.overlap_read_pos >= OVERLAP_BUF_SIZE) {
        v.overlap_read_pos = v.overlap_read_pos - OVERLAP_BUF_SIZE;
    }
    for (let i = 0; i < n; i = i + 1) {
        let sample = v.overlap_buf[v.overlap_read_pos];
        v.overlap_buf[v.overlap_read_pos] = 0.0;
        v.overlap_read_pos = (v.overlap_read_pos + 1) % OVERLAP_BUF_SIZE;
        if (has_envelope) {
            sample = fr(sample * envTick(v));
        }
        output[i] = sample;
    }
}

// ---------------------------------------------------------------- delay

function makeDelay() {
    return {
        buffer_l: new Float32Array(DELAY_LINE_SIZE),
        buffer_r: new Float32Array(DELAY_LINE_SIZE),
        write_pos: 0,
        target_delay_l: 0.0,
        target_delay_r: 0.0,
        current_delay_l: 0.0,
        current_delay_r: 0.0,
        smooth_coeff: 0.0,
        sample_rate: 44100.0,
        rate: 0.5,
        feedback: 0.5,
        mix: 0.5
    };
}

function delayRecalcTaps(d) {
    const scale = fr(d.sample_rate / 44100.0);
    const rate_scale = fr(fr(0.1) + fr(d.rate * fr(1.9)));
    let delay_l = fr(fr(DELAY_TIME_L_44100 * scale) * rate_scale);
    let delay_r = fr(fr(DELAY_TIME_R_44100 * scale) * rate_scale);
    if (delay_l >= DELAY_LINE_SIZE) {
        delay_l = DELAY_LINE_SIZE - 1;
    }
    if (delay_r >= DELAY_LINE_SIZE) {
        delay_r = DELAY_LINE_SIZE - 1;
    }
    d.target_delay_l = delay_l;
    d.target_delay_r = delay_r;
}

function delayInit(d, sample_rate) {
    sample_rate = sanitizeSampleRate(sample_rate);
    d.buffer_l.fill(0.0);
    d.buffer_r.fill(0.0);
    d.write_pos = 0;
    d.sample_rate = sample_rate;
    d.smooth_coeff = fr(1.0 / fr(fr(0.05) * sample_rate));
    d.rate = 0.5;
    d.feedback = 0.5;
    d.mix = 0.5;
    delayRecalcTaps(d);
    d.current_delay_l = d.target_delay_l;
    d.current_delay_r = d.target_delay_r;
}

function delayReadTap(buffer, write_pos, current_delay) {
    const rd = fr(write_pos - current_delay);
    let idx = Math.floor(rd);
    const frac = fr(rd - idx);
    idx = ((idx % DELAY_LINE_SIZE) + DELAY_LINE_SIZE) % DELAY_LINE_SIZE;
    return fr(fr(buffer[idx] * fr(1.0 - frac)) + fr(buffer[(idx + 1) % DELAY_LINE_SIZE] * frac));
}

function delayProcess(d, mono_in, out_l, out_r, n) {
    const coeff = d.smooth_coeff;
    for (let i = 0; i < n; i = i + 1) {
        const input = mono_in[i];
        d.current_delay_l = fr(d.current_delay_l + fr(coeff * fr(d.target_delay_l - d.current_delay_l)));
        d.current_delay_r = fr(d.current_delay_r + fr(coeff * fr(d.target_delay_r - d.current_delay_r)));
        const tap_l = delayReadTap(d.buffer_l, d.write_pos, d.current_delay_l);
        const tap_r = delayReadTap(d.buffer_r, d.write_pos, d.current_delay_r);
        d.buffer_l[d.write_pos] = fr(fr(fr(tap_l * d.feedback) + input) * d.mix);
        d.buffer_r[d.write_pos] = fr(fr(fr(tap_r * d.feedback) + input) * d.mix);
        out_l[i] = fr(input + tap_l);
        out_r[i] = fr(input + tap_r);
        d.write_pos = (d.write_pos + 1) % DELAY_LINE_SIZE;
    }
}

// ---------------------------------------------------------------- synth

function gainSmoothingCoeff(sample_rate) {
    if (sample_rate <= 0.0) {
        return 1.0;
    }
    return fr(1.0 - fr(Math.exp(fr(-1.0 / fr(fr(0.005) * sample_rate)))));
}

function clamp01(x) {
    return clampf(x, 0.0, 1.0);
}

function detunedHz(base_hz, detune_cents, voice_idx, voice_count) {
    if (voice_count <= 1) {
        return base_hz;
    }
    const offset = fr(detune_cents * fr(fr(fr(voice_idx / (voice_count - 1)) * 2.0) - 1.0));
    return fr(base_hz * fr(Math.pow(2.0, fr(offset / 1200.0))));
}

export class ClassicMonk {
    constructor(sample_rate) {
        sample_rate = sanitizeSampleRate(sample_rate);
        this.voices = [];
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            const v = makeVoice();
            voiceInit(v, sample_rate);
            v.vibrato_phase = fr((SINE_TBL_SIZE * i) / CLASSIC_MAX_UNISON);
            v.rng_state = (12345 + i * 7919) >>> 0;
            this.voices.push(v);
        }
        this.unison_count = 1;
        this.unison_detune = 0.0;
        this.unison_voice_spread = 0.0;
        this.base_voice = 0.0;
        this.last_base_hz = 0.0;
        this.held_notes = [];
        this.current_voice_gain = 1.0;
        this.target_voice_gain = 1.0;
        this.current_out_gain = -1.0;
        this.gain_coeff = gainSmoothingCoeff(sample_rate);
        this.delay = makeDelay();
        delayInit(this.delay, sample_rate);
        this.cc_volume = fr(0.1);
        this.level = 1.0;
        this.scratch_mono = new Float32Array(MAX_BUF);
        this.scratch_voice = new Float32Array(MAX_BUF);
        this.scratch_l = new Float32Array(MAX_BUF);
        this.scratch_r = new Float32Array(MAX_BUF);
        this.setGlide(0.5);
        this.setVowel(0.5);
        this.setVoice(0.5);
        this.setDelayMix(0.8);
    }

    removeNote(note) {
        const kept = [];
        for (let i = 0; i < this.held_notes.length; i = i + 1) {
            if (this.held_notes[i] !== note) {
                kept.push(this.held_notes[i]);
            }
        }
        this.held_notes = kept;
    }

    applyVoiceSpread() {
        const n = this.unison_count;
        for (let i = 0; i < n; i = i + 1) {
            let offset = 0.0;
            if (n > 1) {
                offset = fr(this.unison_voice_spread * fr(fr(fr(i / (n - 1)) * 2.0) - 1.0));
            }
            this.voices[i].current_voice = clampf(clamp01(fr(this.base_voice + offset)), 0.0, 1.0);
        }
    }

    applyUnisonDetune(base_hz) {
        this.last_base_hz = base_hz;
        const n = this.unison_count;
        for (let i = 0; i < n; i = i + 1) {
            voiceNoteOn(this.voices[i], detunedHz(base_hz, this.unison_detune, i, n));
        }
    }

    noteOn(note) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].min_glide = 0.0;
        }
        this.removeNote(note);
        if (this.held_notes.length < MAX_NOTES) {
            this.held_notes.push(note);
        }
        this.applyUnisonDetune(classicMidiNoteToFreq(note));
    }

    noteOff(note) {
        this.removeNote(note);
        if (this.held_notes.length > 0) {
            const top = this.held_notes[this.held_notes.length - 1];
            this.applyUnisonDetune(classicMidiNoteToFreq(top));
        } else {
            for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
                voiceNoteOff(this.voices[i]);
            }
        }
    }

    // Pad pitch: 0..1 spans C3..C4 as in the original pad.
    padPitchHz(x) {
        return fr(fr(130.81) * fr(Math.pow(2.0, fr(x))));
    }

    setPitchHz(hz) {
        hz = fr(hz);
        this.last_base_hz = hz;
        if (!voiceIsActive(this.voices[0])) {
            this.applyUnisonDetune(hz);
        }
        const n = this.unison_count;
        for (let i = 0; i < n; i = i + 1) {
            this.voices[i].min_glide = XY_PAD_GLIDE;
            voiceSetPitchTarget(this.voices[i], detunedHz(hz, this.unison_detune, i, n));
        }
    }

    restoreNoteStack() {
        if (this.held_notes.length === 0) {
            return;
        }
        const top = this.held_notes[this.held_notes.length - 1];
        const hz = classicMidiNoteToFreq(top);
        this.last_base_hz = hz;
        const n = this.unison_count;
        for (let i = 0; i < n; i = i + 1) {
            this.voices[i].min_glide = 0.0;
            voiceSetPitchTarget(this.voices[i], detunedHz(hz, this.unison_detune, i, n));
        }
    }

    setVowel(x) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            voiceSetVowel(this.voices[i], fr(x));
        }
    }

    setVoice(x) {
        this.base_voice = fr(x);
        this.applyVoiceSpread();
    }

    setGlide(x) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].glide_param = fr(clampf(x, 0.0, 1.0));
        }
    }

    setVibrato(x) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].vibrato_depth = fr(clampf(x, 0.0, 1.0));
        }
    }

    setVibratoRate(x) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].vibrato_rate = fr(clampf(x, 0.0, 1.0));
        }
    }

    setPitchBend(semitones) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].pitch_bend_offset = fr(clampf(semitones, -12.0, 12.0));
        }
    }

    setAspiration(x) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].aspiration_amp = fr(clampf(x, 0.0, 1.0));
        }
    }

    setAttack(seconds) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].env_attack = fr(seconds);
        }
    }

    setDecay(seconds) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].env_decay = fr(seconds);
        }
    }

    setSustain(level) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].env_sustain = fr(clampf(level, 0.0, 1.0));
        }
    }

    setRelease(seconds) {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            this.voices[i].env_release = fr(seconds);
        }
    }

    setUnison(count) {
        if (count < 1) {
            count = 1;
        }
        if (count > CLASSIC_MAX_UNISON) {
            count = CLASSIC_MAX_UNISON;
        }
        const old_count = this.unison_count;
        this.unison_count = count;
        this.target_voice_gain = fr(1.0 / fr(Math.sqrt(count)));
        if (old_count === count) {
            return;
        }
        if (!voiceIsActive(this.voices[0])) {
            return;
        }
        const base_hz = this.last_base_hz;
        for (let i = count; i < old_count; i = i + 1) {
            this.voices[i].env_stage = ENV_RELEASE;
        }
        for (let i = 0; i < count && i < old_count; i = i + 1) {
            voiceSetPitchDirect(this.voices[i], detunedHz(base_hz, this.unison_detune, i, count));
        }
        for (let i = old_count; i < count; i = i + 1) {
            voiceNoteOn(this.voices[i], detunedHz(base_hz, this.unison_detune, i, count));
        }
        this.applyVoiceSpread();
    }

    setUnisonDetune(cents) {
        this.unison_detune = fr(cents);
        if (voiceIsActive(this.voices[0]) && this.unison_count > 1) {
            const n = this.unison_count;
            for (let i = 0; i < n; i = i + 1) {
                voiceSetPitchDirect(this.voices[i], detunedHz(this.last_base_hz, this.unison_detune, i, n));
            }
        }
    }

    setUnisonVoiceSpread(spread) {
        this.unison_voice_spread = fr(spread);
        this.applyVoiceSpread();
    }

    setDelayMix(x) {
        this.delay.mix = fr(clampf(x, 0.0, 1.0));
    }

    setDelayRate(x) {
        this.delay.rate = fr(clampf(x, 0.0, 1.0));
        delayRecalcTaps(this.delay);
    }

    setVolume(x) {
        this.cc_volume = fr(clamp01(x));
    }

    setLevel(x) {
        this.level = fr(clamp01(x));
    }

    midiCC(cc, value) {
        if (cc === 1) {
            this.setVibrato(value);
        } else if (cc === 5) {
            this.setGlide(value);
        } else if (cc === 7) {
            this.cc_volume = fr(fr(fr(value * 127.0) * fr(0.001)));
        } else if (cc === 12) {
            this.setDelayMix(value);
        } else if (cc === 13) {
            this.setVoice(value);
        }
    }

    currentVowel() {
        return this.voices[0].current_vowel;
    }

    currentPitchNormalized() {
        const norm = (this.voices[0].current_pitch - 48.0) / 12.0;
        return clampf(norm, 0.0, 1.0);
    }

    isActive() {
        for (let i = 0; i < CLASSIC_MAX_UNISON; i = i + 1) {
            if (voiceIsActive(this.voices[i])) {
                return true;
            }
        }
        return false;
    }

    processChunk(out_l, out_r, offset, n) {
        const mono = this.scratch_mono;
        const voice_buf = this.scratch_voice;
        mono.fill(0.0, 0, n);
        for (let vi = 0; vi < CLASSIC_MAX_UNISON; vi = vi + 1) {
            if (vi >= this.unison_count && !voiceIsActive(this.voices[vi])) {
                continue;
            }
            voice_buf.fill(0.0, 0, n);
            voiceProcess(this.voices[vi], voice_buf, n);
            for (let i = 0; i < n; i = i + 1) {
                mono[i] = fr(mono[i] + voice_buf[i]);
            }
        }
        const k = this.gain_coeff;
        for (let i = 0; i < n; i = i + 1) {
            this.current_voice_gain = fr(this.current_voice_gain + fr(k * fr(this.target_voice_gain - this.current_voice_gain)));
            mono[i] = fr(mono[i] * this.current_voice_gain);
        }
        delayProcess(this.delay, mono, this.scratch_l, this.scratch_r, n);
        const target_gain = fr(fr(voiceAmplitude(this.voices[0]) * this.cc_volume) * this.level);
        if (this.current_out_gain < 0.0) {
            this.current_out_gain = target_gain;
        }
        for (let i = 0; i < n; i = i + 1) {
            this.current_out_gain = fr(this.current_out_gain + fr(k * fr(target_gain - this.current_out_gain)));
            out_l[offset + i] = fr(this.scratch_l[i] * this.current_out_gain);
            out_r[offset + i] = fr(this.scratch_r[i] * this.current_out_gain);
        }
    }

    process(out_l, out_r, num_samples) {
        let offset = 0;
        while (num_samples > 0) {
            let n = num_samples;
            if (n > MAX_BUF) {
                n = MAX_BUF;
            }
            this.processChunk(out_l, out_r, offset, n);
            offset = offset + n;
            num_samples = num_samples - n;
        }
    }
}
