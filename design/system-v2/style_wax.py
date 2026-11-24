"""Itération B « Wax festif » : style autocollant — contours épais, aplats ombrés,
tissus wax, silhouettes propres à chaque asset (paquets cadeaux, tickets verticaux,
livres ouverts, blasons de formes différentes pour les rangs)."""
import math, random

C = 256
OUT = "#2b1408"; SW = 7
COL = {  # base, ombre
    "fuchsia": ("#ff3d97", "#c41a6c"), "mango": ("#ffb81e", "#e0820a"), "turq": ("#13d8c2", "#0a9a8a"),
    "violet": ("#7b5cff", "#4f34d0"), "red": ("#ff5a3c", "#c8321c"), "cream": ("#fff3dc", "#efcf9e"),
    "gold": ("#ffd23e", "#e3940e"), "silver": ("#e8edf6", "#a9b4c8"), "bronze": ("#f0a066", "#b55e28"),
    "brown": ("#9a5a2a", "#6a3812"), "night": ("#3a2a7a", "#24185a"), "sky": ("#8fd8ff", "#4aa6e0"),
}
_n = [0]
def uid(p="w"):
    _n[0] += 1
    return f"{p}{_n[0]}"

DEFS = '''
<pattern id="wDots" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="5" fill="#fff" fill-opacity=".45"/><circle cx="23" cy="23" r="5" fill="#fff" fill-opacity=".45"/><circle cx="23" cy="8" r="2" fill="#2b1408" fill-opacity=".25"/><circle cx="8" cy="23" r="2" fill="#2b1408" fill-opacity=".25"/></pattern>
<pattern id="wRings" width="46" height="46" patternUnits="userSpaceOnUse"><circle cx="23" cy="23" r="16" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5"/><circle cx="23" cy="23" r="6" fill="#2b1408" fill-opacity=".22"/><circle cx="0" cy="0" r="5" fill="#fff" fill-opacity=".4"/><circle cx="46" cy="46" r="5" fill="#fff" fill-opacity=".4"/></pattern>
<pattern id="wZig" width="36" height="24" patternUnits="userSpaceOnUse"><path d="M0 16 L9 6 L18 16 L27 6 L36 16" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linejoin="round"/></pattern>
<pattern id="wStripe" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="12" height="28" fill="#fff" fill-opacity=".38"/></pattern>
<filter id="wSh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="0" flood-color="#2b1408" flood-opacity=".28"/></filter>
'''

def circ(cx, cy, r):
    return f"M{cx-r} {cy} a{r} {r} 0 1 0 {2*r} 0 a{r} {r} 0 1 0 {-2*r} 0Z"

def poly(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"

def wobble(cx, cy, r, amp, n, seed=1, k=72):
    rnd = random.Random(seed); ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    pts = []
    for i in range(k):
        a = i*2*math.pi/k
        rr = r + amp*math.sin(n*a + ph[0]) + amp*.5*math.sin((n+2)*a + ph[1])
        pts.append((cx + rr*math.cos(a), cy + rr*math.sin(a)))
    return poly(pts)

def scallop(cx, cy, r, n, amp, k=180):
    return poly([(cx + (r + amp*math.cos(n*i*2*math.pi/k))*math.cos(i*2*math.pi/k),
                  cy + (r + amp*math.cos(n*i*2*math.pi/k))*math.sin(i*2*math.pi/k)) for i in range(k)])

def starp(cx, cy, n, r1, r2, rot=-90):
    return poly([(cx + (r1 if i % 2 == 0 else r2)*math.cos(math.radians(rot + i*180/n)),
                  cy + (r1 if i % 2 == 0 else r2)*math.sin(math.radians(rot + i*180/n))) for i in range(2*n)])

def toon(d, col, pat=None, pop=.0, shade=(9, 11), sw=SW, hl=True):
    """Aplat ombré façon autocollant : ombre propre en bas à droite, motif wax, contour épais."""
    base, dark = COL[col] if col in COL else (col, col)
    i = uid()
    s = f'<clipPath id="{i}"><path d="{d}"/></clipPath><g clip-path="url(#{i})">'
    s += f'<path d="{d}" fill="{dark}"/><path d="{d}" fill="{base}" transform="translate({-shade[0]} {-shade[1]})"/>'
    if pat:
        s += f'<rect x="-600" y="-600" width="1700" height="1700" fill="url(#{pat})" opacity="{.9 if not pop else pop}"/>'
    if hl:
        s += f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="10" transform="translate(7 9)" style="mix-blend-mode:soft-light"/>'
    s += '</g>'
    return s + f'<path d="{d}" fill="none" stroke="{OUT}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>'

def shine(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})"><path d="M0 -26 Q3 -3 26 0 Q3 3 0 26 Q-3 3 -26 0 Q-3 -3 0 -26Z" fill="#fff" stroke="{OUT}" stroke-width="4" stroke-linejoin="round"/></g>')

