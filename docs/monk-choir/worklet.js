// AudioWorklet host for both engines. Messages from the page drive notes,
// the pad and parameters; telemetry (mouth shapes, pitches, resonances) is
// posted back for the drawing.

import { ClassicMonk } from "./engine/classic.js?v=a0051c9211";
import { Choir } from "./engine/choir.js?v=1a24f9b503";
import { SongEngine, ROLMO } from "./engine/song.js?v=e324200d9e";
import { FUGUE } from "./engine/songs/fugue.js?v=779c031a57";
import { PASSACAGLIA } from "./engine/songs/passacaglia.js?v=d21e508928";
import { HdrStage } from "./engine/hdrstage.js?v=ba03f1cb2b";
import { makeRoom, defaultRoomSettings } from "./engine/room.js?v=8963a58369";

const SONGS = { rolmo: ROLMO, fugue: FUGUE, passacaglia: PASSACAGLIA };

class MonkProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.classic = new ClassicMonk(sampleRate);
        this.choir = new Choir(sampleRate);
        this.mode = "classic";
        this.song = null;
        this.songId = "";
        this.hdr = null;
        this.classicBufL = new Float32Array(128);
        this.classicBufR = new Float32Array(128);
        this.frames = 0;
        this.roomSettings = defaultRoomSettings();
        this.choir.setRoom(makeRoom(sampleRate, this.roomSettings));
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
        } else if (m.type === "room") {
            this.roomSettings = m.settings;
            this.choir.setRoom(makeRoom(sampleRate, m.settings));
            if (this.hdr !== null) {
                this.hdr.setRoom(makeRoom(sampleRate, m.settings));
            }
            if (this.song !== null) {
                this.song.setRoom(makeRoom(sampleRate, m.settings));
            }
        } else if (m.type === "songLoad") {
            if (this.song === null || this.songId !== m.id) {
                if (this.song !== null) {
                    this.song.stop();
                }
                this.song = new SongEngine(sampleRate, SONGS[m.id]);
                this.song.setRoom(makeRoom(sampleRate, this.roomSettings));
                this.song.warmUp();
                this.songId = m.id;
            } else {
                this.song.stop();
            }
            this.port.postMessage({ type: "songReady", id: m.id });
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
            } else if (this.mode === "hdr") {
                this.hdrStage().noteOn(m.note);
            } else {
                this.choir.noteOn(m.note, m.velocity);
            }
        } else if (m.type === "noteOff") {
            if (this.mode === "classic") {
                this.classic.noteOff(m.note);
            } else if (this.mode === "hdr") {
                this.hdrStage().noteOff(m.note);
            } else {
                this.choir.noteOff(m.note);
            }
        } else if (m.type === "hdrConfig") {
            this.hdrStage().configure(m.voiceType, m.register);
        } else if (m.type === "hdrSet") {
            this.hdrStage().set(m.name, m.value);
        } else if (m.type === "hdrPad") {
            this.hdrStage().pad(m.note, m.vowel, m.down);
        } else if (m.type === "allOff") {
            this.classic.held_notes = [];
            this.classic.noteOff(-1);
            this.choir.allNotesOff();
            if (this.hdr !== null) {
                this.hdr.allOff();
            }
        } else if (m.type === "classicPad") {
            this.receiveClassicPad(m);
        } else if (m.type === "classicParam") {
            this.receiveClassicParam(m.name, m.value);
        } else if (m.type === "choirConfig") {
            this.choir.configure(m.config);
        } else if (m.type === "singerSet") {
            this.choir.setSinger(m.index, m.field, m.value);
        } else if (m.type === "choirGlobal") {
            this.choir.setGlobal(m.name, m.value);
        } else if (m.type === "choirPad") {
            this.choir.pad(m.note, m.down);
        }
    }

    hdrStage() {
        if (this.hdr === null) {
            this.hdr = new HdrStage(sampleRate);
            this.hdr.setRoom(makeRoom(sampleRate, this.roomSettings));
        }
        return this.hdr;
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
        } else if (this.mode === "hdr") {
            this.hdrStage().process(l, r, n);
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
            if (this.mode === "hdr") {
                const t = this.hdrStage().telemetry();
                t.type = "telemetry";
                t.mode = "hdr";
                this.port.postMessage(t);
            } else if (this.mode === "song") {
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
