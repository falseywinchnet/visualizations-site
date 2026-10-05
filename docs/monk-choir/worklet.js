// AudioWorklet host for both engines. Messages from the page drive notes,
// the pad and parameters; telemetry (mouth shapes, pitches, resonances) is
// posted back for the drawing.

import { ClassicMonk } from "./engine/classic.js";
import { Choir } from "./engine/choir.js";
import { SongEngine } from "./engine/song.js";

class MonkProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.classic = new ClassicMonk(sampleRate);
        this.choir = new Choir(sampleRate);
        this.mode = "classic";
        this.song = null;
        this.classicBufL = new Float32Array(128);
        this.classicBufR = new Float32Array(128);
        this.frames = 0;
        this.port.onmessage = this.receive.bind(this);
    }

    receive(event) {
        const m = event.data;
        if (m.type === "mode") {
            this.mode = m.mode;
            this.classic.noteOff(-1);
            this.choir.allNotesOff();
            if (this.song !== null) {
                this.song.stop();
            }
            if (m.mode === "song" && this.song === null) {
                this.song = new SongEngine(sampleRate);
                this.song.warmUp();
                this.port.postMessage({ type: "songReady" });
            }
        } else if (m.type === "songPlay") {
            if (this.song !== null) {
                if (this.song.ended) {
                    this.song.seek(0.0);
                    this.song.ended = false;
                }
                this.song.play();
            }
        } else if (m.type === "songStop") {
            if (this.song !== null) {
                this.song.stop();
            }
        } else if (m.type === "songSeek") {
            if (this.song !== null) {
                this.song.seek(m.time);
                this.song.ended = false;
            }
        } else if (m.type === "noteOn") {
            if (this.mode === "classic") {
                this.classic.noteOn(m.note);
            } else {
                this.choir.noteOn(m.note, m.velocity);
            }
        } else if (m.type === "noteOff") {
            if (this.mode === "classic") {
                this.classic.noteOff(m.note);
            } else {
                this.choir.noteOff(m.note);
            }
        } else if (m.type === "allOff") {
            this.classic.held_notes = [];
            this.classic.noteOff(-1);
            this.choir.allNotesOff();
        } else if (m.type === "classicPad") {
            this.receiveClassicPad(m);
        } else if (m.type === "classicParam") {
            this.receiveClassicParam(m.name, m.value);
        } else if (m.type === "choirConfig") {
            this.choir.configure(m.config);
        } else if (m.type === "choirGlobal") {
            this.choir.setGlobal(m.name, m.value);
        } else if (m.type === "choirPad") {
            this.choir.pad(m.note, m.down);
        }
    }

    receiveClassicPad(m) {
        const c = this.classic;
        if (m.phase === "down") {
            c.setPitchHz(c.padPitchHz(m.x));
            c.setVowel(m.y);
        } else if (m.phase === "move") {
            c.setPitchHz(c.padPitchHz(m.x));
            c.setVowel(m.y);
        } else if (m.phase === "up") {
            if (c.held_notes.length > 0) {
                c.restoreNoteStack();
            } else {
                c.noteOff(60);
            }
        }
    }

    receiveClassicParam(name, value) {
        const c = this.classic;
        if (name === "vowel") { c.setVowel(value); }
        else if (name === "voice") { c.setVoice(value); }
        else if (name === "glide") { c.setGlide(value); }
        else if (name === "vibrato") { c.setVibrato(value); }
        else if (name === "vibratoRate") { c.setVibratoRate(value); }
        else if (name === "bend") { c.setPitchBend(value); }
        else if (name === "delayMix") { c.setDelayMix(value); }
        else if (name === "delayRate") { c.setDelayRate(value); }
        else if (name === "unison") { c.setUnison(Math.round(value)); }
        else if (name === "detune") { c.setUnisonDetune(value); }
        else if (name === "spread") { c.setUnisonVoiceSpread(value); }
        else if (name === "aspiration") { c.setAspiration(value); }
        else if (name === "level") { c.setLevel(value); }
        else if (name === "volume") { c.setVolume(value); }
        else if (name === "attack") { c.setAttack(value); }
        else if (name === "release") { c.setRelease(value); }
    }

    process(inputs, outputs) {
        const out = outputs[0];
        const l = out[0];
        let r = l;
        if (out.length > 1) {
            r = out[1];
        }
        const n = l.length;
        if (this.mode === "classic") {
            this.classic.process(l, r, n);
        } else if (this.mode === "song") {
            if (this.song !== null) {
                this.song.process(l, r, n);
            } else {
                l.fill(0.0);
                r.fill(0.0);
            }
        } else {
            this.choir.process(l, r, n);
        }
        this.frames = this.frames + n;
        if (this.frames >= 1600) {
            this.frames = 0;
            if (this.mode === "song") {
                if (this.song !== null) {
                    const t = this.song.telemetry();
                    t.type = "telemetry";
                    t.mode = "song";
                    this.port.postMessage(t);
                }
            } else if (this.mode === "classic") {
                this.port.postMessage({
                    type: "telemetry", mode: "classic",
                    vowel: this.classic.currentVowel(),
                    pitch: this.classic.currentPitchNormalized(),
                    active: this.classic.isActive(),
                    amp: this.classic.current_out_gain
                });
            } else {
                this.port.postMessage({ type: "telemetry", mode: "choir", singers: this.choir.telemetry() });
            }
        }
        return true;
    }
}

registerProcessor("monk-processor", MonkProcessor);
