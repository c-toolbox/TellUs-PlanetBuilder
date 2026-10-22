# Force Graph

An interactive force directed network graph, allowing you to create nodes and edges.

## How to use

- **Move nodes:** Drag any node along the sphere to reposition it. Its physics are suspended while held, but other nodes still react to it.
- **Connect nodes:** Bring two nodes held by different fingers close together ($\le 0.13\text{ rad} / 7.4^\circ$) to connect them with an edge.
- **Cut edges:** Swipe a free finger across an edge to slice and remove it.
- **Add nodes:** Hold empty space still for **750 ms** to spawn and immediately grab a new node beneath your finger.
- **Remove nodes:** Quickly tap a node within **250 ms** to delete it along with all incident edges.

## Controls

- **Base graph:** Replace the current graph vertices and edges with a selected preset.
- **Repulsion:** Adjusts the pairwise repulsion force between nodes.
- **Spring strength / length:** Controls the tension and target rest-length of graph edges (length is relative to the preset's mean edge length).
- **Friction:** Adjusts the exponential damping applied to dot velocities.
- **Pause physics:** Freezes simulation forces while allowing continuous graph editing.
- **Reset graph:** Reloads the chosen preset and clears active interactions.
