# Earth engine: Deeper throat

The selected second-round audition is now the Earth engine voice. The engine bus has a +4 dB gain increase. Music, hydraulics, road and electric-drive gains are unchanged; the existing master volume and limiter remain in control of the final mix.

The V8 keeps its rounded, unequal-bank firing cycle. The supporting tone follows half the total firing rate, emphasizing the bank cadence. A 76 Hz body resonance, softer exhaust filtering, lower injector band, and load-dependent rumble/roar reproduce the approved treatment. Muffled intake noise and cooling airflow accompany a quieter turbo tone, with a 1.7-second boost rise and 1.1-second decay. A 5 Hz high-pass removes DC from the asymmetric saturated waveform before the limiter and cabin feed.

The sound-design RPM mapping preserves the selected audition's low register: simulation idle at 550 maps to 500 audible rpm, and 1900 maps to 1250. Cranking and run-down map continuously to zero; above 1900 the sound stays at 1250. This is an artistic pitch mapping, not an engine model change. The HUD still reports simulation RPM, and engine power, pump delivery and vehicle performance are unchanged.

All combustion, intake, cooling and turbo layers fade out when the engine is off or stalled, and are silent on the Moon, Mars and Titan. Cabin filtering receives the same raised, DC-filtered engine bus.

Validation: serve the repository root with `python3 -m http.server 8767 --bind 127.0.0.1`, then open `/tests/spider-audio.html` and run the checks. These render the production Sound graph with native OfflineAudioContext at 44.1 and 48 kHz. They check the 4 dB gain difference, idle/load/top-speed signal headroom through the limiter, finite output/DC offset, shutdown silence and absence of diesel leakage in all electric worlds. No audio plays during the checks.
