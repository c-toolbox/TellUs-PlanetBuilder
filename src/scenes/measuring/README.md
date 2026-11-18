# Map drawings over Omni

Current client application demo: https://www.itn.liu.se/~mange61/tellus-map-paint/

MeasuringScene shows drawings sent by map clients. The clients are a separate system that
joins the same Omni session as the globe (the host). Omni transport documentation:
https://github.com/c-toolbox/SimStad-Omni/blob/main/README.md

`OmniSocket` owns connection metadata (`id`, `role`, `name`) and forwards all application
payloads unchanged through `OmniEvent.Message`. Each scene validates its own protocol.

## Protocol

Types, limits, and the validator are in [protocol.ts](protocol.ts).

**Client to host:** the complete current drawing, sent whenever it changes.

```json
{"type":"map_drawing","points":[[58.59,16.19],[59.33,18.07],null,[51.51,-0.13],[48.86,2.35]]}
```

- Coordinates are **[latitude, longitude] in degrees** (not GeoJSON order), finite, within
  [-90, 90] and [-180, 180].
- `null` lifts the pen. No segment connects across it.
- At most **100 entries, including pen lifts**. Invalid or oversized drawings are ignored.
- Each message **replaces** the sender's drawing. `{"type":"map_drawing","points":[]}` clears it.
- One coordinate draws a dot. Adjacent coordinates follow the shortest great-circle arc,
  including across the date line, so sample projected curves densely enough.
- Omni attaches the sender's `user` ID. Clients omit it. Only users registered in
  `OmniSocket` are accepted.

**Host to client:** a stable color per connection, sent when the user joins during this
scene and to all connected users on each scene entry. Clients cannot choose their color.

```json
{"type":"map_color","user":"connection-id","color":"#ef4444"}
```

Colors come from `colorCycle`, advancing 3 indices per participant. Names are set by the
client at authentication and cannot change without reconnecting.

## Behavior

- Only the active scene handles messages. Messages received while another scene is selected
  are ignored and not replayed.
- The last accepted drawings are kept and restored on return if the user is still connected.
  Clients should resend after a scene change to apply newer changes.
- A leaving user's drawing is removed. Leaves while inactive are reconciled on next entry.
  Reconnecting creates a new participant ID.
- No drawing acknowledgements or automatic reconnection.

## Rendering

[MapDrawingLayer.ts](MapDrawingLayer.ts) manages meshes and
[SphericalDrawing.ts](SphericalDrawing.ts) builds dots, joins, and spherical ribbons.
Exiting releases GPU resources but keeps the accepted coordinates.

- Tapes sit at radii 1-1.04, closest to the camera.
- Colored strokes occupy 1.1-1.12. Each later color assignment is slightly closer, based on
  the unwrapped assignment index.
- Black outlines are at 1.14, behind all strokes. Name labels sit in front of strokes.
  Backgrounds are at 2.
- North is +Y, Greenwich at the equator is -X, 90°E is -Z, matching CountryScene and the
  mirrored BackgroundSphere.
- Drawing meshes use depth testing and have no touch interactions.
