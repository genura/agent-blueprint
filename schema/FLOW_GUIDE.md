<!-- flow-guide v21 -->
# .flow guide v21 (for agents)

**FLOW_GUIDE is 4 files with the same name. They are one guide.** Your diagram folder holds only `FLOW_GUIDE.md`
(this file). The other three files are in the guide folder `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide`; every path below that starts with `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide`
is a full path you can use as written.
This file is a copy written by the app; do not edit it (the master is `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.md`).
| file | what to do with it |
|---|---|
| `FLOW_GUIDE.md` | this file: read it as text |
| `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.flow` | read it as text: a diagram using every shape, color, fmt char, edge option, Section and group; each node's text (and each edge's label) names its own syntax |
| `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.png` | optional: look at it once as an image if you can view images; it is exactly how the app draws `FLOW_GUIDE.flow` (groups `&` are invisible, so they are only in the text) |
| `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.mjs` | the validator. **Do not read it, run it:** `node "C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.mjs" <file.flow>` (needs Node.js) |

If you are not allowed to read or run files in `C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide` (it may be outside your working folder), ask the user to give
you access to that folder. Without the validator you cannot check your edits.
Do not create or copy `FLOW_GUIDE.*` files into the diagram folder: the app writes `FLOW_GUIDE.md` there itself.

**Version note (remember it):** this guide's version is the number in the first line (`flow-guide vN`). Keep it in memory
after your first read. When asked to read the guide again, or when unsure it is current, open the first line of
`FLOW_GUIDE.md`: if the version differs from the one you remember (or you remember none), re-read the `.md` and
`C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.flow` (and look at the `.png` if you can), then remember the new version. If it is the same, do not re-read.

A `.flow` file is a diagram (boxes + arrows) drawn on a canvas in the Agent Blueprint app.
The user sees the same file live; when you save, the canvas updates immediately.
The file is the single source of truth: what is not written in it does not exist.

**Golden rule:** when asked to show, describe or draw a diagram, mirror the file exactly as written.
Same nodes, same arrows (same direction and sides), same shapes, colors, fonts, positions and texts.
Do not reorder the flow into what seems "logical", do not restyle, do not add anything.

**After every edit, run the validator.** Start with the short form; ask for details only when you will fix something:
```
node "C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.mjs" --summary path/to/file.flow                  # 1 line + counts per code; E_ lines always in full
node "C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.mjs" path/to/file.flow                            # every problem, one per line
node "C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.mjs" --only W_EDGE_THROUGH,W_SIDE path/to/file.flow  # only these codes (a prefix like W_EDGE works too)
```
Fix every `E_` error; fix `W_` warnings unless they are intended.
Output: a summary line, then `<line number> <CODE> <message>` lines. Exit code 1 = errors (in every mode).
- Errors (`E_...`): the app cannot read that line and will drop it on the user's next edit.
- Warnings (`W_...`): the file is valid but the drawing is likely wrong. They describe the drawing in text, so you
  do not need to see it. Arrows are computed exactly as the app draws them.
  | code | meaning | usual fix |
  |---|---|---|
  | `W_SECTION` | the app will move the node into or out of a Section | fix x y, or the `@section` |
  | `W_SECTION_EDGE` | box crosses a Section border | move it fully in or out |
  | `W_OVERLAP` | two boxes (or Sections) overlap | move one |
  | `W_TEXT_OVERFLOW` | text likely does not fit (gives a height) | raise h, widen w, or write h as `-` |
  | `W_EDGE_THROUGH` | an arrow passes through another box | move a box, set `:XY`, or bend with `@dx,dy` |
  | `W_EDGE_CROSS` | two arrows cross (long lists are cut at 15 + total) | reorder boxes or change sides |
  | `W_SIDE_BACK` | a written `:XY` side faces away from the other box, the arrow loops back | pick the facing side or `*` |
  | `W_LABEL_OVERLAP` | an arrow label covers a box or another label | move boxes apart or shorten the label |
  | `W_PARENT`, `W_SELF_EDGE` | `@x` is not a Section; edge to itself (not drawn) | fix the line |
- It only reads the files you give it: it writes nothing and uses no network.