def gloss(x, y, rx, ry, rot=-30):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#fff" opacity=".85" transform="rotate({rot} {x} {y})"/>'

def backdrop(col, seed, r=212):
    """Tache de couleur derrière l'objet (fond d'autocollant)."""
    base = COL[col][0]
    return (f'<path d="{wobble(C, C+6, r, 10, 5, seed)}" fill="{base}" opacity=".28"/>'
            f'<path d="{wobble(C, C+6, r-22, 8, 4, seed+3)}" fill="none" stroke="{base}" stroke-opacity=".55" stroke-width="5" stroke-dasharray="2 16" stroke-linecap="round"/>')

def confetti(seed, n=10):
    rnd = random.Random(seed); s = ""
    for _ in range(n):
        a = rnd.uniform(0, 2*math.pi); d = rnd.uniform(190, 236)
        x, y = C + d*math.cos(a), C + d*math.sin(a)
        c = COL[rnd.choice(["fuchsia", "mango", "turq", "violet"])][0]
        if rnd.random() < .5:
            s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(5,8):.0f}" fill="{c}" stroke="{OUT}" stroke-width="3"/>'
        else:
            s += f'<rect x="{x-9:.0f}" y="{y-4:.0f}" width="18" height="8" rx="3" fill="{c}" stroke="{OUT}" stroke-width="3" transform="rotate({rnd.uniform(0,180):.0f} {x:.0f} {y:.0f})"/>'
    return s

def wrap(body, col, seed, extra_shines=((410, 120, 1.0), (100, 390, .7))):
    return backdrop(col, seed) + confetti(seed) + f'<g filter="url(#wSh)">{body}</g>' + "".join(shine(*p) for p in extra_shines)

# ───────── Objets ─────────
N_PATH = "M-38 52 V-52 H-14 L18 4 V-52 H40 V52 H16 L-16 -4 V52Z"

def toon_coin(cx, cy, r, face="fuchsia", rot=-14, sx=.84, thick=16):
    g = f'<g transform="translate({cx} {cy}) rotate({rot}) scale({sx} 1)">'
    g += toon(scallop(thick*.6, thick, r, 18, 6), "gold", shade=(0, 0), hl=False).replace(COL["gold"][0], COL["gold"][1])
    g += toon(scallop(0, 0, r, 18, 6), "gold", None)
    g += toon(circ(0, 0, r*.74), face, "wDots")
    g += f'<g transform="scale({r/150:.2f})">{toon(N_PATH, "cream", sw=6)}</g>'
    g += gloss(-r*.45, -r*.5, r*.2, r*.08)
    return g + '</g>'

def flat_coin(cx, cy, rx, ry, h, face="fuchsia"):
    side = f"M{cx-rx} {cy} V{cy+h} A{rx} {ry} 0 0 0 {cx+rx} {cy+h} V{cy} A{rx} {ry} 0 0 1 {cx-rx} {cy}Z"
    s = toon(side, "gold", "wStripe", pop=.5, shade=(0, 6))
    s += toon(f"M{cx-rx} {cy} A{rx} {ry} 0 1 0 {cx+rx} {cy} A{rx} {ry} 0 1 0 {cx-rx} {cy}Z", "gold", hl=False)
    s += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*.66}" ry="{ry*.62}" fill="{COL[face][0]}" stroke="{OUT}" stroke-width="5"/>'
    return s

