# Spider tire physics

- This repository publishes `docs/` from `main` through GitHub Pages. Runtime changes belong in `docs/spider-drive/drive/`.
- Keep the local checkout authoritative. Do not edit the M4 build mirror.
- Fast physics checks: `node --test tests/spider-tires.test.mjs`.
- Run the full physics suite on the nearby M4 Mini from this repository:
  `/Users/ultimussecundai/.local/bin/m4build -- /opt/homebrew/bin/node --test tests/spider-tires.test.mjs`
- Measure standard tires with `/Users/ultimussecundai/.local/bin/m4build -- /opt/homebrew/bin/node tests/tire-study.mjs - standard`; substitute `compliant` for the softer radial carcass experiment. Save returned measurements locally before another sync, which replaces the remote mirror.
- Physics uses metres, kilograms, seconds, a 240 Hz step and a 60 Hz controller. Preserve world gravity, steering limits, pressure modes, and existing vehicle geometry unless the task explicitly changes them.
- Tire checks should verify force bounds, energy dissipation, angular impulse balance, and vehicle behavior, rather than duplicating solver implementation details.
