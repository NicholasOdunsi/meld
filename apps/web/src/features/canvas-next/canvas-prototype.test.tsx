// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasPrototype } from "./canvas-prototype";
import type { CanvasDocument } from "./document";
afterEach(cleanup);
it("commits a gesture once, then undoes and redoes it", () => {
  const changed = vi.fn();
  render(<CanvasPrototype initialDocument={{version: 1, objects: []}} onDocumentChange={changed} />);
  const scene = screen.getByRole("application", {name: "Canvas workspace"});
  scene.setPointerCapture = vi.fn();
  fireEvent.click(screen.getByRole("button", {name: "Rectangle"}));
  fireEvent.pointerDown(scene, {clientX: 100, clientY: 100, pointerId: 1, button: 0});
  fireEvent.pointerMove(scene, {clientX: 200, clientY: 160, pointerId: 1});
  fireEvent.pointerUp(scene, {clientX: 200, clientY: 160, pointerId: 1});
  const last = () => changed.mock.calls.at(-1)?.[0] as CanvasDocument;
  expect(last().objects).toHaveLength(1);
  expect(last().objects[0]).toMatchObject({kind: "rectangle", width: 100, height: 60});
  fireEvent.click(screen.getByRole("button", {name: "Undo"}));
  expect(last().objects).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", {name: "Redo"}));
  expect(last().objects).toHaveLength(1);
});
it("cancels a gesture without adding a history entry", () => {
  const changed = vi.fn();
  render(<CanvasPrototype initialDocument={{version: 1, objects: []}} onDocumentChange={changed} />);
  const scene = screen.getByRole("application", {name: "Canvas workspace"});
  scene.setPointerCapture = vi.fn();
  fireEvent.click(screen.getByRole("button", {name: "Draw"}));
  fireEvent.pointerDown(scene, {clientX: 100, clientY: 100, pointerId: 1, button: 0});
  fireEvent.pointerMove(scene, {clientX: 200, clientY: 160, pointerId: 1});
  fireEvent.keyDown(scene, {key: "Escape"});
  fireEvent.pointerUp(scene, {clientX: 200, clientY: 160, pointerId: 1});
  expect(changed.mock.calls.at(-1)?.[0].objects).toHaveLength(0);
  expect(screen.getByRole("button", {name: "Undo"})).toBeDisabled();
});
it("keeps edited text when the next canvas click commits the editor", () => {
  const changed = vi.fn();
  render(<CanvasPrototype initialDocument={{version: 1, objects: [{id: "note", kind: "text", x: 0, y: 0, width: 200, height: 80, text: "Before"}]}} onDocumentChange={changed} />);
  const scene = screen.getByRole("application", {name: "Canvas workspace"});
  scene.setPointerCapture = vi.fn();
  fireEvent.doubleClick(scene, {clientX: 20, clientY: 20});
  fireEvent.change(screen.getByRole("textbox", {name: "Note text"}), {target: {value: "After"}});
  fireEvent.pointerDown(scene, {clientX: 300, clientY: 300, pointerId: 1, button: 0});
  fireEvent.pointerUp(scene, {clientX: 300, clientY: 300, pointerId: 1});
  expect(changed.mock.calls.at(-1)?.[0].objects[0].text).toBe("After");
  fireEvent.click(screen.getByRole("button", {name: "Undo"}));
  expect(changed.mock.calls.at(-1)?.[0].objects[0].text).toBe("Before");
});
