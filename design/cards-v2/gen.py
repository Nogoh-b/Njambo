"""Générateur des illustrations de cartes Njambo v2 (SVG). Usage: python3 gen.py"""
import math, random

PAL = dict(gold="#f2bb45", copper="#c75b3a", teal="#10b7a6", cobalt="#3154d4", pink="#d83c68",
           night="#1c1741", cream="#fff0d0", chalk="#fff8e8")

def rays(cx, cy, n, r0, r1, w, fill, op, rot=0):
    out = []
    for i in range(n):
        a = math.radians(rot + i * 360 / n)
        a1, a2 = a - w, a + w
        out.append(f'<path d="M{cx+r0*math.cos(a1):.1f} {cy+r0*math.sin(a1):.1f} L{cx+r1*math.cos(a):.1f} {cy+r1*math.sin(a):.1f} L{cx+r0*math.cos(a2):.1f} {cy+r0*math.sin(a2):.1f}Z"/>')
    return f'<g fill="{fill}" opacity="{op}">' + "".join(out) + "</g>"

def ring_items(cx, cy, r, n, tpl, rot=0):
    s = ""
    for i in range(n):
        a = rot + i * 360 / n
        x = cx + r * math.cos(math.radians(a - 90)); y = cy + r * math.sin(math.radians(a - 90))
        s += tpl(x, y, a, i)
    return s

def bead(x, y, r, col):
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{col}" stroke="#7a4a12" stroke-width="{r*.18:.1f}"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="url(#beadShade)"/>'
            f'<ellipse cx="{x-r*.35:.1f}" cy="{y-r*.4:.1f}" rx="{r*.32:.1f}" ry="{r*.2:.1f}" fill="#fff" opacity=".85"/>')

def zigzag_ring(cx, cy, r, amp, n, stroke, sw):
    pts = []
    for i in range(n * 2 + 1):
        a = math.radians(i * 180 / n)
        rr = r + (amp if i % 2 else -amp)
        pts.append(f"{cx+rr*math.cos(a):.1f},{cy+rr*math.sin(a):.1f}")
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>'

def sparkle(x, y, s, col="#fffbe8"):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="{col}">'
            '<path d="M0 -30 C3 -8 8 -3 30 0 C8 3 3 8 0 30 C-3 8 -8 3 -30 0 C-8 -3 -3 -8 0 -30Z"/>'
            '<circle r="5" fill="#fff"/></g>')

def bokeh(w, h, n, seed, cols, rmin=6, rmax=26, opmax=.35):
    rnd = random.Random(seed); s = ""
    for _ in range(n):
        s += (f'<circle cx="{rnd.uniform(0,w):.0f}" cy="{rnd.uniform(0,h):.0f}" r="{rnd.uniform(rmin,rmax):.0f}" '
              f'fill="{rnd.choice(cols)}" opacity="{rnd.uniform(.08,opmax):.2f}"/>')
    return f'<g filter="url(#blur6)">{s}</g>'

def strip(x, y, w, h, unit=1.0):
    cols = [(PAL["gold"], 40), (PAL["copper"], 22), (PAL["teal"], 34), ("#5b7cff", 26), (PAL["pink"], 22)]
    s = ""; cx = x; i = 0
    while cx < x + w:
        c, ww = cols[i % 5]; ww *= unit
        s += f'<rect x="{cx:.1f}" y="{y}" width="{min(ww, x+w-cx):.1f}" height="{h}" fill="{c}"/>'
        cx += ww; i += 1
    # triangles noirs façon ndop sur le bandeau
    t = ""; tx = x
    while tx < x + w - 10:
        t += f'<path d="M{tx:.1f} {y+h} l{h*.6:.1f} {-h*.55:.1f} l{h*.6:.1f} {h*.55:.1f}Z" fill="#1c1741" opacity=".35"/>'
        tx += h * 2.4
    return s + t + f'<rect x="{x}" y="{y}" width="{w}" height="{h*.22:.1f}" fill="#fff" opacity=".35"/>'

