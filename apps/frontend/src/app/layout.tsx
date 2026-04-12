import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "@fontsource/material-symbols-outlined";
import "./globals.css";
import { PageTransition } from "../components/page-transition";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-headline" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "EtherSend",
  description: "Persistent media and link control platform"
};

const themeBootstrapScript = `(() => {
  try {
    const storageKey = "lf_theme_mode";
    const stored = window.localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const mode = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", mode === "dark");
  } catch {
    // Ignore theme bootstrap failures; app will fall back to default mode.
  }
})();`;

const hydrationSanitizerScript = `(() => {
  try {
    const isExtensionInjectedScript = (element) => {
      if (!(element instanceof HTMLScriptElement)) {
        return false;
      }

      const src = (element.getAttribute("src") || "").trim();
      if (
        src.startsWith("chrome-extension://") ||
        src.startsWith("moz-extension://") ||
        src.startsWith("safari-extension://")
      ) {
        return true;
      }

      return element.hasAttribute("data-bis-config") || element.hasAttribute("data-dynamic-id");
    };

    const shouldRemoveAttribute = (name) => {
      return (
        name === "data-new-gr-c-s-check-loaded" ||
        name === "data-lt-installed" ||
        name === "cz-shortcut-listen" ||
        name.startsWith("bis_") ||
        name.startsWith("data-gr-")
      );
    };

    const sanitizeElement = (element) => {
      const attributeNames = Array.from(element.attributes).map((attr) => attr.name);
      for (const name of attributeNames) {
        if (shouldRemoveAttribute(name)) {
          element.removeAttribute(name);
        }
      }
    };

    const sanitizeSubtree = (rootNode) => {
      if (!(rootNode instanceof Element)) {
        return;
      }

      if (isExtensionInjectedScript(rootNode)) {
        rootNode.remove();
        return;
      }

      sanitizeElement(rootNode);

      const children = rootNode.querySelectorAll("*");
      for (const child of children) {
        if (isExtensionInjectedScript(child)) {
          child.remove();
          continue;
        }

        sanitizeElement(child);
      }
    };

    sanitizeSubtree(document.documentElement);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          sanitizeElement(mutation.target);
        }

        for (const addedNode of mutation.addedNodes) {
          sanitizeSubtree(addedNode);
        }
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true
    });

    const stopObserver = () => {
      observer.disconnect();
      sanitizeSubtree(document.documentElement);
    };

    window.addEventListener("load", stopObserver, { once: true });
    window.setTimeout(stopObserver, 10000);
  } catch {
    // Ignore sanitizer failures to avoid blocking app boot.
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: hydrationSanitizerScript }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