def toon_cowrie(cx, cy, rx, ry, rot=0, col="cream"):
    out = (f'M0 {-ry} C{rx*.8:.1f} {-ry} {rx} {-ry*.45:.1f} {rx} {ry*.05:.1f} C{rx} {ry*.62:.1f} {rx*.7:.1f} {ry} 0 {ry} '
           f'C{-rx*.7:.1f} {ry} {-rx} {ry*.62:.1f} {-rx} {ry*.05:.1f} C{-rx} {-ry*.45:.1f} {-rx*.8:.1f} {-ry} 0 {-ry}Z')
    g = f'<g transform="translate({cx} {cy}) rotate({rot})">' + toon(out, col)
    slit = f'M{rx*.04:.1f} {-ry*.8:.1f} C{rx*.16:.1f} {-ry*.3:.1f} {-rx*.12:.1f} {ry*.3:.1f} {rx*.04:.1f} {ry*.8:.1f}'
    g += f'<path d="{slit}" stroke="{COL[col][1]}" stroke-width="{rx*.55:.1f}" fill="none" stroke-linecap="round"/>'
    for k in range(9):
        f = -.7 + k*1.4/8; y = f*ry; xs = rx*.08*math.sin(-f*2.4) + rx*.02; L = rx*.18*(1 - abs(f)**2) + rx*.06
        g += f'<path d="M{xs-L-rx*.05:.1f} {y:.1f} H{xs+L+rx*.05:.1f}" stroke="{OUT}" stroke-width="{max(3, rx*.09):.1f}" stroke-linecap="round"/>'
    g += f'<path d="{slit}" stroke="{OUT}" stroke-width="{max(4, rx*.12):.1f}" fill="none" stroke-linecap="round"/>'
    g += gloss(-rx*.5, -ry*.45, rx*.14, ry*.2, 15)
    return g + '</g>'

def bolt(x, y, s, col="mango"):
    return f'<g transform="translate({x} {y}) scale({s})">{toon("M10 -60 L-34 8 L-6 8 L-14 62 L34 -10 L6 -10Z", col, sw=6)}</g>'

def box(x, y, w, h, d, col, rib="mango", pat="wDots", bow=True):
    """Paquet cadeau en wax : face, dessus et côté, ruban croisé, nœud."""
    front = poly([(x, y), (x+w, y), (x+w, y+h), (x, y+h)])
    top = poly([(x, y), (x+d, y-d*.6), (x+w+d, y-d*.6), (x+w, y)])
    side = poly([(x+w, y), (x+w+d, y-d*.6), (x+w+d, y+h-d*.6), (x+w, y+h)])
    s = toon(side, COL[col][1], None, hl=False) + toon(front, col, pat) + toon(top, col, pat, hl=False)
    rw = max(14, w*.14)
    s += toon(poly([(x+w/2-rw/2, y), (x+w/2+rw/2, y), (x+w/2+rw/2, y+h), (x+w/2-rw/2, y+h)]), rib, hl=False, sw=5)
    s += toon(poly([(x+w/2-rw/2, y), (x+w/2+rw/2, y), (x+w/2+rw/2+d, y-d*.6), (x+w/2-rw/2+d, y-d*.6)]), rib, hl=False, sw=5)
    s += toon(poly([(x+w+d*.42, y-d*.25), (x+w+d*.58, y-d*.35), (x+w+d*.58, y+h-d*.35), (x+w+d*.42, y+h-d*.25)]), COL[rib][1], hl=False, sw=5)
    if bow:
        bx, by = x+w/2+d/2, y-d*.3
        s += toon(f"M{bx} {by} C{bx-50} {by-50} {bx-70} {by+6} {bx} {by}Z", rib, sw=5) + toon(f"M{bx} {by} C{bx+50} {by-50} {bx+70} {by+6} {bx} {by}Z", rib, sw=5)
        s += toon(circ(bx, by, 11), COL[rib][1] if False else rib, sw=5)
    return s

