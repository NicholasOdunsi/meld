import { SUPPORTED_MODULES } from "../constants";

/** Browser-side CommonJS loader for paths already resolved by the module graph. */
export const MODULE_LOADER_SOURCE = `(() => {
  const factories = Object.create(null);
  const cache = Object.create(null);
  const supported = ${JSON.stringify(SUPPORTED_MODULES)};
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const report = (error) => {
    if (typeof window.__orionReport === 'function') window.__orionReport(error);
  };
  window.__orionDefine = (path, factory) => { factories[path] = factory; };
  window.__orionRequire = (path) => {
    if (own(cache, path)) return cache[path].exports;
    if (own(factories, path)) {
      const module = { exports: {} };
      cache[path] = module;
      try {
        factories[path](window.__orionRequire, module, module.exports);
      } catch (error) {
        delete cache[path];
        throw error;
      }
      return module.exports;
    }
    const modules = window.__orionModules || Object.create(null);
    if (supported.includes(path) && own(modules, path)) return modules[path];
    throw new Error('Cannot find module "' + path + '".');
  };
  window.__orionMount = (entry) => {
    const exports = window.__orionRequire(entry);
    const Component = exports && (exports.default || exports.App);
    if (!Component) throw new Error('The entry file has no default export or App component.');
    const react = window.__orionRequire('react');
    const client = window.__orionRequire('react-dom/client');
    client.createRoot(document.getElementById('orion-root'), {
      onUncaughtError: report,
      onCaughtError: report,
    }).render(react.createElement(Component));
  };
})();`;
