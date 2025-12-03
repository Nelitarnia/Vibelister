import { createAppContext } from "../../../app/app-root.js";
import { getCoreDomElements } from "../../../app/dom-elements.js";
import { bootstrapMenus } from "../../../app/menus-bootstrap.js";
import { bootstrapSidebar } from "../../../app/sidebar-bootstrap.js";
import { bootstrapTabs } from "../../../app/tabs-bootstrap.js";
import { VIEWS, buildInteractionPhaseColumns } from "../../../app/views.js";
import {
  Selection,
  SelectionCtl,
  sel,
  selection,
  clearSelection,
} from "../../../app/selection.js";
import {
  getInteractionsCell,
  setInteractionsCell,
  getStructuredCellInteractions,
  applyStructuredCellInteractions,
} from "../../../app/interactions.js";
import { MIN_ROWS, MOD, Ids } from "../../../data/constants.js";
import { clamp, parsePhasesSpec, formatPhasesSpec } from "../../../data/utils.js";
import { createViewStateController } from "../../../app/view-state.js";
import { createHistoryController } from "../../../app/history.js";
import { createViewController } from "../../../app/view-controller.js";

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
    const element = {
      id,
      children: [],
      firstChild: null,
      style: {},
      textContent: "",
      disabled: false,
      scrollTop: 0,
      appendChild(node) {
        this.children.push(node);
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
      onclick: null,
      focus() {},
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
  };

  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    ResizeObserver: globalThis.ResizeObserver,
  };

  globalThis.document = documentStub;
  globalThis.window = {
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
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

function makeStatusBar() {
  return {
    history: [],
    set(message) {
      this.history.push(String(message || ""));
    },
    ensureLiveRegion() {},
  };
}

export function createAppHarness() {
  const { restore } = createStubDocument();

  const appContext = createAppContext();
  const { model, state } = appContext;
  const statusBar = makeStatusBar();

  const dom = {
    core: getCoreDomElements(),
    menus: bootstrapMenus(Ids),
    sidebar: bootstrapSidebar(Ids),
    tabs: bootstrapTabs(Ids),
  };

  const viewState = createViewStateController({
    getActiveView: appContext.getActiveView,
    model,
    VIEWS,
    buildInteractionPhaseColumns,
    Selection,
    MIN_ROWS,
    MOD,
    statusBar,
    getPaletteAPI: () => state.paletteAPI,
    parsePhasesSpec,
    formatPhasesSpec,
    getInteractionsCell,
    setInteractionsCell,
    getStructuredCellInteractions,
    applyStructuredCellInteractions,
  });

  const rendererApi = { renderCalls: 0 };
  rendererApi.render = () => {
    rendererApi.renderCalls += 1;
  };
  rendererApi.layout = () => {};
  rendererApi.ensureVisible = () => {};

  const viewApi = createViewController({
    tabs: dom.tabs,
    sheet: dom.core.sheet,
    sel,
    selection,
    saveCurrentViewState: viewState.saveCurrentViewState,
    restoreViewState: viewState.restoreViewState,
    clearSelection,
    endEditIfOpen: () => {},
    VIEWS,
    interactionsOutline: null,
    invalidateViewDef: viewState.invalidateViewDef,
    rebuildActionColumnsFromModifiers: () => {},
    rebuildInteractionsInPlace: () => {},
    rebuildInteractionPhaseColumns: viewState.rebuildInteractionPhaseColumns,
    layout: rendererApi.layout,
    render: rendererApi.render,
    statusBar,
    menusAPIRef: () => ({ updateViewMenuRadios: () => {} }),
    getRowCount: viewState.getRowCount,
    viewDef: viewState.viewDef,
    clamp,
    model,
    getActiveViewState: () => state.activeView,
    setActiveViewState: (key) => (state.activeView = key),
    getCommentsUI: () => ({ refresh: () => {} }),
  });

  appContext.setLifecycle({
    setActiveView: viewApi.setActiveView,
    cycleView: viewApi.cycleView,
    toggleInteractionsMode: viewApi.toggleInteractionsMode,
  });

  const historyApi = createHistoryController({
    model,
    viewDef: viewState.viewDef,
    getActiveView: appContext.getActiveView,
    setActiveView: viewApi.setActiveView,
    selectionCursor: sel,
    SelectionCtl,
    ensureVisible: rendererApi.ensureVisible,
    VIEWS,
    statusBar,
    undoMenuItem: dom.menus.items.undoMenuItem,
    redoMenuItem: dom.menus.items.redoMenuItem,
    rebuildActionColumnsFromModifiers: () => {},
    rebuildInteractionsInPlace: () => {},
    pruneNotesToValidPairs: () => {},
    invalidateViewDef: viewState.invalidateViewDef,
    layout: rendererApi.layout,
    render: rendererApi.render,
    historyLimit: 50,
  });

  return {
    appContext,
    dom,
    viewState,
    renderer: rendererApi,
    view: viewApi,
    history: historyApi,
    statusBar,
    teardown: restore,
  };
}

export default createAppHarness;
