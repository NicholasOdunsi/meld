export type OverlayPageBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OverlayViewportOrigin = {
  x: number;
  y: number;
};

export type OverlayCamera = {
  x: number;
  y: number;
  z: number;
};

export type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function overlayRectForFrame(
  pageBounds: OverlayPageBounds,
  viewportScreenBounds: OverlayViewportOrigin,
  camera: OverlayCamera,
): OverlayRect {
  const screenLeft =
    (pageBounds.x + camera.x) * camera.z + viewportScreenBounds.x;
  const screenTop =
    (pageBounds.y + camera.y) * camera.z + viewportScreenBounds.y;

  return {
    left: screenLeft - viewportScreenBounds.x,
    top: screenTop - viewportScreenBounds.y,
    width: pageBounds.w * camera.z,
    height: pageBounds.h * camera.z,
  };
}