def emblem(kind, s=1.0):
    """Emblèmes de rang en aplats cartoon."""
    g = ""
    if kind == "flame":
        g += toon("M0 -78 C30 -44 64 -18 56 26 C50 62 22 78 0 78 C-22 78 -54 62 -56 26 C-60 -8 -32 -22 -24 -50 C-10 -32 -4 -56 0 -78Z", "red")
        g += toon("M0 -18 C16 4 32 18 28 40 C24 58 12 64 0 64 C-14 64 -28 56 -28 38 C-28 20 -14 12 -8 -6 C-2 6 0 -6 0 -18Z", "mango", hl=False, sw=5)
        g += '<path d="M-4 34 C-4 24 4 18 6 8 C14 24 14 46 0 50 C-8 50 -6 42 -4 34Z" fill="#fff6d0"/>'
    elif kind == "drum":
        g += toon("M-52 -50 H52 L34 8 L20 74 H-20 L-34 8Z", "fuchsia", "wZig")
        g += toon("M-52 -50 A52 14 0 0 1 52 -50 A52 14 0 0 1 -52 -50Z", "cream", hl=False, sw=5)
        g += "".join(f'<path d="M{-46+i*13} -40 L{-28+i*8} 6" stroke="{OUT}" stroke-width="4"/>' for i in range(8))
        g += toon("M-34 4 H34 V18 H-34Z", "mango", hl=False, sw=5)
    elif kind == "cards":
        for x, r, c in ((-34, -18, "turq"), (34, 18, "violet"), (0, 0, "cream")):
            g += f'<g transform="translate({x} 6) rotate({r})">{toon(poly([(-32,-46),(32,-46),(32,46),(-32,46)]), c, sw=6)}{toon("M0 -18 L14 0 L0 18 L-14 0Z", "fuchsia", hl=False, sw=4)}</g>'
    elif kind == "cowrie":
        g += toon_cowrie(0, 0, 46, 66, -10)
    elif kind == "crown":
        g += toon("M-62 24 L-70 -40 L-34 -10 L0 -62 L34 -10 L70 -40 L62 24Z", "gold", "wZig", pop=.45)
        g += "".join(toon(circ(x, y, 10), c, hl=False, sw=5) for x, y, c in ((-70, -44, "turq"), (0, -66, "fuchsia"), (70, -44, "turq")))
        g += toon("M-62 20 H62 V40 H-62Z", "fuchsia", "wDots", hl=False, sw=6)
    elif kind == "mask":
        g += toon("M0 -80 C44 -80 54 -36 52 6 C50 50 26 82 0 84 C-26 82 -50 50 -52 6 C-54 -36 -44 -80 0 -80Z", "brown", "wZig", pop=.4)
        g += f'<path d="M-36 -8 Q-20 -24 -6 -8 Q-20 0 -36 -8Z M36 -8 Q20 -24 6 -8 Q20 0 36 -8Z" fill="#fff3dc" stroke="{OUT}" stroke-width="4"/>'
        g += f'<path d="M0 0 L9 32 H-9Z" fill="{COL["brown"][1]}" stroke="{OUT}" stroke-width="4"/><path d="M-18 50 Q0 62 18 50" stroke="{OUT}" stroke-width="6" fill="none" stroke-linecap="round"/>'
        g += toon("M-34 -46 H34 V-34 H-34Z", "mango", hl=False, sw=4)
    elif kind == "star":
        g += toon(starp(0, 0, 5, 80, 36), "gold", "wRings", pop=.45)
        g += f'<circle cx="-14" cy="-6" r="5" fill="{OUT}"/><circle cx="14" cy="-6" r="5" fill="{OUT}"/><path d="M-12 12 Q0 22 12 12" stroke="{OUT}" stroke-width="5" fill="none" stroke-linecap="round"/>'
    return f'<g transform="scale({s})">{g}</g>'

def ribbon(y, col, text=None, w=300):
    x0, x1 = C - w/2, C + w/2
    s = toon(poly([(x0-40, y+14), (x0+10, y+14), (x0+10, y+56), (x0-40, y+56), (x0-22, y+35)]), COL[col][1], hl=False, sw=6)
    s += toon(poly([(x1+40, y+14), (x1-10, y+14), (x1-10, y+56), (x1+40, y+56), (x1+22, y+35)]), COL[col][1], hl=False, sw=6)
    s += toon(f"M{x0} {y} Q{C} {y+22} {x1} {y} V{y+44} Q{C} {y+66} {x0} {y+44}Z", col, "wDots", pop=.5)
    if text:
        s += (f'<text x="{C}" y="{y+42}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" '
              f'fill="#fff3dc" stroke="{OUT}" stroke-width="6" paint-order="stroke">{text}</text>')
    return s

# ───────── Assets ─────────
def nkap():
    return wrap(toon_coin(C, C, 172), "mango", 1)