COMMON_DEFS = '''
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#fff6cf"/><stop offset=".25" stop-color="#f7c95a"/><stop offset=".5" stop-color="#ffe9a0"/>
  <stop offset=".75" stop-color="#e3a234"/><stop offset="1" stop-color="#a86a16"/></linearGradient>
<linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff6cf"/><stop offset=".45" stop-color="#f2bb45"/><stop offset="1" stop-color="#9a5e10"/></linearGradient>
<radialGradient id="beadShade" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
<radialGradient id="shell" cx="36%" cy="28%" r="80%">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fff6e2"/><stop offset=".7" stop-color="#f4d29c"/><stop offset="1" stop-color="#c58a3c"/></radialGradient>
<linearGradient id="slit" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3e170a"/><stop offset=".5" stop-color="#7a3416"/><stop offset="1" stop-color="#3e170a"/></linearGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glowS" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="blur6" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#2a0c2a" flood-opacity=".55"/></filter>
<filter id="emboss" x="-10%" y="-10%" width="120%" height="120%">
  <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#3a1a04" flood-opacity=".7"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .85  0 0 0 .9 -.35"/></filter>
<radialGradient id="vignette" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="#1c0a2a" stop-opacity="0"/><stop offset="1" stop-color="#1c0a2a" stop-opacity=".55"/></radialGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></linearGradient>
'''

def cowrie(rx=100, ry=140, teeth=7):
    t = ""
    for k in range(teeth):
        yy = -ry*.6 + k * (ry*1.2/(teeth-1))
        wdt = rx*.22 * (1 - abs(yy)/(ry*1.1))
        t += (f'<line x1="{-wdt-4:.1f}" y1="{yy:.1f}" x2="-4" y2="{yy:.1f}"/>'
              f'<line x1="{wdt+4:.1f}" y1="{yy:.1f}" x2="4" y2="{yy:.1f}"/>')
    return (f'<ellipse rx="{rx}" ry="{ry}" fill="url(#shell)" stroke="#a8702a" stroke-width="{rx*.05:.1f}"/>'
            f'<ellipse rx="{rx*.82:.1f}" ry="{ry*.86:.1f}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="{rx*.04:.1f}"/>'
            f'<path d="M0 {-ry*.8:.1f} C{rx*.26:.1f} {-ry*.35:.1f} {rx*.26:.1f} {ry*.35:.1f} 0 {ry*.8:.1f} C{-rx*.26:.1f} {ry*.35:.1f} {-rx*.26:.1f} {-ry*.35:.1f} 0 {-ry*.8:.1f}Z" fill="url(#slit)"/>'
            f'<g stroke="#fff8ea" stroke-width="{rx*.075:.1f}" stroke-linecap="round">{t}</g>'
            f'<ellipse cx="{-rx*.45:.1f}" cy="{-ry*.42:.1f}" rx="{rx*.16:.1f}" ry="{ry*.32:.1f}" fill="#fff" opacity=".8" filter="url(#blur3)" transform="rotate(12 {-rx*.45:.1f} {-ry*.42:.1f})"/>'
            f'<ellipse cx="{rx*.55:.1f}" cy="{ry*.35:.1f}" rx="{rx*.1:.1f}" ry="{ry*.22:.1f}" fill="#fff" opacity=".35" filter="url(#blur3)"/>')

def power_frame(W=720):
    """Cadre commun à toutes les cartes de pouvoir : bord doré biseauté, coins ornés, grain, vignette, reflet."""
    c = lambda x, y, r: (f'<g transform="translate({x} {y}) rotate({r})">'
                         '<path d="M0 0 h70 l-70 70z" fill="url(#gold)" filter="url(#emboss)"/>'
                         '<path d="M12 12 h34 l-34 34z" fill="#d83c68"/>'
                         + bead(30, 30, 6, PAL["teal"]) + '</g>')
    return (f'<rect width="{W}" height="{W}" fill="url(#vignette)"/>'
            f'<rect width="{W}" height="{W}" filter="url(#grain)" opacity=".22"/>'
            f'<rect width="{W}" height="{W}" fill="url(#sheen)"/>'
            f'<rect x="8" y="8" width="{W-16}" height="{W-16}" rx="22" fill="none" stroke="url(#gold)" stroke-width="16" filter="url(#emboss)"/>'
            f'<rect x="20" y="20" width="{W-40}" height="{W-40}" rx="14" fill="none" stroke="#fff6cf" stroke-opacity=".6" stroke-width="2"/>'
            f'<rect x="28" y="28" width="{W-56}" height="{W-56}" rx="10" fill="none" stroke="#fff6cf" stroke-opacity=".5" stroke-width="2" stroke-dasharray="1 9" stroke-linecap="round"/>'
            + c(16, 16, 0) + c(W-16, 16, 90) + c(W-16, W-16, 180) + c(16, W-16, 270))

