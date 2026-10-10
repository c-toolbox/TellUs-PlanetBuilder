# Spherical fluid experiment

Select **Fluid** in the scene menu. Drag to stir coloured ink; holding a finger
adds ink without repeatedly adding momentum. Up to sixteen touches have independent
colours. Desktop input uses the existing sphere preview (`3`), where dragging the
globe sends the same touch events as the display. Brush radius, stir strength,
swirl, colour fade, ambient flow, pause, reset, and clear are exposed in the socket UI.

The solver follows the advection / forces / pressure projection pipeline explored
in [Misaki Nakano's fluid-three](https://github.com/mnmxmx/fluid-three/tree/master)
(see [blog](https://mofu-dev.com/en/blog/stable-fluids/)), but does not reuse its
flat grid or boundary conditions.
It runs in `update`, before any scene or cube-map capture, so all three rendering modes
see the same simulation. Time is in seconds internally; the scene converts the
renderer's millisecond delta, advances at a fixed 60 Hz, and limits catch-up to
two steps per frame. Faster display refreshes do not increase numerical diffusion
or the number of simulation passes per second.

## Geometry and storage

The domain is the **unit sphere**. Velocity is an ambient 3D vector measured in
radians per second, constrained to the tangent plane by `v -= n * dot(n, v)`.
The display mesh's radius is only a rendering choice.

Six equiangular cube faces live in a 3 x 2 texture atlas. Velocity and pressure use
96 x 96 cells per face; dye uses 192 x 192. Every tile has two ghost texels on each
edge. Passes evaluate those texels at their actual spherical directions, and
sampling selects a face from the dominant component of the direction. Bilinear
sampling near an edge therefore reads nearby spherical values rather than an
unrelated atlas tile. There are no walls, latitude seams, or collapsed polar cells.

`shaders/sphere.glsl` contains the shared geometry:

- The exponential map takes a tangent displacement along a great circle.
- A midpoint backtrace finds the departure point for semi-Lagrangian advection.
- Shortest-arc parallel transport moves velocities between tangent planes.
- Central differences in an orthonormal tangent frame approximate surface
  divergence, curl, gradient, and the Laplace-Beltrami operator.

## Passes

1. Advect velocity, transport it to the arrival tangent plane, and damp it slightly.
2. Compute curl and add touch impulses, vorticity confinement, and optional ambient
   forcing. The latter is derived from a streamfunction: `n × grad(psi)`.
3. Recompute divergence, then perform 28 damped Jacobi pressure iterations.
4. Subtract the surface pressure gradient and enforce tangency again.
5. Advect dye with the projected velocity, apply exponential fading, and inject ink.

Pressure stores the **pressure impulse**, incorporating the timestep. Accordingly,
the Poisson right-hand side is `div(v)` and projection subtracts `grad(p)` without
an additional timestep multiplier. Pressure starts from zero each step to avoid
accumulating an arbitrary constant on the closed sphere.

Touch input accumulates great-circle angular displacements between events,
transporting any pending impulse into the newest tangent plane. Each accumulated
impulse is consumed once; stationary contacts continue supplying dye. Taps released
between frames remain queued for one simulation step. Invalid directions are
ignored and large hardware jumps are bounded.

## Accuracy and cost

This is a visual approximation, not a conservative fluid dynamics solver. The
interpolated geodesic stencil and finite pressure solve reduce divergence rather
than eliminate it exactly. Semi-Lagrangian interpolation introduces numerical
viscosity; there is no separate physical viscosity solve. Fine vortices are
reinforced artistically, velocities are capped at 3 rad/s, and RGB ink mixes
additively. Ghost-cell interpolation can leave small errors at cube edges.

Simulation textures use RGBA16F with linear filtering and no depth, mipmaps, or
colour-space conversion. A GPU supporting renderable half-float textures is
required; the scene reports missing support in its UI. Targets, geometry, and
materials are allocated on entry and disposed on exit. Offscreen passes restore
the renderer's target, cube face, mip level, viewport, scissor, and XR/clear settings.

The default grid takes about 6 MiB for the seven simulation textures. Lowering
the resolutions or pressure iteration count in `SphericalFluid.ts` reduces GPU cost.

## Validation

```sh
npx tsc --noEmit
node --test scripts/fluid.test.mjs
node scripts/fluid-webgl.test.mjs
```

The WebGL check uses an installed Chromium browser (or `CHROME_BIN`) in headless
mode and the existing Vite dependency. It compiles and exercises the actual shaders,
checks pressure correction, tangency, tile edges/poles, rendering, and disposal.
It does not launch Neutralino or require the TuIO hardware.

Background references: [GPU Gems, Fast Fluid Dynamics Simulation on the GPU](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu)
and the unit-sphere geometry in [Alimisis et al., Appendix A](https://www.unige.ch/math/vandereycken/papers/published_Alimisis_DVA.pdf).
