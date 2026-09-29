"""Generate docs/ASTROVA-PHASE-38-RAG-GENERATION-DATA-COVERAGE.docx (python-docx).

Cloned from docs/generate-p37-docx.py so the Phase 38 report matches the
project's existing Word-report style (terracotta headings, Calibri body,
Consolas code blocks, 'Light Grid Accent 1' tables).

Unlike the Phase 36 script (content written inline), this one PARSES the
Markdown source so the .md and .docx can never drift apart.

Run:  python3 docs/generate-p38-docx.py
"""
import os
import re

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

TERRACOTTA = RGBColor(0xC1, 0x50, 0x2E)
CHARCOAL = RGBColor(0x2B, 0x2B, 0x2B)

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "ASTROVA-PHASE-38-RAG-GENERATION-DATA-COVERAGE.md")
OUT = os.path.join(HERE, "ASTROVA-PHASE-38-RAG-GENERATION-DATA-COVERAGE.docx")

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(10.5)


def h1(text):
    p = doc.add_heading(text, level=1)
    for r in p.runs:
        r.font.color.rgb = TERRACOTTA
    return p


def h2(text):
    p = doc.add_heading(text, level=2)
    for r in p.runs:
        r.font.color.rgb = CHARCOAL
    return p


def para(text, bold=False, italic=False):
    p = doc.add_paragraph()
    r = p.add_run(strip_inline(text))
    r.bold = bold
    r.italic = italic
    return p


def bullets(items):
    for item in items:
        doc.add_paragraph(strip_inline(item), style="List Bullet")


def mono(text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.name = "Consolas"
    r.font.size = Pt(8)
    return p


def table(headers, rows):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Light Grid Accent 1"
    for i, htxt in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = htxt
        for p in cell.paragraphs:
            for r in p.runs:
                r.bold = True
    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            t.rows[ri].cells[ci].text = str(val)
    doc.add_paragraph()


def strip_inline(text):
    """Render **bold** / `code` as plain text (Word style comes from the run)."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
    return text


def parse_md(path):
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    i = 0
    while i < len(lines):
        line = lines[i]

        # fenced code block
        if line.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            mono("\n".join(buf))
            i += 1
            continue

        # table
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1]):
            headers = [c.strip() for c in line.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip("|").split("|")])
                i += 1
            table(headers, rows)
            continue

        # headings
        if line.startswith("# "):
            title = doc.add_heading(line[2:].strip(), level=0)
            for r in title.runs:
                r.font.color.rgb = TERRACOTTA
        elif line.startswith("## "):
            h1(line[3:].strip())
        elif line.startswith("### "):
            h2(line[4:].strip())
        elif line.startswith("#### "):
            h2(line[5:].strip())

        # bullets (with nesting collapsed to one level)
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith(("- ", "  - ")):
                items.append(lines[i].lstrip()[2:].strip())
                i += 1
            bullets(items)
            continue

        # horizontal rule
        elif line.strip() == "---":
            doc.add_paragraph()

        # plain paragraph
        elif line.strip():
            para(line)

        i += 1


def build():
    parse_md(SRC)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run(
        "Astrova Phase 38 Report — LLM Generation · Multilingual Knowledge · Trusted Heritage Hours\n"
        "29 September 2026 · Status: COMPLETE · Checkpoint d1bb866 (not amended) · 231 checks green"
    )
    r.italic = True

    doc.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
