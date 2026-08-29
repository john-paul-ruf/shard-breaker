import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import { App } from "./app/App";
import { createAppStore } from "./app/appStore";
import { createContentCatalog } from "./domain/content/catalog";
import { openDatabase } from "./persistence/database";
import { createRunLifecycleRepository } from "./persistence/repositories";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/responsive.css";

type BrowserCapabilityFailureCode =
  | "missing-root"
  | "missing-indexed-db"
  | "missing-crypto";

interface BrowserCapabilities {
  readonly indexedDB: IDBFactory;
  readonly crypto: Crypto;
}

type BrowserCapabilityResult =
  | { readonly ok: true; readonly value: BrowserCapabilities }
  | {
      readonly ok: false;
      readonly code: BrowserCapabilityFailureCode;
      readonly message: string;
    };

interface MountTarget {
  readonly node: HTMLElement;
  readonly hasConfiguredRoot: boolean;
}

function resolveMountTarget(): MountTarget {
  const configuredRoot = document.getElementById("root");
  if (configuredRoot instanceof HTMLElement) {
    return { node: configuredRoot, hasConfiguredRoot: true };
  }

  const fallback = document.createElement("div");
  fallback.id = "unsupported-browser-state";
  (document.body ?? document.documentElement).append(fallback);
  return { node: fallback, hasConfiguredRoot: false };
}

function checkBrowserCapabilities(
  hasConfiguredRoot: boolean,
): BrowserCapabilityResult {
  if (!hasConfiguredRoot) {
    return {
      ok: false,
      code: "missing-root",
      message: "The application mount point is missing from this page.",
    };
  }

  try {
    const indexedDBFactory = globalThis.indexedDB;
    if (
      indexedDBFactory === undefined ||
      typeof indexedDBFactory.open !== "function"
    ) {
      return {
        ok: false,
        code: "missing-indexed-db",
        message: "This browser does not provide the local storage required for durable runs.",
      };
    }

    const cryptoSource = globalThis.crypto;
    if (
      cryptoSource === undefined ||
      typeof cryptoSource.randomUUID !== "function" ||
      typeof cryptoSource.getRandomValues !== "function"
    ) {
      return {
        ok: false,
        code: "missing-crypto",
        message: "This browser cannot create secure local run identities and seeds.",
      };
    }

    return {
      ok: true,
      value: { indexedDB: indexedDBFactory, crypto: cryptoSource },
    };
  } catch {
    return {
      ok: false,
      code: "missing-indexed-db",
      message: "This browser blocked access to the local storage required for durable runs.",
    };
  }
}

function createOpaqueSeed(cryptoSource: Crypto): string {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  let encoded = "";
  for (const byte of bytes) {
    encoded += byte.toString(16).padStart(2, "0");
  }
  return `seed-${encoded}`;
}

function renderStartupShell(
  root: Root,
  {
    title,
    message,
    isError = false,
  }: {
    readonly title: string;
    readonly message: string;
    readonly isError?: boolean;
  },
): void {
  renderStrict(
    root,
    <main className="app-shell" aria-busy={isError ? undefined : "true"}>
      <section className="surface-panel" aria-labelledby="startup-state-title">
        <p
          className="signal-eyebrow"
          data-tone={isError ? "danger" : undefined}
        >
          {isError ? "Browser support · action required" : "Local archive"}
        </p>
        <h1 id="startup-state-title">{title}</h1>
        <p role={isError ? "alert" : "status"}>{message}</p>
        {isError ? (
          <p>
            Use a current browser with local storage enabled, then reload this
            page. Existing local data was not reset.
          </p>
        ) : null}
      </section>
    </main>,
  );
}

function renderStrict(root: Root, content: ReactNode): void {
  root.render(<StrictMode>{content}</StrictMode>);
}

async function composeApplication(
  root: Root,
  capabilities: BrowserCapabilities,
): Promise<void> {
  const catalog = createContentCatalog();
  const openedDatabase = await openDatabase({
    indexedDB: capabilities.indexedDB,
  });
  if (!openedDatabase.ok) {
    renderStartupShell(root, {
      title: "Local archive unavailable",
      message: openedDatabase.error.message,
      isError: true,
    });
    return;
  }

  const repository = createRunLifecycleRepository(
    openedDatabase.value,
    catalog,
  );
  const store = createAppStore({
    catalog,
    repository,
    clock: () => Date.now(),
    createId: () => capabilities.crypto.randomUUID(),
    createSeed: () => createOpaqueSeed(capabilities.crypto),
  });

  renderStrict(root, <App store={store} catalog={catalog} />);
}

const mountTarget = resolveMountTarget();
const root = createRoot(mountTarget.node);
const capabilities = checkBrowserCapabilities(mountTarget.hasConfiguredRoot);

if (!capabilities.ok) {
  renderStartupShell(root, {
    title: "Unsupported browser",
    message: capabilities.message,
    isError: true,
  });
} else {
  renderStartupShell(root, {
    title: "Opening local archive",
    message: "Preparing validated local storage.",
  });
  void composeApplication(root, capabilities.value).catch(() => {
    renderStartupShell(root, {
      title: "SHARDBREAK could not start",
      message: "The application composition failed before the local archive opened.",
      isError: true,
    });
  });
}