## Cheat sheet (enough for most edits; details in the sections below)
```
node:   id[@section] shape[.fmt] color x y w h text
edge:   from>to[/opts] label   (from, to: a node id, or x,y = free end attached to nothing)
group:  &id,id,id            (select/move together; nothing drawn; after all node lines)
comment: # anything          (kept by the app, attached to the line below it)
shape:  rect round pill circle diamond db text group(=Section) table
fmt:    s m l x (font size) < ^ > (align) 0-3 (border width) ~ (dashed) M O W (font) =X (border color)
color:  k g r o y n t b v p w | UPPERCASE = light tint | - none | #RRGGBB
opts:   color | elbow  _ straight  - no arrow  1-3 width  ~ dashed  :XY exit/entry side (t r b l *)  @dx,dy bend
        <X start tip  >X end tip   (X: a line arrow, t triangle, d diamond, c circle, n none)   ^ drawn above the nodes
x y:    top-left corner, x right, y DOWN; inside a Section x y are relative to it
w h:    pixels; "-" = auto (x y: placed below; w: shape default; h: fits the text, the app writes the number)
text:   **bold** ~~strike~~, "- " bullet, \n new line; table cells a|b\nc|d
```

## 1. Line types
Every line is one of these. The first characters decide it.
- Node (a box): `id[@section] shape[.fmt] color x y w h text`
- Edge (an arrow): `from>to[/opts] label` (no spaces inside `from>to/opts`). `from` and `to` are node ids or free points `x,y`
- Group (nodes that select and move together, invisible): `&id,id,id` (see section 8)
- Comment: starts with `#`. The first line is the app's header comment; leave it. Your own comments are kept (section 9).

Fields are separated by single spaces. Only the last field (`text` / `label`) may contain spaces.

## 2. Node fields, in order
| # | field | meaning | example |
|---|---|---|---|
| 1 | `id` | unique short name, used by edges | `n1`, `db1` |
| 1b | `@section` | optional, glued to id: this node sits inside the Section node `section` (a node whose shape is `group`) | `a@g1` |
| 2 | `shape` | `rect` box, `round` rounded box, `pill` capsule, `circle` ellipse, `diamond` decision, `db` cylinder, `text` free text (no box), `group` Section (visible titled frame around other nodes), `table` grid | `pill` |
| 2b | `.fmt` | optional style chars glued to shape, any order (see 4) | `rect.lO=v` |
| 3 | `color` | fill color code (see 5) | `t` |
| 4 | `x` | left edge, canvas pixels | `1464` |
| 5 | `y` | top edge, canvas pixels | `488` |
| 6 | `w` | width in pixels | `416` |
| 7 | `h` | height in pixels, or `-` = fit the text | `176` |
| 8 | `text` | rest of the line, shown inside the node | `catalogue manager` |

Coordinates (x y w h):
- Origin is arbitrary; values can be negative. **x grows to the right, y grows DOWN** (screen coordinates).
- `x y` is the node's **top-left corner**, not its center. Center = `x+w/2, y+h/2`.
- A node with smaller `y` is **above** one with larger `y`. Compare numbers; do not assume line order = layout.
- `-` means "auto": unknown `x y` = placed below the existing nodes; unknown `w` = shape default width.
- `h` as `-`: the app measures the text at width `w` and writes the real height (at least 48) into the file.
  Use it whenever you are not sure the text fits. (Not for `text`, `table` and `group`.)
- `text` shape: `w h` are always `- -` (it sizes itself).
- Inside a Section (`@g1`), `x y` are relative to the Section's top-left corner.

## 3. Edge fields
`from>to` draws an arrow **from** the first id **to** the second id (arrowhead at `to`).
`a>b` and `b>a` are different. Optional `/opts`, then optional label (shown at the middle of the arrow).

opts, any order, all optional:
| char | meaning | default |
|---|---|---|
| color code | arrow color (see 5) | `g` gray |
| `\|` | elbow (right angles) | curved |
| `_` | straight line | curved |
| `-` | no arrowhead at `to` (same as `>n`) | arrowhead at `to` |
| `<X` | tip drawn at the `from` end (start). X = `a` line arrow, `t` filled triangle, `d` filled diamond, `c` filled circle, `n` none | `n` none |
| `>X` | tip drawn at the `to` end (end). Same X letters | `a` line arrow |
| `^` | the edge is drawn above all nodes (it stays visible where it passes over a box) | drawn below all nodes |
| `1` `2` `3` | line width thin / normal / thick | `2` |
| `~` | dashed | solid |
| `:XY` | side where the arrow leaves `from` (X) and enters `to` (Y): `t` top `r` right `b` bottom `l` left `*` auto | nearest sides |
| `@dx,dy` | bend: middle point pushed by dx,dy pixels | none |