def svg(w, h, defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{COMMON_DEFS}{defs}</defs>{body}</svg>'

# ───────────────────────── DOS DE CARTE ─────────────────────────
def card_back():
    W, H, cx, cy = 900, 1260, 450, 630
    defs = '''
    <radialGradient id="bgB" cx="50%" cy="50%" r="72%"><stop offset="0" stop-color="#7d97ff"/><stop offset=".3" stop-color="#4a6af0"/><stop offset=".65" stop-color="#3154d4"/><stop offset="1" stop-color="#22186a"/></radialGradient>
    <radialGradient id="haloB" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8"/><stop offset=".35" stop-color="#ffd86e" stop-opacity=".55"/><stop offset="1" stop-color="#ffd86e" stop-opacity="0"/></radialGradient>
    <pattern id="ndopB" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M36 4 L68 36 L36 68 L4 36Z" fill="none" stroke="#c9d4ff" stroke-opacity=".35" stroke-width="2.5"/>
      <path d="M36 16 L56 36 L36 56 L16 36Z" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
      <path d="M36 28 L44 36 L36 44 L28 36Z" fill="#ffd86e" fill-opacity=".45"/>
      <circle cx="0" cy="0" r="4" fill="#fff3c2" fill-opacity=".55"/><circle cx="72" cy="0" r="4" fill="#fff3c2" fill-opacity=".55"/>
      <circle cx="0" cy="72" r="4" fill="#fff3c2" fill-opacity=".55"/><circle cx="72" cy="72" r="4" fill="#fff3c2" fill-opacity=".55"/></pattern>
    <radialGradient id="medal" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#5b7cff"/><stop offset="1" stop-color="#1c1741"/></radialGradient>
    <clipPath id="inB"><rect x="62" y="62" width="776" height="1136" rx="34"/></clipPath>
    <radialGradient id="cornerGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".7"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>'''
    # rosace de coin
    def rosette(x, y, s):
        r = f'<g transform="translate({x} {y}) scale({s})"><circle r="70" fill="url(#cornerGlow)"/>'
        r += rays(0, 0, 12, 22, 52, .14, "url(#gold)", 1)
        r += f'<circle r="26" fill="#1c1741" stroke="url(#gold)" stroke-width="5"/>' + bead(0, 0, 12, PAL["pink"]) + '</g>'
        return r
    body = f'<rect width="{W}" height="{H}" rx="56" fill="#170f3a"/>'
    body += f'<rect x="14" y="14" width="{W-28}" height="{H-28}" rx="46" fill="url(#gold)" filter="url(#emboss)"/>'
    body += f'<rect x="30" y="30" width="{W-60}" height="{H-60}" rx="40" fill="#22186a"/>'
    body += '<g clip-path="url(#inB)">'
    body += f'<rect width="{W}" height="{H}" fill="url(#bgB)"/><rect width="{W}" height="{H}" fill="url(#ndopB)"/>'
    body += rays(cx, cy, 24, 0, 900, .035, "#fff6d0", .22)
    body += bokeh(W, H, 40, 3, ["#fff6d0", "#10b7a6", "#d83c68", "#ffd86e"], 6, 22, .45)
    # bandeaux
    for yy in (168, 1060):
        body += f'<rect x="62" y="{yy-6}" width="776" height="44" fill="url(#gold)"/>' + strip(62, yy, 776, 32)
    # arches en haut / bas
    for flip in (1, -1):
        y0 = 168 if flip == 1 else 1092
        body += f'<path d="M150 {y0} Q450 {y0+flip*170} 750 {y0}" fill="none" stroke="url(#gold)" stroke-width="6"/>'
        body += f'<path d="M190 {y0} Q450 {y0+flip*130} 710 {y0}" fill="none" stroke="#fff6cf" stroke-opacity=".6" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>'
        body += bead(450, y0 + flip*86, 14, PAL["teal"])
    body += '</g>'
    body += f'<rect x="62" y="62" width="776" height="1136" rx="34" fill="none" stroke="url(#gold)" stroke-width="8" filter="url(#emboss)"/>'
    body += f'<rect x="82" y="82" width="736" height="1096" rx="26" fill="none" stroke="#fff6cf" stroke-opacity=".7" stroke-width="2" stroke-dasharray="1 11" stroke-linecap="round"/>'
    for (x, y) in ((122, 122), (778, 122), (122, 1138), (778, 1138)):
        body += rosette(x, y, .9)
    # médaillon central
    body += f'<circle cx="{cx}" cy="{cy}" r="380" fill="url(#haloB)"/>'
    body += f'<g filter="url(#glow)">{rays(cx, cy, 16, 200, 300, .1, "url(#goldV)", 1)}{rays(cx, cy, 16, 200, 255, .07, "#fff6cf", 1, 11.25)}</g>'
    body += f'<circle cx="{cx}" cy="{cy}" r="212" fill="url(#gold)" filter="url(#shadow)"/>'
    body += f'<circle cx="{cx}" cy="{cy}" r="198" fill="#1c1741"/>'
    body += zigzag_ring(cx, cy, 184, 8, 36, PAL["teal"], 6)
    body += f'<circle cx="{cx}" cy="{cy}" r="168" fill="url(#medal)" stroke="url(#gold)" stroke-width="5"/>'
    body += f'<circle cx="{cx}" cy="{cy}" r="168" fill="url(#ndopB)" opacity=".8"/>'
    cols = [PAL["pink"], PAL["gold"], PAL["teal"], "#fff6cf"]
    body += ring_items(cx, cy, 145, 24, lambda x, y, a, i: bead(x, y, 7 if i % 2 else 9, cols[i % 4]))
    body += f'<circle cx="{cx}" cy="{cy}" r="125" fill="url(#haloB)"/>'
    body += f'<g transform="translate({cx} {cy})" filter="url(#shadow)">{cowrie(70, 102)}</g>'
    body += sparkle(450, 300, 1.1) + sparkle(450, 960, 1.1) + sparkle(260, 470, .55) + sparkle(640, 790, .55) + sparkle(650, 450, .4) + sparkle(250, 820, .4)
    body += f'<rect x="14" y="14" width="{W-28}" height="{H-28}" rx="46" filter="url(#grain)" opacity=".15"/>'
    body += f'<rect x="14" y="14" width="{W-28}" height="{H-28}" rx="46" fill="url(#sheen)"/>'
    return svg(W, H, defs, body)

# ───────────────────────── CAURIS CHANCEUX ─────────────────────────
def cauris():
    W = 720; cx, cy = 360, 340
    defs = '''
    <radialGradient id="bgC" cx="50%" cy="46%" r="74%"><stop offset="0" stop-color="#fff7cf"/><stop offset=".2" stop-color="#ffd25a"/>
      <stop offset=".5" stop-color="#f0862f"/><stop offset=".78" stop-color="#b8325e"/><stop offset="1" stop-color="#4a1d6a"/></radialGradient>
    <radialGradient id="haloC" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".4" stop-color="#ffe28a" stop-opacity=".6"/><stop offset="1" stop-color="#ffe28a" stop-opacity="0"/></radialGradient>
    <radialGradient id="disc" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#2fd6c4"/><stop offset=".6" stop-color="#10b7a6"/><stop offset="1" stop-color="#065a58"/></radialGradient>'''
    body = f'<rect width="{W}" height="{W}" fill="url(#bgC)"/>'
    body += rays(cx, cy, 36, 0, 560, .04, "#fff8dc", .35) + rays(cx, cy, 12, 0, 560, .09, "#fff8dc", .18, 15)
    body += bokeh(W, W, 34, 11, ["#fff6d0", "#ffd86e", "#d83c68", "#10b7a6"], 5, 20, .5)
    # médaillon
    body += f'<circle cx="{cx}" cy="{cy}" r="290" fill="url(#haloC)"/>'
    body += f'<g filter="url(#shadow)"><circle cx="{cx}" cy="{cy}" r="236" fill="url(#gold)"/></g>'
    body += f'<circle cx="{cx}" cy="{cy}" r="222" fill="#6a1d4e"/>'
    body += zigzag_ring(cx, cy, 208, 9, 40, PAL["gold"], 5)
    body += f'<circle cx="{cx}" cy="{cy}" r="192" fill="url(#disc)" stroke="url(#gold)" stroke-width="6"/>'
    # motif ndop dans le disque
    tri = ""
    for i in range(16):
        a = math.radians(i * 22.5)
        x1, y1 = cx + 192*math.cos(a-.1), cy + 192*math.sin(a-.1)
        x2, y2 = cx + 192*math.cos(a+.1), cy + 192*math.sin(a+.1)
        x3, y3 = cx + 150*math.cos(a), cy + 150*math.sin(a)
        tri += f'<path d="M{x1:.1f} {y1:.1f} L{x3:.1f} {y3:.1f} L{x2:.1f} {y2:.1f}Z"/>'
    body += f'<g fill="#fff6cf" opacity=".55">{tri}</g>'
    body += f'<circle cx="{cx}" cy="{cy}" r="150" fill="none" stroke="#fff6cf" stroke-opacity=".7" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>'
    cols = [PAL["pink"], "#fff6cf", PAL["cobalt"], "#fff6cf"]
    body += ring_items(cx, cy, 236, 20, lambda x, y, a, i: bead(x, y, 13 if i % 2 == 0 else 9, cols[i % 4]))
    body += f'<circle cx="{cx}" cy="{cy}" r="160" fill="url(#haloC)"/>'
    # cauris
    body += '<g filter="url(#shadow)">'
    body += f'<g transform="translate({cx-138} {cy+70}) rotate(-34)">{cowrie(56, 80)}</g>'
    body += f'<g transform="translate({cx+138} {cy+70}) rotate(34)">{cowrie(56, 80)}</g>'
    body += f'<g transform="translate({cx} {cy-6})">{cowrie(96, 136)}</g></g>'
    # pluie de petits cauris
    rnd = random.Random(5)
    for (x, y, r, s) in ((110, 140, -20, .2), (620, 130, 25, .18), (640, 470, -40, .16), (90, 450, 40, .17), (560, 600, 10, .14), (170, 610, -15, .13)):
        body += f'<g transform="translate({x} {y}) rotate({r}) scale({s})" filter="url(#glowS)">{cowrie(100, 140)}</g>'
    body += sparkle(205, 210, 1.2) + sparkle(540, 215, .9) + sparkle(520, 520, .6) + sparkle(250, 490, .45) + sparkle(605, 330, .5)
    # cartouche bas
    body += f'<g filter="url(#shadow)"><path d="M150 640 Q360 600 570 640 L560 668 Q360 632 160 668Z" fill="url(#gold)"/></g>'
    body += ring_items(360, 1640, 1000, 1, lambda *a: "")
    body += "".join(bead(x, 646 - 26*math.exp(-((x-360)/180)**2), 8 if x != 360 else 12, c) for x, c in ((200, PAL["teal"]), (280, PAL["pink"]), (360, PAL["teal"]), (440, PAL["pink"]), (520, PAL["teal"])))
    body += power_frame(W)
    return svg(W, W, defs, body)

# ───────────────────────── FEU DE CAMP ─────────────────────────
def feu():
    W = 720
    defs = '''
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a8a"/><stop offset=".45" stop-color="#9a3a7a"/><stop offset=".75" stop-color="#ff8a3a"/><stop offset="1" stop-color="#ffc45a"/></linearGradient>
    <radialGradient id="fireHalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".25" stop-color="#ffd25a" stop-opacity=".8"/><stop offset=".6" stop-color="#ff8a3a" stop-opacity=".3"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/></radialGradient>
    <linearGradient id="fl1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e8323c"/><stop offset=".5" stop-color="#ff6a2a"/><stop offset="1" stop-color="#ffb43a"/></linearGradient>
    <linearGradient id="fl2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ffe066"/></linearGradient>
    <linearGradient id="fl3" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <linearGradient id="log" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb070"/><stop offset=".3" stop-color="#c8662e"/><stop offset="1" stop-color="#4e1e0c"/></linearGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8"/><stop offset=".45" stop-color="#d0845a"/><stop offset="1" stop-color="#6a2e2a"/></linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b84a3a"/><stop offset="1" stop-color="#4a1a3a"/></linearGradient>
    <pattern id="pagneP" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#d83c68"/><path d="M0 12 L12 0 L24 12 L12 24Z" fill="#f2bb45"/><circle cx="12" cy="12" r="3" fill="#1c1741"/></pattern>
    <pattern id="pagneT" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#10b7a6"/><path d="M0 0 L24 24 M24 0 L0 24" stroke="#fff6cf" stroke-width="3"/></pattern>'''
    body = f'<rect width="{W}" height="{W}" fill="url(#sky)"/>'
    # étoiles + lune
    rnd = random.Random(2); st = ""
    for _ in range(60):
        st += f'<circle cx="{rnd.uniform(30,690):.0f}" cy="{rnd.uniform(30,300):.0f}" r="{rnd.uniform(.8,2.6):.1f}" fill="#fff" opacity="{rnd.uniform(.4,1):.2f}"/>'
    body += st
    body += '<circle cx="585" cy="120" r="62" fill="#fff3c2" opacity=".25" filter="url(#blur6)"/><circle cx="585" cy="120" r="40" fill="#fff6dc"/><circle cx="602" cy="108" r="36" fill="#7a3a8a" opacity=".95"/>'
    # collines + palmiers en silhouette
    body += '<path d="M0 420 Q120 360 240 400 T480 380 T720 400 V720 H0Z" fill="#5a2470" opacity=".75"/>'
    def palm(x, y, s, flip=1):
        return (f'<g transform="translate({x} {y}) scale({s*flip} {s})" fill="#3a1a5a">'
                '<path d="M-4 0 Q4 -80 16 -160 L24 -160 Q12 -80 6 0Z"/>'
                '<path d="M20 -160 Q-30 -190 -80 -150 Q-30 -170 20 -158Z"/><path d="M20 -160 Q70 -195 120 -150 Q70 -175 20 -158Z"/>'
                '<path d="M20 -162 Q-10 -220 -50 -230 Q0 -205 20 -160Z"/><path d="M20 -162 Q60 -225 100 -220 Q50 -205 20 -160Z"/>'
                '<path d="M20 -160 Q-40 -150 -70 -100 Q-30 -140 20 -156Z"/><path d="M20 -160 Q80 -150 110 -100 Q70 -140 20 -156Z"/></g>')
    body += palm(70, 430, 1.0) + palm(660, 420, .9, -1) + palm(150, 420, .6)
    body += '<path d="M0 470 Q360 440 720 470 V720 H0Z" fill="url(#ground)"/>'
    body += '<circle cx="360" cy="440" r="330" fill="url(#fireHalo)"/>'
    # villageois assis (silhouettes éclairées, pagnes colorés)
    def villager(x, y, s, pat, flip=1):
        return (f'<g transform="translate({x} {y}) scale({s*flip} {s})">'
                '<path d="M-48 60 C-56 -10 -40 -64 0 -70 C40 -64 56 -10 48 60Z" fill="#3a1440"/>'
                f'<path d="M-46 60 C-52 10 -40 -20 -10 -26 L30 -20 C44 0 50 30 48 60Z" fill="url(#{pat})"/>'
                '<path d="M30 -60 C44 -52 50 -30 48 0" fill="none" stroke="#ffb45a" stroke-width="6" opacity=".8"/>'
                '<circle cy="-100" r="30" fill="#3a1440"/><path d="M14 -126 A30 30 0 0 1 22 -78" fill="none" stroke="#ffb45a" stroke-width="5" opacity=".9"/>'
                '<path d="M-30 -112 Q0 -150 30 -112 Q0 -124 -30 -112Z" fill="#d83c68"/></g>')
    body += villager(118, 540, 1.05, "pagneP") + villager(602, 540, 1.05, "pagneT", -1)
    body += villager(210, 500, .62, "pagneT") + villager(510, 500, .62, "pagneP", -1)
    # pierres
    stones = ""
    for i, (x, y) in enumerate(((205, 585), (270, 618), (360, 630), (450, 618), (515, 585))):
        stones += f'<ellipse cx="{x}" cy="{y}" rx="46" ry="26" fill="url(#stone)" stroke="#5a2420" stroke-width="3"/><ellipse cx="{x-6}" cy="{y-12}" rx="22" ry="7" fill="#fff3c2" opacity=".55"/>'
    body += f'<g filter="url(#shadow)">{stones}</g>'
    # bûches
    def log(rot, endx):
        return (f'<g transform="translate(360 565) rotate({rot})"><rect x="-155" y="-21" width="310" height="42" rx="21" fill="url(#log)" stroke="#3a1206" stroke-width="3"/>'
                '<path d="M-120 -8 H60 M-60 6 H110" stroke="#3a1206" stroke-width="3" opacity=".5"/>'
                f'<ellipse cx="{endx}" rx="15" ry="21" fill="#ffd9a0" stroke="#7a3a14" stroke-width="3"/><ellipse cx="{endx}" rx="7" ry="10" fill="none" stroke="#c8662e" stroke-width="2"/></g>')
    # braises sous le feu
    body += '<ellipse cx="360" cy="555" rx="110" ry="24" fill="#ffcf5a" filter="url(#blur6)" opacity=".9"/>'
    # flammes
    body += '<g filter="url(#glow)">'
    body += '<path d="M360 105 C395 190 520 250 488 395 C472 470 430 548 360 552 C290 548 248 470 232 395 C205 290 290 250 290 185 C322 228 335 250 346 275 C348 210 332 160 360 105Z" fill="url(#fl1)"/>'
    body += '<path d="M455 235 C505 320 505 425 452 492 C440 440 428 405 405 385 C430 340 452 290 455 235Z" fill="#ff6a2a"/>'
    body += '<path d="M262 270 C220 350 228 445 272 500 C280 448 292 412 312 390 C290 355 272 318 262 270Z" fill="#ff6a2a"/>'
    body += '<path d="M360 215 C392 292 452 335 430 432 C418 488 394 530 360 532 C326 530 298 492 292 444 C282 380 326 345 336 292 C348 315 354 335 357 352 C364 305 348 262 360 215Z" fill="url(#fl2)"/>'
    body += '<path d="M360 330 C384 386 408 420 398 470 C392 502 378 520 360 522 C342 520 326 502 322 474 C315 428 342 408 360 330Z" fill="url(#fl3)"/>'
    body += '</g>'
    body += log(-17, 155) + log(17, -155)
    body += '<ellipse cx="360" cy="548" rx="70" ry="14" fill="#fff3c2" opacity=".5" filter="url(#blur6)"/>'
    # étincelles en traînées
    sp = ""
    rnd = random.Random(9)
    for _ in range(26):
        x = rnd.uniform(220, 500); y = rnd.uniform(60, 330); l = rnd.uniform(8, 22)
        col = rnd.choice(["#fff3c2", "#ffd25a", "#ffe9a0", "#10b7a6", "#d83c68"])
        sp += f'<path d="M{x:.0f} {y:.0f} q{rnd.uniform(-6,6):.0f} {l/2:.0f} 0 {l:.0f}" stroke="{col}" stroke-width="{rnd.uniform(2,4):.1f}" stroke-linecap="round" fill="none"/>'
    body += f'<g filter="url(#glowS)">{sp}</g>'
    body += f'<rect x="28" y="666" width="664" height="26" fill="url(#gold)"/>' + strip(28, 670, 664, 18, .8)
    body += power_frame(W)
    return svg(W, W, defs, body)

if __name__ == "__main__":
    for name, fn in (("card-back", card_back), ("cauris_chanceux", cauris), ("feu_camp", feu)):
        open(f"{name}.svg", "w").write(fn())
    print("ok")
