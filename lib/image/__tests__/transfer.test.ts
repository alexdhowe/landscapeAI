import { describe, expect, it } from "vitest";

import { nothingToUploadMessage, pickImage } from "../transfer";

describe("pickImage", () => {
  it("takes nothing from an empty bag", () => {
    expect(pickImage([])).toBeNull();
  });

  it("prefers a declared type we accept", () => {
    const jpeg = { name: "yard.jpg", type: "image/jpeg" };
    expect(pickImage([{ name: "note.txt", type: "text/plain" }, jpeg])).toBe(jpeg);
  });

  it("takes the HEIC a browser declared no type for", () => {
    // Safari dragging out of Photos, and a desktop browser reading a
    // mounted iPhone: the extension is the only evidence there is.
    const heic = { name: "IMG_1758.HEIC", type: "" };
    expect(pickImage([heic])).toBe(heic);
  });

  it("passes an image type we do not accept through to the server", () => {
    // So the refusal is the server's named 415 rather than a click that
    // appears to do nothing.
    const tiff = { name: "scan.tiff", type: "image/tiff" };
    expect(pickImage([tiff])).toBe(tiff);
  });

  it("takes one unidentified file, because the bytes decide", () => {
    const mystery = { name: "photo", type: "application/octet-stream" };
    expect(pickImage([mystery])).toBe(mystery);
  });

  it("refuses to guess between two unidentified files", () => {
    expect(
      pickImage([
        { name: "a", type: "application/octet-stream" },
        { name: "b", type: "application/octet-stream" },
      ]),
    ).toBeNull();
  });

  it("ignores the text a paste carries alongside the image", () => {
    // A paste out of a browser is typically text/html + the image.
    const png = { name: "image.png", type: "image/png" };
    expect(
      pickImage([{ name: "", type: "text/html" }, { name: "", type: "text/plain" }, png]),
    ).toBe(png);
  });

  it("finds nothing in a paste that was only text", () => {
    expect(pickImage([{ name: "", type: "text/plain" }])).toBeNull();
  });

  it("sends a lone file the browser said nothing at all about", () => {
    // Same reasoning as the empty-type HEIC: the bytes are the gate, and
    // they are read on the server. Refusing here would be a drop that
    // appears to do nothing.
    const nameless = {};
    expect(pickImage([nameless])).toBe(nameless);
  });
});

describe("nothingToUploadMessage", () => {
  it("names the gesture, so it is clear what did not work", () => {
    expect(nothingToUploadMessage("paste")).toMatch(/clipboard/i);
    expect(nothingToUploadMessage("drop")).toMatch(/drop/i);
  });

  it("never blames the customer or mentions a MIME type", () => {
    for (const gesture of ["paste", "drop"] as const) {
      expect(nothingToUploadMessage(gesture)).not.toMatch(/MIME|invalid|error/i);
    }
  });
});