def nkap_stack():
    s = ""; rnd = random.Random(4)
    for i in range(6):
        s += flat_coin(190 + rnd.uniform(-10, 10), 400 - i*40, 116, 40, 26, ["fuchsia", "turq", "violet"][i % 3])
    s += toon_coin(358, 300, 112, "turq", 16, .8, 14)
    return wrap(s, "mango", 2, ((420, 140, 1), (90, 160, .7)))

def cauri():
    s = toon_cowrie(150, 360, 44, 62, -60) + toon_cowrie(380, 380, 40, 56, 50)
    s += toon_cowrie(C, 240, 112, 160, -22)
    return wrap(s, "turq", 3)

def pouch():
    body = "M-120 -10 C-170 60 -140 160 0 160 C140 160 170 60 120 -10 C90 -50 -90 -50 -120 -10Z"
    s = toon("M-40 -64 C-90 -140 -150 -120 -118 -60 C-100 -30 -60 -36 -40 -64Z", "fuchsia", "wRings")
    s += toon("M40 -64 C90 -140 150 -120 118 -60 C100 -30 60 -36 40 -64Z", "fuchsia", "wRings")
    s += toon_cowrie(-30, -80, 30, 42, -30) + toon_cowrie(28, -86, 30, 42, 25) + toon_cowrie(0, -104, 30, 44, 0)
    s += toon(body, "fuchsia", "wRings")
    s += toon("M-86 -40 Q0 -10 86 -40 L90 -14 Q0 18 -90 -14Z", "turq", "wZig", hl=False, sw=6)
    s += toon(circ(0, -22, 20), "mango", sw=6)
    s += toon("M-8 -6 L-30 50 L-12 46 L-4 64Z", "turq", hl=False, sw=5) + toon("M8 -6 L30 50 L12 46 L4 64Z", "turq", hl=False, sw=5)
    s += gloss(-96, 40, 14, 34, 20)
    return wrap(f'<g transform="translate({C} {C+20}) scale(1.05)">{s}</g>', "fuchsia", 4)

def flask():
    s = toon("M-30 -150 H30 V-60 C120 -20 140 120 60 150 H-60 C-140 120 -120 -20 -30 -60Z", "sky")
    s += f'<clipPath id="fl"><path d="M-30 -150 H30 V-60 C120 -20 140 120 60 150 H-60 C-140 120 -120 -20 -30 -60Z"/></clipPath>'
    s += f'<g clip-path="url(#fl)">' + toon("M-160 10 Q-80 -20 0 10 T160 10 V200 H-160Z", "turq", "wDots", pop=.5, hl=False) + '</g>'
    s += "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="{OUT}" stroke-width="4"/>' for x, y, r in ((-40, 60, 10), (30, 100, 7), (50, 40, 12), (-10, 120, 6), (10, -30, 8)))
    s += f'<path d="M-30 -150 H30 V-60 C120 -20 140 120 60 150 H-60 C-140 120 -120 -20 -30 -60Z" fill="none" stroke="{OUT}" stroke-width="{SW}" stroke-linejoin="round"/>'
    s += toon("M-42 -190 H42 V-150 H-42Z", "brown", "wStripe", pop=.4, sw=6)
    s += gloss(-60, -10, 14, 46, 30)
    s += toon(poly([(-64, 40), (64, 40), (64, 110), (-64, 110)]), "cream", "wZig", pop=.35, sw=6) + bolt(0, 76, .5)
    return wrap(f'<g transform="translate({C} {C+18}) rotate(8)">{s}</g>', "turq", 5)

