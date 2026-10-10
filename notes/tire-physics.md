# Tire physics: consistency fixes and compliant carcass experiment

## Outcome

The default tire now uses a consistent combined-slip force and wheel-spin solve. Peak and sliding friction share the same load correction. The softer radial carcass with reinforced sidewalls is available as an explicit experiment, not enabled by default: it improves several contact and impact metrics, but does not reliably prevent overturning.

## Confirmed defects

1. The old wheel solver calculated angular acceleration with the unsaturated longitudinal force, then clipped the chassis force to the combined-slip friction budget. A flat Titan test at 10 m/s forward speed and 2–5 m/s sideways speed found roughly 1,300–1,700 N m of unexplained wheel torque per wheel. A regression test failed before the change and passes afterward. `stepWheel` solves `I Δω = Δt (motor torque − radius × Fx − rolling resistance)` using the final combined-slip `Fx`.
2. Load sensitivity reduced peak friction but did not reduce sliding friction. An overloaded tire could gain friction after passing the nominal peak. Both coefficients now share the same correction, with sliding friction bounded by peak friction.
3. Traction control reduced torque even when that torque opposed existing wheelspin. It now only trims torque that drives the slip further, and recomputes spin and tire force after the torque change. Integral anti-windup uses the actual final torque.
4. A steep edge's reduced tread purchase affected the chassis force after the old spin calculation. Its load-weighted grip factor now also participates in the wheel solve.

## Experimental normal compliance

Select **Options → Tyres → Softer tires, firm sidewalls (experimental)**, or add `tires=compliant` to the drive URL. Omit that parameter for standard tires. Switching the tire setup starts with a new vehicle instance so previous tire and suspension integrators do not contaminate the comparison. Pressure remains independently adjustable with T.

The experiment uses:

- Lower radial stiffness, interpolated from 110 to 320 kN/m over 0.8–2.5 bar, with progressive compression above small deflections.
- A separate 620 kN/m sidewall stiffness, blended by the squared normal component along the wheel axle. This is side-contact reinforcement; it is not a complete lateral carcass deformation model. Cornering stiffness and the existing slip law are retained.
- Damping based on tire stiffness and the 820 kg unsprung mass, rather than reducing tire damping with gravity while retaining the same carcass stiffness.
- A continuous rim-cushion engagement and contact-local spring/damper terms in the unsprung integration.

These are concept-model parameters, not measurements from a manufactured tire. Standard normal stiffness and damping are preserved for the comparison. World gravity, steering limits, vehicle geometry, and the suspension's stabilization policy are unchanged.

## Reproduction

No package installation is required. From the repository root:

```sh
node --test tests/spider-tires.test.mjs
node tests/tire-study.mjs - standard
node tests/tire-study.mjs - compliant
```

The study also accepts a physics module path in place of `-`. Remote M4 commands are in `AGENTS.md`.

The 19 automated tests cover friction/load invariants, contact dissipation, torque bounds and wheel angular impulse at three time steps, loss of grip, braking recovery, normal compliance, rim engagement, and settling/driving/turning/stopping/reversing with both setups in all four gravities. GitHub Actions runs this suite for Spider changes.

The study below comprises 20 scenarios per setup at 240 Hz physics / 60 Hz control: a 0.6 m level drop, asymmetric 0.18 m corrugations, a 0.65 m one-sided bump, and two side landings released at 35° tilt with 0.6 or 1.0 rad/s outward roll rate. Moving tests start at 30 km/h; normal driver assists remain active, so speed can change. Each run settles for 6 s, then measures 12 s. Both setups include the consistency fixes; this comparison isolates the carcass experiment. Surfaces are fixed test surfaces per world, not a replay of the user's route.

Peak acceleration is sampled upward chassis acceleration in m/s². Air time is the sum of unloaded time over all six tires (wheel-seconds), sampled at 60 Hz; it is not time with the whole vehicle airborne. Tilt is the angle between chassis up and world up. These are discrete scenario measurements, not continuous worst-case bounds.

