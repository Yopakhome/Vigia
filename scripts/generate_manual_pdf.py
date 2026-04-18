#!/usr/bin/env python3
"""
Generate the VIGIA end-user manual PDF from a markdown source file.

Input syntax (custom markdown subset — see docs/VIGIA_Manual_Usuario_v1.1_source.md):
  # COVER_TITLE                                → cover title (first H1 only)
  ## SUBTITLE / VERSION / ORG / CITY           → cover metadata (first 4 H2 before [[TOC]])
  [[TOC]]                                      → insert auto-generated table of contents
  ## section:COLOR num=N title="..." subtitle="..."  → numbered section header with colored box
  ### Subsection heading
  regular paragraph text, **bold** inline
  | col a | col b |
  |---|---|
  | v1 | v2 |
  - bullet item
  1. numbered item
  > tip: yellow callout
  > warn: red callout

Usage:
  python3 scripts/generate_manual_pdf.py \
    --source docs/VIGIA_Manual_Usuario_v1.1_source.md \
    --output docs/VIGIA_Manual_Usuario_v1.1.pdf
"""
import argparse
import re
from pathlib import Path

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


# ========== COLORS (matched from v1.0 inspection) ==========
TEAL = HexColor("#14B8A6")
TEAL_BRIGHT = HexColor("#00C9A7")
NAVY = HexColor("#0F172A")
NAVY_DEEP = HexColor("#060C14")
BLUE = HexColor("#1E3A8A")
PURPLE = HexColor("#6D28D9")
ORANGE = HexColor("#EA580C")
DARK_SLATE = HexColor("#1E293B")
GREY_TEXT = HexColor("#475569")
ALT_ROW = HexColor("#F8FAFC")
TIP_BG = HexColor("#FEFCE8")
TIP_BORDER = HexColor("#EAB308")
WARN_BG = HexColor("#FEF2F2")
WARN_BORDER = HexColor("#EF4444")
TABLE_HEADER_BG = HexColor("#0F172A")

SECTION_COLORS = {
    "teal": TEAL,
    "navy": NAVY,
    "blue": BLUE,
    "purple": PURPLE,
    "orange": ORANGE,
    "darkslate": DARK_SLATE,
}


# ========== STYLES ==========
def build_styles():
    s = {}
    s["cover_v"] = ParagraphStyle(
        "cover_v", fontName="Helvetica-Bold", fontSize=110, leading=118,
        textColor=TEAL, alignment=TA_CENTER,
    )
    s["cover_brand"] = ParagraphStyle(
        "cover_brand", fontName="Helvetica-Bold", fontSize=44, leading=52,
        textColor=white, alignment=TA_CENTER,
    )
    s["cover_subtitle"] = ParagraphStyle(
        "cover_subtitle", fontName="Helvetica", fontSize=13, leading=18,
        textColor=TEAL_BRIGHT, alignment=TA_CENTER,
    )
    s["cover_manual"] = ParagraphStyle(
        "cover_manual", fontName="Helvetica-Bold", fontSize=19, leading=24,
        textColor=white, alignment=TA_CENTER,
    )
    s["cover_meta"] = ParagraphStyle(
        "cover_meta", fontName="Helvetica", fontSize=10, leading=14,
        textColor=white, alignment=TA_CENTER,
    )
    s["cover_contact"] = ParagraphStyle(
        "cover_contact", fontName="Helvetica", fontSize=8, leading=12,
        textColor=white, alignment=TA_CENTER,
    )
    s["cover_contact_b"] = ParagraphStyle(
        "cover_contact_b", fontName="Helvetica-Bold", fontSize=8, leading=12,
        textColor=white, alignment=TA_CENTER,
    )
    s["toc_title"] = ParagraphStyle(
        "toc_title", fontName="Helvetica-Bold", fontSize=18, leading=22,
        textColor=black, spaceBefore=4, spaceAfter=14,
    )
    s["toc_entry"] = ParagraphStyle(
        "toc_entry", fontName="Helvetica-Bold", fontSize=10, leading=13,
        textColor=black,
    )
    s["section_num_title"] = ParagraphStyle(
        "section_num_title", fontName="Helvetica-Bold", fontSize=14, leading=18,
        textColor=white, alignment=TA_LEFT,
    )
    s["section_subtitle"] = ParagraphStyle(
        "section_subtitle", fontName="Helvetica", fontSize=9, leading=12,
        textColor=white, alignment=TA_RIGHT,
    )
    s["h3"] = ParagraphStyle(
        "h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14,
        textColor=black, spaceBefore=10, spaceAfter=4,
    )
    s["body"] = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=9.5, leading=13,
        textColor=black, spaceAfter=6, alignment=TA_LEFT,
    )
    s["body_justify"] = ParagraphStyle(
        "body_justify", parent=s["body"], alignment=4,  # TA_JUSTIFY
    )
    s["bullet"] = ParagraphStyle(
        "bullet", fontName="Helvetica", fontSize=9.5, leading=13,
        textColor=black, leftIndent=16, bulletIndent=4, spaceAfter=3,
    )
    s["ol"] = ParagraphStyle(
        "ol", fontName="Helvetica", fontSize=9.5, leading=13,
        textColor=black, leftIndent=18, bulletIndent=4, spaceAfter=3,
    )
    s["tip"] = ParagraphStyle(
        "tip", fontName="Helvetica", fontSize=9, leading=12,
        textColor=black, leftIndent=6, rightIndent=6, spaceAfter=4,
    )
    s["tbl_header"] = ParagraphStyle(
        "tbl_header", fontName="Helvetica-Bold", fontSize=9, leading=12,
        textColor=white,
    )
    s["tbl_cell"] = ParagraphStyle(
        "tbl_cell", fontName="Helvetica", fontSize=8.5, leading=11,
        textColor=black,
    )
    s["tbl_cell_b"] = ParagraphStyle(
        "tbl_cell_b", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
        textColor=black,
    )
    s["footer"] = ParagraphStyle(
        "footer", fontName="Helvetica", fontSize=7.5, leading=10,
        textColor=GREY_TEXT, alignment=TA_LEFT,
    )
    return s


