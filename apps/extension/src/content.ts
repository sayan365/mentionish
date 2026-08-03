import {
  findRedditCommentEditor,
  insertIntoEditor,
  redditPostId,
} from "./reddit-editor.js";

const PANEL_ID = "mentionish-manual-insert";

function createPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;padding:14px;border:1px solid #d7d7d7;border-radius:12px;background:#fff;color:#111;font:14px/1.4 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.18)";
  const title = document.createElement("strong");
  title.textContent = "Mentionish — manual insert";
  const explanation = document.createElement("p");
  explanation.textContent =
    "Review the text below. Mentionish only fills Reddit’s editor; you must submit it yourself.";
  const textarea = document.createElement("textarea");
  textarea.rows = 7;
  textarea.placeholder = "Paste or review your draft";
  textarea.style.cssText = "box-sizing:border-box;width:100%;margin:8px 0";
  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");
  status.style.margin = "6px 0";
  const insertButton = document.createElement("button");
  insertButton.type = "button";
  insertButton.textContent = "Insert into Reddit";
  insertButton.addEventListener("click", () => {
    const editor = findRedditCommentEditor();
    if (!editor) {
      status.textContent =
        "Reddit’s comment editor was not found. Open the reply box and try again.";
      return;
    }
    try {
      insertIntoEditor(editor, textarea.value);
      status.textContent =
        "Inserted. Review it in Reddit and use Reddit’s own submit button.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Insertion failed.";
    }
  });
  panel.append(title, explanation, textarea, insertButton, status);
  return panel;
}

function mount(): void {
  if (!redditPostId(location.href) || document.getElementById(PANEL_ID)) return;
  document.body.append(createPanel());
}

mount();
document.addEventListener("reddit:location", mount);
window.addEventListener("popstate", mount);
