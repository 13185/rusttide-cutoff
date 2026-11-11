/* Slim shim: Blender glTF exports triangles, so the full BufferGeometryUtils bundle is not needed. */
export function toTrianglesDrawMode(geometry, _drawMode) {
  return geometry;
}