def wheel():
    cx, cy, r = C, 226, 160
    s = toon(f"M{cx-90} 470 L{cx} {cy} L{cx+90} 470Z", "violet", "wStripe", pop=.5)
    s += toon(circ(cx, cy, r+24), "cream", hl=False)
    cols = ["fuchsia", "mango", "turq", "violet"]; pats = ["wDots", "wZig", "wRings", "wStripe"]
    for i in range(8):
        a0, a1 = math.radians(i*45-90), math.radians(i*45-45)
        d = f"M{cx} {cy} L{cx+r*math.cos(a0):.1f} {cy+r*math.sin(a0):.1f} A{r} {r} 0 0 1 {cx+r*math.cos(a1):.1f} {cy+r*math.sin(a1):.1f}Z"
        s += toon(d, cols[i % 4], pats[i % 4], hl=False, sw=5)
    for i in range(16):
        a = math.radians(i*22.5)
        s += f'<circle cx="{cx+(r+12)*math.cos(a):.1f}" cy="{cy+(r+12)*math.sin(a):.1f}" r="7" fill="{"#fff6c0" if i % 2 else "#ffd23e"}" stroke="{OUT}" stroke-width="3"/>'
    s += toon(circ(cx, cy, 30), "gold") + toon(f"M{cx-30} {cy-r-50} H{cx+30} L{cx} {cy-r+14}Z", "red")
    return wrap(s, "violet", 6, ((430, 110, 1), (80, 150, .6)))

def pack_quartier():
    s = box(150, 250, 170, 160, 90, "violet", "mango") + flat_coin(110, 440, 60, 22, 14) + toon_coin(400, 400, 56, "fuchsia", 10, .85, 10)
    return wrap(s, "violet", 7)

def pack_mboa():
    s = box(110, 270, 190, 170, 100, "turq", "fuchsia", "wRings") + box(190, 150, 120, 100, 64, "fuchsia", "mango", "wZig")
    s += toon_cowrie(410, 400, 34, 48, 40) + toon_coin(400, 260, 50, "violet", 10, .85, 10)
    return wrap(s, "turq", 8)

def pack_chefferie():
    s = box(80, 300, 220, 150, 110, "fuchsia", "gold", "wRings", False) + box(130, 190, 160, 110, 80, "violet", "gold", "wDots", False)
    s += box(175, 105, 100, 80, 56, "mango", "gold", "wZig", False)
    s += f'<g transform="translate(252 64) scale(.72)">{emblem("crown")}</g>'
    s += toon_coin(420, 420, 50, "turq", 10, .85, 10) + toon_cowrie(60, 440, 28, 40, -40)
    return wrap(s, "fuchsia", 9, ((440, 120, 1.1), (70, 160, .8), (450, 300, .6)))

def ticket(tier):
    col = {"bronze": "bronze", "argent": "silver", "or": "gold"}[tier]
    stars = {"bronze": 1, "argent": 2, "or": 3}[tier]
    W, H, n = 210, 340, 20
    d = (f"M{-W/2} {-H/2+16} Q{-W/2} {-H/2} {-W/2+16} {-H/2} H{W/2-16} Q{W/2} {-H/2} {W/2} {-H/2+16} V{H/2-110-n} "
         f"A{n} {n} 0 0 0 {W/2} {H/2-110+n} V{H/2-16} Q{W/2} {H/2} {W/2-16} {H/2} H{-W/2+16} Q{-W/2} {H/2} {-W/2} {H/2-16} "
         f"V{H/2-110+n} A{n} {n} 0 0 0 {-W/2} {H/2-110-n}Z")
    g = toon(d, col, "wStripe", pop=.45)
    g += toon(poly([(-W/2+18, -H/2+18), (W/2-18, -H/2+18), (W/2-18, -H/2+58), (-W/2+18, -H/2+58)]), "fuchsia", "wDots", hl=False, sw=5)
    g += f'<line x1="{-W/2+26}" y1="{H/2-110}" x2="{W/2-26}" y2="{H/2-110}" stroke="{OUT}" stroke-width="5" stroke-dasharray="10 9" stroke-linecap="round"/>'
    g += toon(circ(0, -20, 58), "cream", hl=False)
    for i in range(stars):
        x = (i - (stars-1)/2)*34
        g += toon(starp(x, -20 + (6 if stars == 3 and i != 1 else 0) - (8 if stars == 3 and i == 1 else 0), 5, 26 if stars == 1 else 20, 11), "mango" if tier != "or" else "red", hl=False, sw=4)
    for i in range(3 + stars):
        g += f'<rect x="{-W/2+30+i*26}" y="{H/2-70}" width="12" height="40" rx="3" fill="{OUT}" opacity=".75"/>'
    return wrap(f'<g transform="translate({C} {C}) rotate(12)">{g}</g>', {"bronze": "mango", "argent": "violet", "or": "fuchsia"}[tier], 10 + stars)

