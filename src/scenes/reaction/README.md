# Spherical reaction diffusion

Select **ReactionDiffusion** in the scene menu. The sphere starts with chemical
seeds; touch or drag to grow new patches. Desktop input works through the existing
sphere preview (`3`). A stationary finger keeps supplying chemicals, and up to
sixteen contacts can paint independently. Short taps survive until the next tick.

The socket UI exposes feed, kill, U/V diffusion, simulation speed, brush radius and
strength, an erase brush, hue, contrast, pause, reset and clear. Presets reseed the
sphere and restore the chemical rates; manual chemical changes select Custom.
Clear restores the uniform resting state, ready for drawing your own seeds.
Appearance controls and reset/clear also work while paused. Painting resumes when
unpaused, on the next touch update.

## Model on S²

We solve two scalar fields on the unit sphere, rather than solve for a manifold:

```text
∂U/∂t = Du ΔS² U − U V² + F (1 − U)
∂V/∂t = Dv ΔS² V + U V² − (F + k) V
```

These are the Gray–Scott equations: U replenishes at feed rate F, V catalyses the
conversion of U into more V, and V leaves at rate F + k. The uniform state
U = 1, V = 0 stays at rest until a finite disturbance seeds a reaction. Initial
patches are approximately U = 0.5, V = 0.25 with a small perturbation.

On a curved surface the diffusion operator is the **Laplace–Beltrami operator**.
In local coordinates with metric g it is

```text
Δg f = (1 / √det(g)) ∂i (√det(g) gij ∂j f)
```

Here gij denotes the inverse metric. In colatitude θ and longitude φ on a unit
sphere, the same operator is

```text
ΔS² f = (1 / sin θ) ∂θ (sin θ ∂θ f) + (1 / sin² θ) ∂φφ f
```

The shaders avoid this latitude/longitude chart and its singularities. At each
direction n they construct an orthonormal tangent frame (x, y), take eight equally
spaced unit tangents ej, and sample along great circles using the exponential map:

```text
Expn(h ej) = cos(h) n + sin(h) ej
ΔS² f(n) ≈ [Σj=1..8 f(Expn(h ej)) − 8 f(n)] / (2 h²)
h = π / (2 N), where N is the per-face resolution
```

This follows by Taylor expansion in geodesic normal coordinates: the first-order
terms cancel and Σ ej ejᵀ = 4 I. Curvature is represented by the spherical sample
locations. Bilinear interpolation of the stored field introduces additional
discretization error.

## Storage and integration

The implementation reuses `../fluid/shaders/sphere.glsl` and the fluid full-screen
and display vertex shaders. Two RGBA16F targets ping-pong U in red and V in green.
Six equiangular cube faces occupy a 3 × 2 atlas, each with two ghost texels per
edge. All texels, including gutters, are evaluated at spherical directions.
Directional sampling crosses faces and the poles without imposing a boundary.
The default 128 × 128 cells per face cost about 1.6 MiB for both textures.

The **UI diffusion values are scaled coefficients**: Du = diffusionU × h² and
Dv = diffusionV × h² in the PDE above. The shader therefore applies diffusionU
and diffusionV to `0.5 × neighbourSum − 4 × centre`. This keeps controls convenient
at this grid size. Increasing resolution makes patterns physically smaller at
the same settings; these are visual tuning values, not measured material constants.
The radius-10 display mesh does not change the unit-sphere simulation.

The scene advances at 60 Hz in `update`, converting renderer milliseconds to
seconds and limiting catch-up to two ticks. Simulation speed sets chemical time
per real second. Each tick subdivides that duration using forward Euler, bounded by

```text
Δt ≤ min(0.8, 0.9 / [4 max(diffusionU, diffusionV) + 1 + F + k])
```

The bound conservatively accounts for diffusion and reaction sinks for
concentrations in [0, 1]. Concentrations are also clamped to this interval. Raising
speed increases GPU pass count instead of taking unstable larger steps. Defaults
use nine passes per tick; the highest UI settings use at most twenty.

Touch strokes use angular distance to the shortest great-circle segment between
the previous tick's position and the latest event. Thus a drag bridges gaps between
samples, even across a face edge. Jumps above 0.6 radians start a new brush mark.
A smooth brush blends toward U = 0.35, V = 0.5 (or U = 1, V = 0 for erasing), with
exponential exposure measured in real seconds and split across chemical substeps.
No touch velocity is needed for this chemical source. Quick taps receive a minimum
0.05-second exposure. Reset, pause and scene exit discard pending input.

GPU work runs before cube-map capture. Passes preserve the renderer target, cube
face, mip level, viewport, scissor, auto-clear and XR settings. Resources are
created on entry and disposed on exit. Renderable half-float support is required;
the UI reports when it is missing.

## Accuracy and tuning

This is a visual approximation, not a conservative surface PDE solver. Atlas
interpolation, ghost cells and half-float quantization can introduce small edge
errors, anisotropy and numerical diffusion. Preset shapes are approximate and can
vary with the initial seeds. Some feed/kill combinations intentionally settle to
a uniform state; changing to a preset or adding seeds restarts exploration.

## References

- [John E. Pearson, *Complex Patterns in a Simple System* (1993), equation 2](https://arxiv.org/abs/patt-sol/9304003): Gray–Scott reaction terms and finite-amplitude seeding.
- [MIT CSAIL Gray–Scott project](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/): forward Euler and examples of feed/kill regimes, including spots and wandering bubbles.
- [Adler, Lashuk and MacLachlan, *Composite-Grid Multigrid for Diffusion on the Sphere*](https://www.math.mun.ca/~smaclachlan/research/sphere.pdf): PDEs using the spherical Laplace–Beltrami operator (section 3). The GPU stencil here is our approximation, rather than their finite-element method.
- [Alimisis et al., *Distributed Principal Component Analysis with Limited Communication*, appendix A](https://www.unige.ch/math/vandereycken/papers/published_Alimisis_DVA.pdf): sphere tangent spaces, great-circle exponential map and angular distance.

## Validation

```sh
npx tsc --noEmit
node scripts/reaction-webgl.test.mjs
```

The WebGL check uses installed Chrome or Edge (or `CHROME_BIN`), Vite and `ws`.
It runs the actual shaders without launching Neutralino or requiring touch
hardware. It checks the resting state, reaction kinetics, spherical diffusion,
touch strokes at faces/edges/poles, erase, pattern evolution, rendering, renderer
state restoration and disposal.
