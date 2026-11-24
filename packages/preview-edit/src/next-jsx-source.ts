import { reactFiber, type ResolvedSource } from "./creation-frame";

type Call = (this: unknown, ...args: unknown[]) => unknown;
type WebpackModule = { exports?: unknown };

const CHUNK_QUEUE = "webpackChunk_N_E";
const JSX_RUNTIME = /\/react(?:-experimental)?\/cjs\/react-jsx-dev-runtime\.development\.js$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jsxSource(value: unknown): ResolvedSource | null {
  if (!object(value) || typeof value.fileName !== "string" || value.fileName.split(/[\\/]/).includes("node_modules")) return null;
  const { lineNumber, columnNumber } = value;
  if (typeof lineNumber !== "number" || !Number.isInteger(lineNumber) || lineNumber < 1 ||
      typeof columnNumber !== "number" || !Number.isInteger(columnNumber) || columnNumber < 1) return null;
  return { file: value.fileName, line: lineNumber, column: columnNumber };
}

/**
 * WebKit omits Webpack's eval source URL from React's creation stack. Next's
 * JSX transform still passes a source object to jsxDEV; React 19 ignores it.
 * Preserve it by creation Error identity, which React copies to the DOM fiber.
 */
export function captureNextJsxSource(page: Window): (element: Element) => ResolvedSource | null {
  const locations = new WeakMap<object, ResolvedSource>();
  const read = (element: Element) => {
    const stack = reactFiber(element)?._debugStack;
    return object(stack) ? locations.get(stack) ?? null : null;
  };
  const wrapped = new WeakSet<Call>();
  const queues = new WeakSet<object>();
  const watchFactory = (factory: Call): Call => {
    const wrapper = function (this: unknown, ...args: unknown[]) {
      const result = Reflect.apply(factory, this, args);
      const runtime = (args[0] as WebpackModule | undefined)?.exports;
      if (!object(runtime)) return result;
      const jsx = Object.getOwnPropertyDescriptor(runtime, "jsxDEV");
      if (!jsx?.writable || typeof jsx.value !== "function") return result;
      const jsxDEV: Call = jsx.value;
      runtime.jsxDEV = function (this: unknown, ...params: unknown[]) {
        const node = Reflect.apply(jsxDEV, this, params);
        const stack = object(node) ? node._debugStack : null;
        const source = jsxSource(params[4]);
        if (object(stack) && source) locations.set(stack, source);
        return node;
      };
      return result;
    };
    wrapped.add(wrapper);
    return wrapper;
  };
  const watchChunk = (chunk: unknown) => {
    if (!Array.isArray(chunk) || !object(chunk[1])) return;
    const factories = chunk[1];
    for (const id of Object.keys(factories)) {
      if (!JSX_RUNTIME.test(id)) continue;
      const field = Object.getOwnPropertyDescriptor(factories, id);
      if (field?.writable && typeof field.value === "function" && !wrapped.has(field.value)) {
        factories[id] = watchFactory(field.value);
      }
    }
  };
  const watchPush = (callback: Call): Call => function (this: unknown, ...chunks: unknown[]) {
    for (const chunk of chunks) watchChunk(chunk);
    return Reflect.apply(callback, this, chunks);
  };

  // Webpack consumes early chunks and later replaces push with its JSONP callback.
  // Each wrapper captures its own predecessor, preserving Webpack's callback chain.
  const watchQueue = (queue: unknown) => {
    if (!Array.isArray(queue) || queues.has(queue) || !Object.isExtensible(queue) || typeof queue.push !== "function" ||
        Object.getOwnPropertyDescriptor(queue, "push")?.configurable === false) return;
    queues.add(queue);
    for (const chunk of queue) watchChunk(chunk);
    let push: unknown = watchPush(queue.push);
    Object.defineProperty(queue, "push", {
      configurable: true,
      get: () => push,
      set: (callback: unknown) => { push = typeof callback === "function" ? watchPush(callback as Call) : callback; },
    });
  };
  const descriptor = Object.getOwnPropertyDescriptor(page, CHUNK_QUEUE);
  if (descriptor && (!descriptor.configurable || !("value" in descriptor))) return read;
  let current: unknown = descriptor?.value;
  watchQueue(current);
  Object.defineProperty(page, CHUNK_QUEUE, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get: () => current,
    set(queue: unknown) {
      if (queue === current) return;
      current = queue;
      watchQueue(queue);
    },
  });
  return read;
}