# ========== MARKDOWN PARSER (minimal, purpose-built) ==========
def parse_markdown(text):
    lines = text.split("\n")
    blocks = []
    meta = {}  # cover metadata collected from first H1/H2s before [[TOC]]
    toc_inserted = False

    i = 0
    cover_h1_done = False
    cover_h2_collected = []

    def strip_html_comments(s):
        return re.sub(r"<!--.*?-->", "", s).strip()

    while i < len(lines):
        raw = lines[i]
        line = strip_html_comments(raw)

        # skip empties
        if not line.strip():
            i += 1
            continue

        # cover H1
        if line.startswith("# ") and not cover_h1_done:
            meta["brand"] = line[2:].strip()
            cover_h1_done = True
            i += 1
            continue

        # cover H2 list (collect until [[TOC]])
        if line.startswith("## ") and not toc_inserted and not line.startswith("## section:"):
            cover_h2_collected.append(line[3:].strip())
            i += 1
            continue

        # cover H3 list (fallback, same bucket)
        if line.startswith("### ") and not toc_inserted and len(cover_h2_collected) > 0:
            cover_h2_collected.append(line[4:].strip())
            i += 1
            continue

        # TOC marker
        if line.strip() == "[[TOC]]":
            meta["cover_lines"] = cover_h2_collected
            blocks.append({"type": "cover", "meta": meta})
            blocks.append({"type": "toc"})
            toc_inserted = True
            i += 1
            continue

        # Section header with custom attrs
        m = re.match(r"^## section:(\w+)\s+num=(\d+)\s+title=\"([^\"]+)\"(?:\s+subtitle=\"([^\"]+)\")?", line)
        if m:
            color = m.group(1)
            num = int(m.group(2))
            title = m.group(3)
            subtitle = m.group(4) or ""
            blocks.append({
                "type": "section",
                "color": color,
                "num": num,
                "title": title,
                "subtitle": subtitle,
            })
            i += 1
            continue

        # H3
        if line.startswith("### "):
            blocks.append({"type": "h3", "text": line[4:].strip()})
            i += 1
            continue

        # Callouts
        if line.startswith("> tip:"):
            blocks.append({"type": "tip", "text": line[6:].strip()})
            i += 1
            continue
        if line.startswith("> warn:"):
            blocks.append({"type": "warn", "text": line[7:].strip()})
            i += 1
            continue

        # Table detection (pipe syntax with |---| divider on next line)
        if line.lstrip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s\-\|:]+\|\s*$", lines[i + 1]):
            header_cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows = []
            j = i + 2
            while j < len(lines):
                ln = lines[j]
                if not ln.lstrip().startswith("|"):
                    break
                if not ln.strip():
                    break
                cells = [c.strip() for c in ln.strip().strip("|").split("|")]
                # pad to header len
                while len(cells) < len(header_cells):
                    cells.append("")
                rows.append(cells[: len(header_cells)])
                j += 1
            blocks.append({"type": "table", "header": header_cells, "rows": rows})
            i = j
            continue

        # Bullet list
        if line.lstrip().startswith("- ") or line.lstrip().startswith("* "):
            items = []
            j = i
            while j < len(lines) and (lines[j].lstrip().startswith("- ") or lines[j].lstrip().startswith("* ")):
                items.append(lines[j].lstrip()[2:].strip())
                j += 1
            blocks.append({"type": "bullet", "items": items})
            i = j
            continue

        # Ordered list
        if re.match(r"^\s*\d+\.\s", line):
            items = []
            j = i
            while j < len(lines) and re.match(r"^\s*\d+\.\s", lines[j]):
                items.append(re.sub(r"^\s*\d+\.\s", "", lines[j]).strip())
                j += 1
            blocks.append({"type": "ol", "items": items})
            i = j
            continue

        # Horizontal rule — ignore before TOC (would push cover off-page)
        if line.strip() == "---":
            if toc_inserted:
                blocks.append({"type": "hrule"})
            i += 1
            continue

        # Paragraph (multi-line until blank)
        para_lines = [line]
        j = i + 1
        while j < len(lines) and lines[j].strip() and not lines[j].startswith(("#", "|", "-", "*", ">", "[")) and not re.match(r"^\s*\d+\.\s", lines[j]):
            para_lines.append(strip_html_comments(lines[j]))
            j += 1
        blocks.append({"type": "para", "text": " ".join(para_lines).strip()})
        i = j

    return blocks


