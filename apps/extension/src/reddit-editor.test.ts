import { describe, expect, it, vi } from "vitest";
import { insertIntoEditor, redditPostId } from "./reddit-editor.js";

describe("redditPostId", () => {
  it("accepts supported Reddit thread URLs only", () => {
    expect(
      redditPostId("https://www.reddit.com/r/SaaS/comments/AbC123/title/"),
    ).toBe("abc123");
    expect(
      redditPostId("https://example.com/r/SaaS/comments/abc123/"),
    ).toBeNull();
    expect(redditPostId("https://www.reddit.com/r/SaaS/new/")).toBeNull();
  });
});

describe("insertIntoEditor", () => {
  it("sets reviewed text and emits input/change without submitting", () => {
    const events: string[] = [];
    const focus = vi.fn();
    const editor = {
      value: "",
      dispatchEvent: vi.fn((event: Event) => {
        events.push(event.type);
        return true;
      }),
      focus,
    } as unknown as HTMLElement;

    insertIntoEditor(editor, "  Helpful, reviewed reply.  ");

    expect(Reflect.get(editor, "value")).toBe("Helpful, reviewed reply.");
    expect(events).toEqual(["input", "change"]);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("rejects an empty draft", () => {
    const editor = {} as HTMLElement;
    expect(() => insertIntoEditor(editor, "   ")).toThrow(
      "A reviewed draft is required.",
    );
  });
});