| World | Scenario | Peak tilt ° standard → soft | Peak upward acceleration standard → soft | Air wheel-seconds standard → soft | Overturned standard → soft |
|---|---|---:|---:|---:|---|
| earth | drop | 0.00 → 0.00 | 11.55 → 12.34 | 1.30 → 1.20 | False → False |
| earth | corrugation | 0.28 → 0.24 | 2.78 → 1.84 | 0.00 → 0.00 | False → False |
| earth | one-sided-bump | 2.08 → 2.30 | 10.82 → 12.31 | 1.63 → 1.27 | False → False |
| earth | side-landing | 41.05 → 41.00 | 51.58 → 60.12 | 5.80 → 6.22 | False → False |
| earth | side-landing-hard | 45.30 → 45.16 | 52.50 → 55.15 | 8.22 → 9.32 | False → False |
| moon | drop | 0.01 → 0.01 | 1.54 → 0.90 | 3.20 → 3.10 | False → False |
| moon | corrugation | 1.52 → 2.97 | 0.85 → 0.62 | 25.17 → 21.45 | False → False |
| moon | one-sided-bump | 5.30 → 5.35 | 2.74 → 2.10 | 11.82 → 10.37 | False → False |
| moon | side-landing | 49.83 → 50.59 | 10.77 → 9.46 | 23.25 → 22.63 | False → False |
| moon | side-landing-hard | 94.76 → 94.90 | 43.51 → 34.75 | 41.40 → 41.50 | True → True |
| mars | drop | 0.00 → 0.00 | 3.16 → 3.11 | 2.10 → 2.00 | False → False |
| mars | corrugation | 2.72 → 1.85 | 1.26 → 0.72 | 16.37 → 6.78 | False → False |
| mars | one-sided-bump | 3.01 → 2.63 | 2.43 → 2.00 | 1.83 → 1.32 | False → False |
| mars | side-landing | 45.76 → 45.45 | 30.18 → 18.28 | 14.02 → 11.42 | False → False |
| mars | side-landing-hard | 90.64 → 91.29 | 20.77 → 19.79 | 39.65 → 40.42 | True → True |
| titan | drop | 0.01 → 0.03 | 0.70 → 0.60 | 3.50 → 3.43 | False → False |
| titan | corrugation | 4.19 → 5.22 | 0.84 → 0.58 | 28.72 → 24.27 | False → False |
| titan | one-sided-bump | 6.33 → 6.22 | 2.19 → 1.57 | 12.30 → 10.25 | False → False |
| titan | side-landing | 53.45 → 53.25 | 8.44 → 6.68 | 25.23 → 23.10 | False → False |
| titan | side-landing-hard | 101.06 → 101.11 | 46.14 → 28.49 | 45.00 → 45.00 | True → True |

## What this establishes—and what remains

The compliant tire improves contact time on many rough-ground cases and reduces several off-world impact peaks. It does not substantially move the side-landing rollover threshold: the severe Moon, Mars, and Titan cases still overturn with both setups. Some Earth impacts become worse and some low-gravity peak tilts increase despite improved contact time. Therefore the experiment is not the default and is not described as a rollover guard.

A future stability change needs to measure roll angular energy, the remaining support polygon, and suspension/ride-height authority before the center of mass passes the tipping boundary. The current 6-DOF model still uses approximate contact patches, an instantaneous slip-force law, and simplified carcass/rolling-resistance dynamics; these changes do not establish full-system energy or angular-momentum conservation. Finite-width terrain contact, lateral carcass relaxation, steering-plate motion in contact-point velocity, and full wheel/chassis angular-momentum coupling remain separate audit targets.

For comparison with established tire-model structure, MathWorks' [Combined Slip Wheel 2DOF documentation](https://www.mathworks.com/help/vdynblks/ref/combinedslipwheel2dof.html) separately accounts for wheel rotation, tire forces, drive/brake torque and rolling resistance. This project retains its lightweight existing force curve; it does not implement or claim calibration to Magic Formula 6.2.
