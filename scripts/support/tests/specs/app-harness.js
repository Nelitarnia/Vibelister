import { createApp } from "../../../app/app.js";
import { Ids } from "../../../data/constants.js";

function createStubDocument() {
  const elements = new Map();
  const tabIds = new Set([
    Ids.tabActions,
    Ids.tabInputs,
    Ids.tabModifiers,
    Ids.tabOutcomes,
    Ids.tabInteractions,
  ]);

  function makeElement(id) {
    const listeners = new Map();
    const attrs = new Map();
    const classes = new Set();
    const dataset = {};
    const element = {
      id,
      children: [],
      firstChild: null,
      parentNode: null,
      style: { setProperty() {} },
      dataset,
      textContent: "",
      innerHTML: "",
      value: "",
      disabled: false,
      scrollTop: 0,
      scrollLeft: 0,
      scrollWidth: 0,
      clientWidth: 800,
      clientHeight: 600,
      tabIndex: 0,
      appendChild(node) {
        this.children.push(node);
        this.firstChild = this.children[0] || null;
        node.parentNode = this;
        return node;
      },
      insertBefore(node, reference) {
        const idx = reference ? this.children.indexOf(reference) : -1;
        if (idx >= 0) {
          this.children.splice(idx, 0, node);
        } else {
          this.children.push(node);
        }
        this.firstChild = this.children[0] || null;
        node.parentNode = this;
        return node;
      },
      removeChild(node) {
        const idx = this.children.indexOf(node);
        if (idx >= 0) this.children.splice(idx, 1);
        this.firstChild = this.children[0] || null;
        if (node && node.parentNode === this) node.parentNode = null;
        return node;
      },
      classList: {
        add: (cls) => classes.add(cls),
        remove: (cls) => classes.delete(cls),
        toggle: (cls, force) => {
          const next = force === undefined ? !classes.has(cls) : !!force;
          if (next) classes.add(cls);
          else classes.delete(cls);
          return next;
        },
        contains: (cls) => classes.has(cls),
      },
      setAttribute: (name, value) => attrs.set(name, String(value)),
      getAttribute: (name) => attrs.get(name),
      hasAttribute: (name) => attrs.has(name),
      removeAttribute: (name) => attrs.delete(name),
      addEventListener(type, cb) {
        listeners.set(type, cb);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      dispatchEvent(ev) {
        const cb = listeners.get(ev.type);
        if (typeof cb === "function") cb(ev);
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      onclick: null,
      focus() {},
      blur() {},
    };
    return element;
  }

  function ensure(id) {
    if (!elements.has(id)) {
      const el = makeElement(id);
      if (tabIds.has(id)) el.classList.add("tab");
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const documentStub = {
    getElementById: ensure,
    querySelectorAll(selector) {
      if (selector === ".tabs .tab") {
        return Array.from(tabIds).map((id) => ensure(id));
      }
      return [];
    },
    createElement: (tag) => ensure(tag),
    addEventListener(type, cb) {
      const el = ensure(`document:${type}`);
      el.addEventListener(type, cb);
    },
    removeEventListener(type) {
      elements.delete(`document:${type}`);
    },
  };

  const winListeners = new Map();

  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    ResizeObserver: globalThis.ResizeObserver,
  };

  globalThis.document = documentStub;
  globalThis.window = {
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    addEventListener(type, cb) {
      winListeners.set(type, cb);
    },
    removeEventListener(type) {
      winListeners.delete(type);
    },
  };
  globalThis.location = { hash: "" };
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  };

  return {
    documentStub,
    elements,
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.location = previous.location;
      globalThis.ResizeObserver = previous.ResizeObserver;
    },
  };
}

export function createAppHarness() {
  const { restore, elements } = createStubDocument();
  const app = createApp();
  app.init?.();

  const get = (id) => elements.get(id);

  return {
    app,
    appContext: app.appContext,
    dom: {
      elements,
      get,
      tabs: {
        tabActions: get(Ids.tabActions),
        tabInputs: get(Ids.tabInputs),
        tabModifiers: get(Ids.tabModifiers),
        tabOutcomes: get(Ids.tabOutcomes),
        tabInteractions: get(Ids.tabInteractions),
      },
      menus: {
        undoMenuItem: get(Ids.editUndo),
        redoMenuItem: get(Ids.editRedo),
      },
    },
    teardown() {
      app.destroy?.();
      restore();
    },
  };
}

export default createAppHarness;
