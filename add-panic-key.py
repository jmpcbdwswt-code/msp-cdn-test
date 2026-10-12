#!/usr/bin/env python3
"""
add-panic-key.py  -  adds <script src="panic.js"></script> to every .html
file in this folder (and subfolders) so the panic key works on every page.

Usage (run from your site folder, next to index.html):
    python3 add-panic-key.py

Safe to run again any time, e.g. after adding new games. Pages that already
have the tag are skipped. index.html is skipped (it already has the settings).
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else __file__))
if len(sys.argv) > 1:
    ROOT = os.path.abspath(sys.argv[1])

def find_spot(text):
    # put the tag as early as possible (before any <base> tag or game code)
    for pat in (r"<head(?=[\s>])[^>]*>", r"<html(?=[\s>])[^>]*>", r"<body(?=[\s>])[^>]*>"):
        m = re.search(pat, text, re.I)
        if m:
            return m.end()
    return len(text)  # no tags at all: add at the end

added = skipped = 0
for folder, _, files in os.walk(ROOT):
    for name in files:
        if not name.lower().endswith(".html"):
            continue
        path = os.path.join(folder, name)
        rel = os.path.relpath(path, ROOT)
        if rel == "index.html":
            continue
        with open(path, "rb") as f:
            text = f.read().decode("latin-1")  # latin-1 keeps every byte exactly as it was
        if "panic.js" in text:
            skipped += 1
            continue
        depth = rel.count(os.sep)
        tag = '<script src="' + "../" * depth + 'panic.js"></script>'
        nl = "\r\n" if "\r\n" in text else "\n"
        at = find_spot(text)
        text = text[:at] + nl + tag + nl + text[at:]
        with open(path, "wb") as f:
            f.write(text.encode("latin-1"))
        added += 1

print("Added to %d pages, skipped %d (already had it)." % (added, skipped))