def inline_format(text):
    """Convert **bold** and basic inline markers to ReportLab HTML-like tags."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = text.replace("&", "&amp;").replace("&amp;b&amp;", "&b&")
    # careful: we introduced <b> tags above, so escape &amp; only in user text — leave tags alone
    # simpler: don't escape ampersands (no user-provided HTML expected)
    # revert the naive escape
    text = text.replace("&amp;", "&")
    return text


# ========== FLOWABLE BUILDERS ==========
def build_cover(meta, styles, page_w, page_h):
    """Returns a list of flowables for the cover page."""
    from reportlab.platypus import Flowable, NextPageTemplate

    class CoverBackground(Flowable):
        def __init__(self, w, h):
            super().__init__()
            self.w = w
            self.h = h

        def wrap(self, a, b):
            return self.w, self.h

        def draw(self):
            c = self.canv
            c.setFillColor(NAVY_DEEP)
            c.rect(0, 0, self.w, self.h, fill=1, stroke=0)
            # top teal band
            c.setFillColor(TEAL_BRIGHT)
            c.rect(0, self.h - 34, self.w, 34, fill=1, stroke=0)
            # narrow teal side strip
            c.setFillColor(HexColor("#0A9E82"))
            c.rect(0, self.h * 0.35, 23, self.h * 0.4, fill=1, stroke=0)

            # big V
            c.setFillColor(TEAL)
            c.setFont("Helvetica-Bold", 120)
            c.drawCentredString(self.w / 2, self.h - 260, "V")

            # brand
            c.setFillColor(white)
            c.setFont("Helvetica-Bold", 44)
            c.drawCentredString(self.w / 2, self.h - 430, "VIGÍA")

            # subtitle
            c.setFillColor(TEAL_BRIGHT)
            c.setFont("Helvetica", 13)
            c.drawCentredString(self.w / 2, self.h - 470, "Inteligencia Regulatoria Ambiental")

            # manual label
            cover_lines = meta.get("cover_lines", [])
            manual_y = self.h - 540
            c.setFillColor(white)
            c.setFont("Helvetica-Bold", 19)
            manual_title = cover_lines[0] if cover_lines else "Manual del Usuario Final"
            c.drawCentredString(self.w / 2, manual_y, manual_title)

            # meta lines
            c.setFont("Helvetica", 10)
            for idx, ln in enumerate(cover_lines[1:]):
                c.drawCentredString(self.w / 2, manual_y - 30 - (idx * 18), ln)

            # contact box
            box_y = 110
            box_h = 80
            box_w = 450
            box_x = (self.w - box_w) / 2
            c.setFillColor(HexColor("#0E1828"))
            c.roundRect(box_x, box_y, box_w, box_h, 6, fill=1, stroke=0)
            c.setFillColor(TEAL_BRIGHT)
            c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(self.w / 2, box_y + 56, "Soporte y contacto:")
            c.setFillColor(white)
            c.setFont("Helvetica", 9)
            c.drawCentredString(self.w / 2, box_y + 36, "info@enaraconsulting.com.co  ·  +57 314 330 4008")
            c.drawCentredString(self.w / 2, box_y + 20, "www.enaraconsulting.com.co")

            # bottom teal band
            c.setFillColor(TEAL_BRIGHT)
            c.rect(0, 0, self.w, 23, fill=1, stroke=0)

    return [CoverBackground(page_w, page_h), NextPageTemplate("body"), PageBreak()]


def build_toc(section_entries, styles):
    flow = [Paragraph("Tabla de Contenido", styles["toc_title"])]
    data = []
    for num, title, subtitle, page in section_entries:
        label = f"<b>{num}. {title}</b>"
        if subtitle:
            label += f" — <font size='9' color='#475569'>{subtitle}</font>"
        data.append([Paragraph(label, styles["toc_entry"]), Paragraph(f"<para alignment='right'><b>{page}</b></para>", styles["toc_entry"])])
    t = Table(data, colWidths=[14 * cm, 2 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
    ]))
    flow.append(t)
    flow.append(PageBreak())
    return flow


def build_section_header(block, styles):
    color = SECTION_COLORS.get(block["color"], NAVY)
    num_title = f"<font color='#FFFFFF'><b>{block['num']}. {block['title']}</b></font>"
    subtitle = block.get("subtitle", "") or ""
    data = [[
        Paragraph(num_title, styles["section_num_title"]),
        Paragraph(f"<para alignment='right'><font color='#FFFFFF'>{subtitle}</font></para>", styles["section_subtitle"]),
    ]]
    t = Table(data, colWidths=[10 * cm, 7 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [Spacer(1, 10), t, Spacer(1, 8)]


def build_table(block, styles):
    header = [Paragraph(inline_format(c), styles["tbl_header"]) for c in block["header"]]
    body_rows = [[Paragraph(inline_format(c), styles["tbl_cell"]) for c in row] for row in block["rows"]]
    data = [header] + body_rows
    n = len(block["header"])
    # sensible default column widths
    avail = 17 * cm
    col_widths = [avail / n] * n
    if n == 2:
        col_widths = [5.5 * cm, 11.5 * cm]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    tblstyle = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, 0), 0.4, HexColor("#1E293B")),
    ]
    for ridx in range(1, len(data)):
        if ridx % 2 == 0:
            tblstyle.append(("BACKGROUND", (0, ridx), (-1, ridx), ALT_ROW))
    t.setStyle(TableStyle(tblstyle))
    return [t, Spacer(1, 8)]


def build_callout(block, styles, kind):
    bg = TIP_BG if kind == "tip" else WARN_BG
    border = TIP_BORDER if kind == "tip" else WARN_BORDER
    p = Paragraph(inline_format(block["text"]), styles["tip"])
    t = Table([[p]], colWidths=[17 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [t, Spacer(1, 6)]


def build_bullet_list(items, styles, ordered=False):
    flow = []
    for idx, itm in enumerate(items, start=1):
        marker = f"{idx}." if ordered else "■"
        p = Paragraph(inline_format(itm), styles["bullet"], bulletText=marker)
        flow.append(p)
    flow.append(Spacer(1, 4))
    return flow


# ========== PAGE DECORATION ==========
class ManualDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, **kw)
        frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height - 30,  # leave room for top band
            leftPadding=0, rightPadding=0, topPadding=18, bottomPadding=0,
            showBoundary=0,
        )
        cover_frame = Frame(0, 0, A4[0], A4[1], leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=self._cover_page),
            PageTemplate(id="body", frames=[frame], onPage=self._body_page),
        ])
        self._page_no = 0

    def _cover_page(self, canv, doc):
        pass  # cover flowable draws its own background

    def _body_page(self, canv, doc):
        self._page_no = doc.page
        w, h = A4
        # top brand header
        canv.setFillColor(white)
        canv.rect(0, h - 40, w, 40, fill=1, stroke=0)
        canv.setFillColor(TEAL_BRIGHT)
        canv.setFont("Helvetica-Bold", 9)
        canv.drawString(2 * cm, h - 20, "VIGÍA")
        canv.setFillColor(GREY_TEXT)
        canv.setFont("Helvetica", 8)
        canv.drawRightString(w - 2 * cm, h - 20, "Manual del Usuario Final  ·  v1.1  ·  Abril 2026")
        # teal underline
        canv.setFillColor(TEAL_BRIGHT)
        canv.rect(2 * cm, h - 26, w - 4 * cm, 2, fill=1, stroke=0)

        # footer
        canv.setFillColor(GREY_TEXT)
        canv.setFont("Helvetica", 7.5)
        canv.drawString(2 * cm, 1.2 * cm, "VIGÍA  ·  ENARA Consulting S.A.S.  ·  Barranquilla, Colombia")
        # Cover is page 1 (cover template, no footer). TOC is page 2 (body template, skip num).
        # First content page is doc.page=3 → shown as "Página 1".
        if doc.page > 2:
            canv.drawRightString(w - 2 * cm, 1.2 * cm, f"Página {doc.page - 2}")
        canv.setStrokeColor(HexColor("#E2E8F0"))
        canv.setLineWidth(0.5)
        canv.line(2 * cm, 1.7 * cm, w - 2 * cm, 1.7 * cm)


# ========== MAIN BUILD ==========
def build_pdf(source_path, output_path):
    text = Path(source_path).read_text(encoding="utf-8")
    blocks = parse_markdown(text)
    styles = build_styles()

    # Collect section entries for TOC before rendering (PDF-knowable pages after first pass not supported — we hardcode by heuristic: each section starts on a new page)
    section_entries = []  # (num, title, subtitle, page_number_after_cover+toc)
    page_counter = 3  # cover=1, toc=2, first section starts at page 3
    for b in blocks:
        if b["type"] == "section":
            section_entries.append((b["num"], b["title"], b["subtitle"], page_counter))
            page_counter += 1  # crude: assume 1 section ≈ 1 page (imperfect but TOC numbers hardcoded to start-page)

    doc = ManualDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.2 * cm, bottomMargin=2.2 * cm,
        title="VIGÍA — Manual del Usuario Final v1.1",
        author="ENARA Consulting S.A.S.",
    )

    story = []
    page_w, page_h = A4
    toc_emitted = False

    for b in blocks:
        bt = b["type"]
        if bt == "cover":
            story.extend(build_cover(b["meta"], styles, page_w, page_h))
        elif bt == "toc":
            if not toc_emitted:
                story.append(Paragraph("Tabla de Contenido", styles["toc_title"]))
                data = []
                for num, title, subtitle, page in section_entries:
                    label = f"<b>{num}. {title}</b>"
                    if subtitle:
                        label += f"  <font size='8' color='#64748B'>{subtitle}</font>"
                    data.append([Paragraph(label, styles["toc_entry"])])
                t = Table(data, colWidths=[17 * cm])
                t.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.4, HexColor("#E2E8F0")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(t)
                story.append(PageBreak())
                toc_emitted = True
        elif bt == "section":
            story.extend(build_section_header(b, styles))
        elif bt == "h3":
            story.append(Paragraph(b["text"], styles["h3"]))
        elif bt == "para":
            story.append(Paragraph(inline_format(b["text"]), styles["body"]))
        elif bt == "table":
            story.extend(build_table(b, styles))
        elif bt == "bullet":
            story.extend(build_bullet_list(b["items"], styles, ordered=False))
        elif bt == "ol":
            story.extend(build_bullet_list(b["items"], styles, ordered=True))
        elif bt == "tip":
            story.extend(build_callout(b, styles, "tip"))
        elif bt == "warn":
            story.extend(build_callout(b, styles, "warn"))
        elif bt == "hrule":
            story.append(Spacer(1, 8))

    doc.build(story)
    return output_path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    out = build_pdf(args.source, args.output)
    print(f"OK: generated {out}")


if __name__ == "__main__":
    main()
