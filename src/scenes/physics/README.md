# Physics

A rigid body physics sandbox on the surface of the sphere. Dots can be joined into ropes, platforms and convex polygons that fall towards the south pole, land on a floor and collide with each other.

The sky is light blue and everything below the floor latitude is a dark gray floor. By default the floor sits at the equator. Gravity points along the meridians towards the south, so it is strongest at the equator and vanishes at the poles: a shape resting on the north pole stays there.

The scene starts with four regular polygons (triangle to hexagon) that drop onto the floor.

## How to use

- **Move and throw dots:** Drag a dot to carry it; it keeps its velocity when you let go. A dot without edges is a small circle. A held dot cannot be dragged closer to a neighbour than its edge allows, so pulling a dot of a resting shape into the floor does not squish the shape.
- **Connect dots:** Bring two dots held by different fingers close together ($\le 0.52\text{ rad}$) to join them with a loose edge. Loose edges are rigid rods that act as platforms; chain them for a rope. While both ends are held, their distance sets the rod's length.
- **Build a shape:** Connect dots so their edges close a cycle and let go of one of them. The cycle becomes one rigid polygon, convex or concave, as long as its outline does not cross or touch itself. A dot joined to a single dot of a shape is just a rope.
- **Extend a shape:** Join a free dot to two dots of a shape (or chain ropes between two of its dots) and let go; the cycle merges with the shape if the result is a clean polygon.
- **Push shapes and rods:** Touch inside a shape, or on a rod, to pull it with a spring. Dots take priority.
- **Scale a shape:** Touch inside the same shape with two fingers and move them apart or together. The largest distance between two of its dots is capped at $1\text{ rad}$.
- **Edit a shape:** Hold two or more dots of a shape to enter edit mode: the shape loses its fill and physics, turns into plain edges and stays where it is while the held dots move freely, and edges can be resized, joined to new dots or broken. When every dot is let go, the edges are turned into a new polygon (if they form a clean one) that keeps the edited spacing.
- **Add dots:** Hold empty space still for **375 ms** to spawn and immediately grab a new dot beneath your finger.
- **Break edges:** Hold both dots of an edge and drag them apart to twice the connection distance ($1.04\text{ rad}$). Breaking any edge of a shape dissolves it into loose edges. While stretched, the edge thins out over the last $0.31\text{ rad}$ and snaps when its width reaches zero.
- **Delete dots:** Drag a dot into the floor (it turns red) and let go. A dot left without any edges is deleted as soon as it is not held.

Shapes are rigid because every pair of their dots is joined by an edge; only the outline is drawn. For collisions and drawing a shape is cut into triangles (ear clipping on the gnomonic projection, where great circles are straight lines) and neighbouring triangles are merged into convex pieces. Pieces of one shape never collide with each other, and the seams between them cannot be touched or pushed through. A shape keeps going if one of its dots is deleted and still has three or more dots forming a clean polygon.

## How it works

Position based dynamics: every step integrates gravity, then repeatedly projects constraints (edge lengths, collisions, floor) back onto the unit sphere. All edges lie on great circles, so collision tests reduce to plane tests: a dot is inside a convex polygon when it is on the inner side of every edge plane. Floor contact and friction act on dots only, so a long edge resting on the floor dips slightly below it. Bounciness is a velocity restitution applied after the solve: the first iteration of each substep records the contacts (dot against floor, dot, rod or polygon edge), and the approach speed along the contact normal is given back scaled by the bounciness. Slow impacts do not bounce, so resting contacts stay still.

## Controls

- **Gravity:** Acceleration towards the south pole at the equator.
- **Friction:** Coulomb friction of contacts, between shapes and along the floor.
- **Bounciness:** Fraction of the impact speed a collision gives back, with the floor and between shapes. A shape bounces as one lump.
- **Air friction:** Exponential damping of all velocities in $1/\mathrm{s}$ (default $0.3$, $0$ for none).
- **Floor height:** $1$ puts the floor at the equator; lowering it to $0.5$ sinks it to $45^\circ$ south.
- **Reset scene:** Restores the starting shapes and clears active interactions.