Example: `n4>n7/:rl` = arrow from n4's right side to n7's left side, gray, curved, with arrowhead.
`n7>n8/:rb` = leaves n7 on the right, enters n8 from the bottom (so it goes up into n8).

Tips (`<X`, `>X`) only change the drawing at the two ends. They never change the direction: `a>b/<a` is still an edge
from a to b, drawn with an arrowhead at both ends. `a>b/<c>t` = filled circle at a, filled triangle at b.
The app does not write defaults: it writes `-` for "no tip at `to`", and never writes `<n` or `>a`.

Free end: `from` or `to` can be a point `x,y` instead of a node id. The arrow then starts or ends exactly at that point
and is attached to nothing. x y are whole canvas pixels, always absolute (never relative to a Section).
`n3>600,200` = arrow from n3 to the point (600,200). `40,500>120,500/_-` = a free straight line, no box at either end.
Both ends can be free. `:XY` has no meaning at a free end; write `*` there if you set the other side.

## 4. fmt chars (node style)
| char | meaning | default |
|---|---|---|
| `s` `m` `l` `x` | font size 15 / 20 / 28 / 40 px | `s` (`m` for `text`) |
| `<` `^` `>` | text align left / center / right | center (left if text has several lines) |
| `0` `1` `2` `3` | border width none / 1.5 / 3 / 6 px | `2` (`1` for table, group) |
| `~` | dashed border | solid |
| `M` `O` `W` | font Montserrat / Orbitron / Work Sans | Google Sans |
| `=X` | border color, X = color code (see 5) | derived from fill |

Example: `rect.lO=v` = rect, large font, Orbitron, violet border.
Careful: inside fmt, `l` is "large font", not "left"; `O` is Orbitron, not orange.

## 5. Color codes
| code | color | light tint |
|---|---|---|
| `k` | black #1E1E1E | `K` #B3B3B3 |
| `g` | gray #757575 | `G` #D9D9D9 |
| `r` | red #E5533B | `R` #F7C6BF |
| `o` | orange #F5A352 | `O` #FBDFC3 |
| `y` | yellow #F7CB57 | `Y` #FDEDC5 |
| `n` | green #7DD17F | `N` #D4F2D5 |
| `t` | teal #75D6CC | `T` #CFF7F3 |
| `b` | blue #64B1F9 | `B` #CDE5FB |
| `v` | violet #9150F5 | `V` #DCCBFC |
| `p` | pink #EB52BE | `P` #F6CCEB |
| `w` | white #FFFFFF | |

- `-` = no fill (transparent). `#RRGGBB` = any custom color.
- Text inside fills `k g r v p` is white; on all others it is black.
- For the `text` shape, color is the text color.

## 6. Text
- Markdown: `**bold**`, `~~strike~~`, a line starting with `- ` is a bullet.
- `\n` (backslash + n) = new line. The whole text stays on one file line.
- `table`: cells split by `|`, rows by `\n` (`\|` = literal pipe). E.g. `Name|Age\nAli|30`.
- `group` (Section): text is its title, shown above its top-left corner (the app names new ones "Section 1", "Section 2"...).

## 7. Reading a file (describing or redrawing it)
1. List every node line: id, shape, colors, position, size, text. Use the real numbers.
2. List every edge exactly as written: `from>to`, its sides and style. Never reverse or skip one.
3. Lay nodes out by their x y (left/right by x, up/down by y). Keep shapes, colors, fonts.
   Draw each arrow leaving and entering the sides written in `:XY`.
4. Do not invent anything: no extra nodes, Sections, groups, arrows, subtitles, colors or "improvements".
   If something looks wrong in the diagram, say so; do not silently fix it.
5. Before answering, check your result against the file line by line: same node count, same edge count,
   every `from>to` pair, shape, color code and x y matches. Fix any difference first.

## 8. Editing a file
- Change only the lines that need to change. Never rewrite or reformat the whole file.
- Never change existing ids. New nodes get short unique ids (`n12`, `db1`).
- New node, unknown position: write `- - - -` for x y w h; the app places it. Unsure the text fits: write `h` as `-`.
- New edges: don't write `:XY` or `@`; the app picks sides. Existing `:XY` were set by the user: keep them.
- Don't write defaults (e.g. `/g`, `.s`, `.2`); leave them out.
- A Section's line must come before its children. Keep each child fully inside its Section's w h:
  in the app a node belongs to the smallest Section that fully contains it. Sections can nest (`g2@g1`).