def book(tier):
    cov = {"normal": "turq", "rare": "fuchsia", "exceptionnel": "violet"}[tier]
    s = ""
    cards = {"normal": 0, "rare": 1, "exceptionnel": 3}[tier]
    for i in range(cards):
        a = (i - (cards-1)/2)*24
        s += f'<g transform="translate({C} 250) rotate({a}) translate(0 -96)">{toon(poly([(-46,-66),(46,-66),(46,66),(-46,66)]), "cream", sw=6)}{toon(poly([(-34,-54),(34,-54),(34,54),(-34,54)]), ["mango","turq","fuchsia"][i%3], "wDots", hl=False, sw=4)}{toon(starp(0, 0, 4, 20, 8), "cream", hl=False, sw=4)}</g>'
    s += toon(f"M{C-190} 300 Q{C-90} 270 {C} 300 Q{C+90} 270 {C+190} 300 V400 Q{C+90} 370 {C} 400 Q{C-90} 370 {C-190} 400Z", cov, "wRings")
    s += toon(f"M{C-174} 290 Q{C-90} 250 {C} 284 V384 Q{C-90} 350 {C-174} 386Z", "cream", hl=False, sw=6)
    s += toon(f"M{C+174} 290 Q{C+90} 250 {C} 284 V384 Q{C+90} 350 {C+174} 386Z", "cream", hl=False, sw=6)
    for side in (-1, 1):
        for k in range(4):
            y = 304 + k*18
            s += f'<path d="M{C+side*24} {y} Q{C+side*90} {y-26} {C+side*150} {y-4}" stroke="{OUT}" stroke-opacity=".4" stroke-width="4" fill="none" stroke-linecap="round"/>'
    rib = {"normal": 1, "rare": 2, "exceptionnel": 3}[tier]
    for i in range(rib):
        x = C - 30 + i*30
        s += toon(f"M{x-9} 392 H{x+9} V{448+i*8} L{x} {438+i*8} L{x-9} {448+i*8}Z", ["mango", "red", "gold"][i], hl=False, sw=5)
    if tier == "normal":
        s += toon(starp(C, 220, 5, 48, 22), "mango", sw=6)
    s = f'<g transform="translate({C} {C+10}) scale(1.18) translate({-C} {-C})">{s}</g>'
    return wrap(s, cov, 14 + rib, ((430, 120, .6 + .2*rib), (80, 170, .4 + .15*rib)))

def card_back():
    def card(rot, x, col, pat):
        g = toon(poly([(-96, -140), (96, -140), (96, 140), (-96, 140)]), "cream", sw=7)
        g += toon(poly([(-78, -122), (78, -122), (78, 122), (-78, 122)]), col, pat, hl=False, sw=5)
        g += toon(circ(0, 0, 50), "mango", "wZig", pop=.4, sw=5) + toon_cowrie(0, 0, 24, 34, -10)
        return f'<g transform="translate({x} 260) rotate({rot})">{g}</g>'
    return wrap(card(-14, 200, "turq", "wRings") + card(10, 300, "fuchsia", "wDots"), "fuchsia", 18)

RANK_STYLE = {
    "rank-braise": ("flame", "red", "round"), "rank-tambour": ("drum", "mango", "hex"), "rank-mboa": ("cards", "turq", "shield"),
    "rank-notable": ("cowrie", "violet", "rosette"), "rank-chef-table": ("crown", "fuchsia", "crest"),
    "rank-ancetre": ("mask", "night", "arch"), "rank-legende-237": ("star", "gold", "burst"),
}

