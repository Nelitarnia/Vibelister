import { initStatusBar } from "../../../ui/status.js";

function createElementFactory() {
  function createElement(tagName = "div") {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
      tagName: String(tagName).toUpperCase(),
      children: [],
      parentNode: null,
      firstChild: null,
      className: "",
      dataset: {},
      style: {},
      textContent: "",
      isConnected: true,
      appendChild(child) {
        this.children.push(child);
        this.firstChild = this.children[0] || null;
        child.parentNode = this;
        return child;
      },
      insertBefore(child, reference) {
        const index = reference ? this.children.indexOf(reference) : -1;
        if (index >= 0) this.children.splice(index, 0, child);
        else this.children.push(child);
        this.firstChild = this.children[0] || null;
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        this.firstChild = this.children[0] || null;
        if (child.parentNode === this) child.parentNode = null;
        return child;
      },
      contains(node) {
        if (!node) return false;
        if (node === this) return true;
        for (const child of this.children) {
          if (child === node) return true;
          if (typeof child.contains === "function" && child.contains(node))
            return true;
        }
        return false;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.get(name) || null;
      },
      hasAttribute(name) {
        return attributes.has(name);
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      addEventListener(type, cb) {
        const list = listeners.get(type) || [];
        list.push(cb);
        listeners.set(type, list);
      },
      removeEventListener(type, cb) {
        const list = listeners.get(type) || [];
        listeners.set(
          type,
          list.filter((entry) => entry !== cb),
        );
      },
      dispatchEvent(event) {
        event.target = event.target || this;
        const list = listeners.get(event.type) || [];
        for (const cb of [...list]) cb(event);
      },
      focus() {},
      closest(selector) {
        if (selector === ".status-history__item") {
          if (this.className.split(/\s+/).includes("status-history__item"))
            return this;
          return null;
        }
        return null;
      },
      scrollIntoView() {},
      querySelectorAll(selector) {
        if (!selector.startsWith(".")) return [];
        const cls = selector.slice(1);
        const out = [];
        const walk = (node) => {
          if (!node || !node.children) return;
          for (const child of node.children) {
            if ((child.className || "").split(/\s+/).includes(cls))
              out.push(child);
            walk(child);
          }
        };
        walk(this);
        return out;
      },
      classList: {
        contains(cls) {
          return (element.className || "").split(/\s+/).includes(cls);
        },
      },
    };
    return element;
  }

  return { createElement };
}

export function getStatusTests() {
  return [
    {
      name: "status history copy normalizes seeded Ready message from DOM textContent",
      run(assert) {
        const previousDocument = globalThis.document;
        const previousWindow = globalThis.window;
        const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(
          globalThis,
          "navigator",
        );
        const previousNavigator = globalThis.navigator;

        const { createElement } = createElementFactory();
        const documentStub = {
          activeElement: null,
          createElement,
          addEventListener() {},
          removeEventListener() {},
        };

        globalThis.document = documentStub;
        globalThis.window = {
          getSelection() {
            return { isCollapsed: true };
          },
        };
        Object.defineProperty(globalThis, "navigator", {
          configurable: true,
          writable: true,
          value: {
            clipboard: {
              writeText() {
                return Promise.resolve();
              },
            },
          },
        });

        try {
          const element = createElement("div");
          element.id = "statusBar";
          element.textContent = "\n      Ready\n    ";

          const status = initStatusBar(element);
          assert.ok(status, "status bar should initialize");
          status.showHistory();

          const history = status.getHistory();
          assert.strictEqual(
            history.length,
            1,
            "seeded history should contain one entry",
          );
          const plainTextPayload = history
            .map((entry) => entry.message)
            .join("\n");

          assert.strictEqual(
            plainTextPayload,
            "Ready",
            "copying seeded entry should not include leading/trailing blank rows",
          );
        } finally {
          if (previousDocument === undefined) delete globalThis.document;
          else globalThis.document = previousDocument;

          if (previousWindow === undefined) delete globalThis.window;
          else globalThis.window = previousWindow;

          if (previousNavigatorDescriptor)
            Object.defineProperty(
              globalThis,
              "navigator",
              previousNavigatorDescriptor,
            );
          else if (previousNavigator === undefined) delete globalThis.navigator;
          else
            Object.defineProperty(globalThis, "navigator", {
              configurable: true,
              writable: true,
              value: previousNavigator,
            });
        }
      },
    },
  ];
}