- Group line `&a,b,c`: lists 2+ existing node ids that select and move together (like Figma groups; nothing is drawn).
  Put it after all node lines, before edges. It does not touch edges: edges stay attached to the individual nodes,
  never to the group. Add/remove a line to group/ungroup; keep existing ones.
  Groups can nest: write a bigger line containing a smaller one (`&a,b,c` and `&a,b` = group [a,b] inside group [a,b,c]).
  Two groups must be either disjoint or one fully inside the other (partial overlap is an error); no duplicate lines.
  In the app, ungrouping removes only the outermost layer, so keep inner lines when removing an outer one.
- Several edges between the same two nodes are allowed.
- Later node lines are drawn on top of earlier node lines. Edges have only two layers, set by the `^` option and not
  by line order: below all nodes (default) or above all nodes (`^`). Edge labels are always on top.
- Then run the validator (`node "C:/Users/Cuneyt/Documents/Projects/agent-blueprint/guide/FLOW_GUIDE.mjs" <file.flow>`) and fix what it reports.

## 9. What the app does to the file
When the user edits the diagram (or a `-` value is resolved), the app writes the whole file again. Expect these changes;
they are not mistakes and you should not undo them:
- Your `#` comments are kept. Each comment block stays attached to the line right below it (node, edge or group line).
  If that line is deleted, the comment moves to the end of the file. Comments at the top stay at the top.
- Default values are removed and opts/fmt chars are written in a fixed order (e.g. `/v3~|` becomes `/v|3~`).
- `-` values become numbers (`h -` becomes the measured height).
- Node lines: Sections come before their children; a node fully inside a Section gets `@section`, a node moved out loses it.
- Group lines come after all node lines, biggest group first. Edges come last.
- Invalid lines (validator `E_` codes) are shown as errors in the app and dropped.
- The first line (header comment) is rewritten by the app.

## 10. Worked example
```
g1 group w 0 0 520 320 Checkout
a@g1 rect.l y 40 40 220 160 **Cart**\n- items\n- total
b db.O=v B 600 40 160 120 Orders DB
# invoice is created after the order is saved
c rect w - - 240 - Invoice
a>b/| saves
b>c/r~ triggers
&a,c
```
How to read it:
- `g1`: white Section, top-left (0,0), 520x320, titled "Checkout".
- `a`: inside g1 at (40,40) relative, so absolute (40,40); yellow rect 220x160, large font,
  text "**Cart**" then two bullets "items", "total".
- `b`: light blue cylinder at (600,40), 160x120, Orbitron font, violet border, text "Orders DB".
  Its x (600) is greater than g1's right edge (0+520), so it is to the right of the Section, outside it.
- `# invoice ...`: a comment; the app keeps it above the `c` line.
- `c`: white rect, position auto (placed below the others), width 240, height fitted to its text, text "Invoice".
- `a>b/| saves`: gray elbow arrow from a to b, labeled "saves".
- `b>c/r~ triggers`: red dashed curved arrow from b to c, labeled "triggers".
- `&a,c`: a and c are grouped (selected and moved together); b is not.

## 11. Writing a file from a picture (screenshot, export, photo, sketch)
A picture has no fixed scale: it is often enlarged (exports are commonly 2x). Do not copy pixel numbers from it.
1. Find the scale first. In the app a normal box border and a normal edge line are 3 px wide, and most text is 15 px
   high. If they look about twice that in the picture, the picture is 2x: divide every measured distance by 2
   (by the factor you found). Then round x y w h to multiples of 8.
2. Sizes are relative, not absolute. Most text is size `s` and most borders and lines are width `2` (the defaults:
   write nothing). Write `m l x`, or width `1` / `3`, only for an item that is clearly bigger, thinner or thicker
   than the other items in the same picture. If every line looks equally thick, they are all the default.
3. Look at both ends of every edge and write what you see:
   | at the `to` end | write | at the `from` end | write |
   |---|---|---|---|
   | two open strokes (plain arrow) | nothing | nothing | nothing |
   | filled triangle | `>t` | plain arrow | `<a` |
   | filled diamond / filled circle | `>d` / `>c` | filled triangle / diamond / circle | `<t` / `<d` / `<c` |
   | nothing | `-` | | |
4. `^`: write it only when a line is visibly drawn over a box it crosses. A line hidden behind a box has no `^`.
5. Bends: a normal curved or elbow line between two sides needs no `@dx,dy`. Write a bend only when the line
   clearly detours away from that natural path. Write `:XY` for the sides where the line leaves and enters.
6. A picture cannot show groups (`&` lines) or comments. Do not invent them.
