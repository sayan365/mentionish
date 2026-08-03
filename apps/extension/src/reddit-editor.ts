const REDDIT_THREAD_PATH = /^\/r\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i;

export function redditPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      !["www.reddit.com", "old.reddit.com", "new.reddit.com"].includes(
        parsed.hostname,
      )
    ) {
      return null;
    }
    return (
      parsed.pathname.match(REDDIT_THREAD_PATH)?.[1]?.toLowerCase() ?? null
    );
  } catch {
    return null;
  }
}

function deepQuery(
  root: Document | ShadowRoot,
  selectors: readonly string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const match = root.querySelector<HTMLElement>(selector);
    if (match) return match;
  }
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (element.shadowRoot) {
      const match = deepQuery(element.shadowRoot, selectors);
      if (match) return match;
    }
  }
  return null;
}

export function findRedditCommentEditor(
  root: Document | ShadowRoot = document,
): HTMLElement | null {
  return deepQuery(root, [
    "shreddit-composer textarea",
    "textarea[name='text']",
    "form textarea",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true'][data-lexical-editor='true']",
  ]);
}

export function insertIntoEditor(editor: HTMLElement, text: string): void {
  const reviewedText = text.trim();
  if (!reviewedText) throw new Error("A reviewed draft is required.");

  if ("value" in editor) {
    const prototype = Object.getPrototypeOf(editor) as object;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(editor, reviewedText);
    else Reflect.set(editor, "value", reviewedText);
  } else {
    editor.focus();
    editor.textContent = reviewedText;
  }

  const inputEvent =
    typeof InputEvent === "undefined"
      ? new Event("input", { bubbles: true, composed: true })
      : new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: reviewedText,
        });
  editor.dispatchEvent(inputEvent);
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  editor.focus();
}