def rank(key):
    kind, col, shape = RANK_STYLE[key]
    s = ""
    if shape == "round":
        s += toon(circ(C, C, 150), col, "wZig", pop=.4) + toon(circ(C, C, 112), "cream", hl=False)
    elif shape == "hex":
        s += toon(poly([(C + 168*math.cos(math.radians(a)), C + 168*math.sin(math.radians(a))) for a in range(-90, 270, 60)]), col, "wStripe", pop=.5)
        s += toon(circ(C, C, 116), "cream", hl=False)
    elif shape == "shield":
        d = f"M{C-150} {C-150} H{C+150} V{C-10} C{C+150} {C+110} {C+60} {C+160} {C} {C+190} C{C-60} {C+160} {C-150} {C+110} {C-150} {C-10}Z"
        s += toon(d, col, "wRings")
        s += toon(f"M{C-116} {C-118} H{C+116} V{C-16} C{C+116} {C+86} {C+46} {C+126} {C} {C+150} C{C-46} {C+126} {C-116} {C+86} {C-116} {C-16}Z", "cream", hl=False)
    elif shape == "rosette":
        s += toon(f"M{C-70} {C+60} L{C-120} {C+220} L{C-80} {C+196} L{C-56} {C+236} L{C-10} {C+90}Z", "fuchsia", hl=False, sw=6)
        s += toon(f"M{C+70} {C+60} L{C+120} {C+220} L{C+80} {C+196} L{C+56} {C+236} L{C+10} {C+90}Z", "fuchsia", hl=False, sw=6)
        s += toon(scallop(C, C-10, 160, 16, 14), col, "wDots") + toon(circ(C, C-10, 112), "cream", hl=False)
    elif shape == "crest":
        s += toon(f"M{C-150} {C-90} Q{C-210} {C} {C-150} {C+90} L{C-110} {C} Z", "mango", "wZig", hl=False, sw=6)
        s += toon(f"M{C+150} {C-90} Q{C+210} {C} {C+150} {C+90} L{C+110} {C} Z", "mango", "wZig", hl=False, sw=6)
        d = f"M{C-140} {C-120} Q{C} {C-170} {C+140} {C-120} V{C+20} C{C+140} {C+120} {C+50} {C+170} {C} {C+196} C{C-50} {C+170} {C-140} {C+120} {C-140} {C+20}Z"
        s += toon(d, col, "wRings") + toon(circ(C, C+10, 104), "cream", hl=False)
    elif shape == "arch":
        for side in (-1, 1):
            for k in range(4):
                s += toon(f"M{C+side*110} {C-60+k*60} Q{C+side*(190+k*6)} {C-90+k*60} {C+side*(206-k*8)} {C-30+k*60} Q{C+side*170} {C-20+k*60} {C+side*110} {C-20+k*60}Z", ["mango", "red", "turq", "fuchsia"][k], hl=False, sw=5)
        d = f"M{C-130} {C+190} V{C-60} Q{C-130} {C-200} {C} {C-210} Q{C+130} {C-200} {C+130} {C-60} V{C+190}Z"
        s += toon(d, col, "wZig", pop=.45) + toon(f"M{C-96} {C+150} V{C-50} Q{C-96} {C-160} {C} {C-168} Q{C+96} {C-160} {C+96} {C-50} V{C+150}Z", "cream", hl=False)
    else:  # burst
        s += toon(starp(C, C, 12, 214, 170), "mango", "wRings", pop=.4)
        s += toon(scallop(C, C, 150, 20, 8), col, "wDots") + toon(circ(C, C, 112), "violet", "wZig", pop=.4, hl=False)
    cy = C + (10 if shape in ("crest",) else (-10 if shape == "rosette" else (-10 if shape == "shield" else 0)))
    s += f'<g transform="translate({C} {cy})">{emblem(kind, 1.3 if shape == "arch" else 1.05)}</g>'
    if key == "rank-chef-table":
        s += f'<g transform="translate({C} {C-150}) scale(.8)">{emblem("crown")}</g>'
    if key == "rank-legende-237":
        s += ribbon(C+120, "fuchsia", "237", 260)
    if key == "rank-ancetre":
        s += ribbon(C+150, "mango", None, 220)
    return wrap(s, col, 20 + len(key))

ASSETS = {
    "nkap": nkap, "nkap-stack": nkap_stack, "cauri": cauri, "cauris-pouch": pouch, "energy-flask": flask, "loyalty-wheel": wheel,
    "pack-quartier": pack_quartier, "pack-mboa": pack_mboa, "pack-chefferie": pack_chefferie,
    "ticket-bronze": lambda: ticket("bronze"), "ticket-argent": lambda: ticket("argent"), "ticket-or": lambda: ticket("or"),
    "book-normal": lambda: book("normal"), "book-rare": lambda: book("rare"), "book-exceptionnel": lambda: book("exceptionnel"), "card-back": card_back,
    **{k: (lambda k: (lambda: rank(k)))(k) for k in RANK_STYLE},
}
