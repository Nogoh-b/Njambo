"""Assets système Njambo — 3 itérations lumineuses (soleil, wax, aurore).
Usage : python3 gen.py && node ../cards-v2/render.js out/*.svg
Chaque asset est dessiné une fois et décliné par thème (métal, émaux, halo)."""
import math, os, random, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cards-v2"))
from gen import COMMON, cowrie, glint, ring_pos  # noqa: E402

S = 512; C = 256

def stops(cols):
    n = len(cols) - 1
    return "".join(f'<stop offset="{i/n:.2f}" stop-color="{c}"/>' for i, c in enumerate(cols))

def lin(i, cols, v=False):
    return f'<linearGradient id="{i}" x1="0" y1="0" x2="{0 if v else 1}" y2="1">{stops(cols)}</linearGradient>'

def rad(i, cols, cx="38%", cy="30%", r="80%"):
    return f'<radialGradient id="{i}" cx="{cx}" cy="{cy}" r="{r}">{stops(cols)}</radialGradient>'

# ───────── Thèmes ─────────
THEMES = {
    "soleil": dict(
        label="Soleil d'or",
        gold=["#fffbe0", "#ffd24a", "#f0a91e", "#ffe680", "#e09a12", "#fff3b8", "#b9760c"],
        en=[["#c4fff5", "#22d6c0", "#0a8f84"], ["#ffd0c4", "#ff5a4e", "#b8202a"], ["#d6e0ff", "#4f7bff", "#2238b0"], ["#fff6dc", "#ffe4a0", "#e8b45a"]],
        halo=["#fffbe8", "#ffe07a", "#ffb12e"], glow="#fff1b0", spark="#fffdf2", confetti=["#ffe07a", "#fff6d0"]),
    "wax": dict(
        label="Wax festif",
        gold=["#fff4e6", "#ffc46a", "#f2902a", "#ffe0a0", "#e8742a", "#fff0d2", "#b0501a"],
        en=[["#ffd2ea", "#ff3d97", "#b0105a"], ["#fff0b8", "#ffb81e", "#d46a00"], ["#c8fff4", "#13d8c2", "#06857c"], ["#e2dcff", "#7b5cff", "#3e22b8"]],
        halo=["#fff6fb", "#ffb8d6", "#ff7a3a"], glow="#ffe1ef", spark="#ffffff", confetti=["#ff3d97", "#ffb81e", "#13d8c2", "#7b5cff"]),
    "aurore": dict(
        label="Aurore nacrée",
        gold=["#ffffff", "#e6ecff", "#b9c4e8", "#fdf2ff", "#a7b4dc", "#ffffff", "#8e98c4"],
        en=[["#efe6ff", "#a184ff", "#5a3ad0"], ["#dcfffb", "#46e0dc", "#108f9a"], ["#ffe6f2", "#ff8fc4", "#c43a82"], ["#fffbe8", "#ffe7a6", "#e0b860"]],
        halo=["#ffffff", "#d8f4ff", "#c6a8ff"],
        or_=["#fffdf0", "#f6dc9a", "#d8b060", "#fff4cc", "#c89a48", "#fff8e0", "#a07a30"], glow="#eaf6ff", spark="#ffffff", confetti=["#d8f4ff", "#ffd6ee", "#e6dcff"]),
}

TIERS = {
    "bronze": ["#ffe2c2", "#e08a4a", "#a8521e", "#f4b07a", "#8a3e14", "#ffd2a8", "#6e2e0c"],
    "argent": ["#ffffff", "#dfe6f0", "#a8b4c6", "#f4f8ff", "#8a96aa", "#ffffff", "#6c7688"],
}

def theme_defs(t):
    d = lin("gold", t["gold"]) + lin("goldV", t["gold"], True)
    d += lin("bronze", TIERS["bronze"]) + lin("argent", TIERS["argent"])
    for k, cols in enumerate(t["en"]):
        d += rad(f"en{k}", cols)
    h0, h1, h2 = t["halo"]
    d += (f'<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{h0}" stop-opacity=".95"/>'
          f'<stop offset=".35" stop-color="{h1}" stop-opacity=".5"/><stop offset=".7" stop-color="{h2}" stop-opacity=".12"/>'
          f'<stop offset="1" stop-color="{h2}" stop-opacity="0"/></radialGradient>')
    d += ('<radialGradient id="rayFade" cx="50%" cy="50%" r="50%"><stop offset=".15" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".5"/>'
          '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="rayMask"><rect width="512" height="512" fill="url(#rayFade)"/></mask>')
    d += lin("or", t.get("or_") or t["gold"]) + lin("orV", t.get("or_") or t["gold"], True)
    d += rad("glass", ["#ffffff", "#eafcff", "#bfe8ff"], "35%", "28%", "80%")
    d += '''<pattern id="wax" width="36" height="36" patternUnits="userSpaceOnUse">
      <circle cx="9" cy="9" r="6" fill="#fff" fill-opacity=".32"/><circle cx="27" cy="27" r="6" fill="#fff" fill-opacity=".32"/>
      <circle cx="27" cy="9" r="2.5" fill="#000" fill-opacity=".16"/><circle cx="9" cy="27" r="2.5" fill="#000" fill-opacity=".16"/></pattern>
    <pattern id="ndop" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M14 3 L25 14 L14 25 L3 14Z" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2.4"/><path d="M14 10 L18 14 L14 18 L10 14Z" fill="#fff" fill-opacity=".45"/></pattern>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#3a1a06" flood-opacity=".35"/></filter>'''
    return d

def svg(t, body):
    # Les dégradés du thème passent avant COMMON : à identifiant égal, le premier défini l'emporte.
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">'
            f'<defs>{theme_defs(t)}{COMMON}</defs>{body}</svg>')

def halo(t, r=230, cy=C):
    return f'<circle cx="{C}" cy="{cy}" r="{r}" fill="url(#halo)"/>'

def sparkles(t, pts):
    return "".join(glint(x, y, s) for x, y, s in pts).replace("#fffdf2", t["spark"])

def confetti(t, seed, n=14, r=(3, 7)):
    rnd = random.Random(seed); s = ""
    for _ in range(n):
        a = rnd.uniform(0, 2*math.pi); d = rnd.uniform(170, 235)
        x, y = C + d*math.cos(a), C + d*math.sin(a)*.95
        c = rnd.choice(t["confetti"]); rr = rnd.uniform(*r)
        s += (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rr:.1f}" fill="{c}"/>' if rnd.random() < .6 else
              f'<rect x="{x:.0f}" y="{y:.0f}" width="{rr*2:.0f}" height="{rr*.9:.0f}" rx="2" fill="{c}" transform="rotate({rnd.uniform(0,180):.0f} {x:.0f} {y:.0f})"/>')
    return f'<g opacity=".9">{s}</g>'

def deco(t, name, seed):
    """Ambiance propre au thème, posée derrière l'objet."""
    if name == "wax":
        return confetti(t, seed)
    if name == "aurore":
        rnd = random.Random(seed)
        return "".join(f'<circle cx="{C+rnd.uniform(-210,210):.0f}" cy="{C+rnd.uniform(-210,210):.0f}" r="{rnd.uniform(2,5):.1f}" fill="#fff" opacity="{rnd.uniform(.5,1):.2f}"/>' for _ in range(16))
    rays = "".join(f'<path d="M{C} {C} L{C+250*math.cos(math.radians(a-4)):.0f} {C+250*math.sin(math.radians(a-4)):.0f} L{C+250*math.cos(math.radians(a+4)):.0f} {C+250*math.sin(math.radians(a+4)):.0f}Z"/>' for a in range(0, 360, 30))
    return f'<g fill="{t["glow"]}" opacity=".55" mask="url(#rayMask)" filter="url(#soft)">{rays}</g>'

def enamel(k, name, extra=""):
    pat = "url(#wax)" if name == "wax" else "url(#ndop)"
    return f'fill="url(#en{k})"', pat

# ───────── Primitives ─────────
def n_mark(s=1.0, col="url(#goldV)"):
    p = "M-34 46 V-46 L34 46 V-46"
    return (f'<g transform="scale({s})"><path d="{p}" fill="none" stroke="#4a2604" stroke-opacity=".55" stroke-width="30" stroke-linejoin="miter" transform="translate(2 4)"/>'
            f'<path d="{p}" fill="none" stroke="{col}" stroke-width="24" stroke-linejoin="miter" filter="url(#metal)"/></g>')

def zigzag(cx, cy, r, amp, n, col="#5a3006", op=.45, w=2.5):
    pts = " ".join(f"{cx+(r+(amp if i%2 else -amp))*math.cos(math.radians(i*360/n)):.1f},{cy+(r+(amp if i%2 else -amp))*math.sin(math.radians(i*360/n)):.1f}" for i in range(n+1))
    return f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-opacity="{op}" stroke-width="{w}"/>'

def coin(cx, cy, r, name, metal="gold", k=0, emblem=None):
    s = f'<g filter="url(#sh)"><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{metal})" filter="url(#metal)"/></g>'
    s += zigzag(cx, cy, r*.86, r*.04, 60)
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*.72}" fill="#4a2a08" opacity=".5"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*.7}" fill="url(#en{k})" filter="url(#gem)"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*.7}" fill="{"url(#wax)" if name=="wax" else "url(#ndop)"}" opacity=".7"/>'
    for i, x, y, a in ring_pos(cx, cy, r*.93, 12):
        s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*.035:.1f}" fill="#fff8da" opacity=".9"/>'
    s += f'<g transform="translate({cx} {cy})">{emblem if emblem is not None else n_mark(r/120)}</g>'
    s += f'<ellipse cx="{cx-r*.35:.1f}" cy="{cy-r*.45:.1f}" rx="{r*.3:.1f}" ry="{r*.12:.1f}" fill="#fff" opacity=".55" transform="rotate(-35 {cx-r*.35:.1f} {cy-r*.45:.1f})" filter="url(#soft)"/>'
    return s

def coin_flat(cx, cy, rx, ry, h, metal="gold", k=0):
    """Pièce couchée (vue de biais) : tranche striée + dessus émaillé."""
    s = f'<path d="M{cx-rx} {cy} V{cy+h} A{rx} {ry} 0 0 0 {cx+rx} {cy+h} V{cy}Z" fill="url(#{metal})" filter="url(#metal)"/>'
    s += "".join(f'<line x1="{cx-rx+i*rx/9:.1f}" y1="{cy+2}" x2="{cx-rx+i*rx/9:.1f}" y2="{cy+h+ry*math.sqrt(max(0,1-((i*rx/9-rx)/rx)**2))-2:.1f}" stroke="#5a3006" stroke-opacity=".35" stroke-width="1.5"/>' for i in range(1, 18))
    s += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#{metal})" filter="url(#metal)"/>'
    s += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*.7}" ry="{ry*.7}" fill="url(#en{k})" filter="url(#gem)"/>'
    s += f'<g transform="translate({cx} {cy}) scale(1 {ry/rx:.2f})">{n_mark(rx/140)}</g>'
    return s

def shell(x, y, s=1.0, rot=0):
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#sh)">{cowrie(50, 70)}</g>'

def bolt(s=1.0, col="url(#goldV)"):
    p = "M8 -60 L-30 6 L-4 6 L-12 60 L30 -10 L4 -10Z"
    return f'<g transform="scale({s})"><path d="{p}" fill="#4a2604" opacity=".5" transform="translate(3 4)"/><path d="{p}" fill="{col}" filter="url(#metal)"/></g>'

def star(n, r1, r2, rot=-90):
    pts = []
    for i in range(n*2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i*180/n)
        pts.append(f"{r*math.cos(a):.1f},{r*math.sin(a):.1f}")
    return "M" + " L".join(pts) + "Z"

def metal_path(d, metal="goldV", extra=""):
    return f'<path d="{d}" fill="#4a2604" opacity=".45" transform="translate(2 4)"/><path d="{d}" fill="url(#{metal})" filter="url(#metal)" {extra}/>'

# ───────── Emblèmes des rangs ─────────
def em_flame(k=1):
    outer = "M0 -70 C26 -40 58 -18 50 22 C44 56 20 70 0 70 C-20 70 -48 56 -50 22 C-54 -8 -30 -20 -22 -46 C-8 -30 -4 -50 0 -70Z"
    inner = "M0 -20 C14 0 28 14 24 34 C20 52 10 58 0 58 C-12 58 -24 50 -24 34 C-24 18 -12 10 -8 -6 C-2 4 0 -8 0 -20Z"
    return metal_path(outer) + f'<path d="{inner}" fill="url(#en1)" filter="url(#gem)"/>' + f'<path d="M-4 30 C-4 20 4 14 6 4 C14 20 14 44 0 48 C-8 48 -6 40 -4 30Z" fill="#fff8d0" opacity=".9"/>'

def em_drum(k=0):
    body = "M-46 -54 H46 L30 6 L18 64 H-18 L-30 6Z"
    s = metal_path(body, "bronze")
    s += f'<ellipse cx="0" cy="-54" rx="46" ry="12" fill="url(#en3)" filter="url(#gem)" stroke="#5a3006" stroke-width="3"/>'
    s += "".join(f'<path d="M{-44+i*11} -48 L{-26+i*7} 4" stroke="#fff6d8" stroke-width="3" opacity=".85"/>' for i in range(8))
    s += f'<rect x="-34" y="0" width="68" height="10" rx="4" fill="url(#en{k})"/>'
    s += f'<path d="M-70 -20 L-28 -70" stroke="url(#goldV)" stroke-width="9" stroke-linecap="round"/><circle cx="-28" cy="-72" r="9" fill="url(#en1)"/>'
    s += f'<path d="M70 -20 L28 -70" stroke="url(#goldV)" stroke-width="9" stroke-linecap="round"/><circle cx="28" cy="-72" r="9" fill="url(#en1)"/>'
    return s

def mini_card(x, y, rot, k):
    return (f'<g transform="translate({x} {y}) rotate({rot})"><rect x="-30" y="-44" width="60" height="88" rx="8" fill="url(#gold)" filter="url(#metal)"/>'
            f'<rect x="-23" y="-37" width="46" height="74" rx="5" fill="url(#en{k})" filter="url(#gem)"/>'
            f'<path d="M0 -20 L14 0 L0 20 L-14 0Z" fill="#fff8da" opacity=".9"/></g>')

def em_cards(k=0):
    return mini_card(-30, 6, -18, 2) + mini_card(30, 6, 18, 1) + mini_card(0, -4, 0, k)

def em_cowries():
    s = "".join(f'<g transform="translate({x:.1f} {y:.1f}) rotate({(a + 90) % 180 - 90:.0f}) scale(.32)">{cowrie(50, 70)}</g>' for i, x, y, a in ring_pos(0, 0, 58, 10))
    return s + f'<circle r="22" fill="url(#gold)" filter="url(#metal)"/><circle r="14" fill="url(#en2)" filter="url(#gem)"/>'

def em_crown(k=1):
    crown = "M-56 10 L-62 -46 L-30 -18 L0 -64 L30 -18 L62 -46 L56 10Z"
    s = metal_path(crown)
    s += "".join(f'<circle cx="{x}" cy="{y}" r="8" fill="url(#en{kk})" filter="url(#gem)"/>' for x, y, kk in ((-62, -50, 0), (0, -68, 1), (62, -50, 0)))
    s += f'<rect x="-58" y="8" width="116" height="16" rx="4" fill="url(#goldV)" filter="url(#metal)"/>'
    s += f'<path d="M-50 30 H50 L40 46 H-40Z" fill="url(#en{k})" filter="url(#gem)"/><rect x="-40" y="46" width="10" height="24" fill="url(#bronze)"/><rect x="30" y="46" width="10" height="24" fill="url(#bronze)"/>'
    return s

def em_mask(k=2):
    face = "M0 -66 C40 -66 52 -30 50 6 C48 44 26 70 0 72 C-26 70 -48 44 -50 6 C-52 -30 -40 -66 0 -66Z"
    s = metal_path(face)
    s += f'<path d="M-34 -10 Q-20 -22 -8 -10 Q-20 -4 -34 -10Z M34 -10 Q20 -22 8 -10 Q20 -4 34 -10Z" fill="#2a1404"/>'
    s += f'<path d="M0 -6 L8 26 H-8Z" fill="#7a4a10" opacity=".6"/><path d="M-16 42 Q0 52 16 42" stroke="#2a1404" stroke-width="5" fill="none" stroke-linecap="round"/>'
    s += f'<path d="M-30 -40 H30" stroke="url(#en{k})" stroke-width="8" stroke-linecap="round"/>'
    s += "".join(f'<g transform="translate({x} -72) rotate({r}) scale(.2)">{cowrie(50, 70)}</g>' for x, r in ((-30, -30), (0, 0), (30, 30)))
    return s

def em_star(k=3):
    s = metal_path(star(8, 70, 30, -90))
    s += f'<path d="{star(8, 40, 18, -90)}" fill="url(#en{k})" filter="url(#gem)"/><circle r="12" fill="#fffbe8"/>'
    return s

def laurel(r, metal="orV"):
    """Deux branches de laurier qui enlacent le bas de la médaille."""
    s = ""
    for side in (-1, 1):
        a0, a1 = (205, 105) if side < 0 else (-25, 75)
        x0, y0 = r*math.cos(math.radians(a0)), r*math.sin(math.radians(a0))
        x1, y1 = r*math.cos(math.radians(a1)), r*math.sin(math.radians(a1))
        s += f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 0 {1 if side > 0 else 0} {x1:.1f} {y1:.1f}" stroke="url(#{metal})" stroke-width="6" fill="none"/>'
        for i in range(9):
            a = math.radians(a0 + (a1 - a0)*(i + .5)/9)
            for j in (-1, 1):
                x, y = (r + j*6)*math.cos(a), (r + j*6)*math.sin(a)
                tang = math.degrees(a) + 90 + (0 if side > 0 else 180)
                rot = tang + j*35*(-1 if side < 0 else 1)
                s += (f'<path d="M0 0 C8 -10 26 -10 36 0 C26 10 8 10 0 0Z" fill="url(#{metal})" filter="url(#metal)" '
                      f'transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"/>')
    return s

RANKS = [
    ("rank-braise", "bronze", 1, em_flame, 0),
    ("rank-tambour", "bronze", 0, lambda: em_drum(1), 1),
    ("rank-mboa", "argent", 2, lambda: em_cards(0), 1),
    ("rank-notable", "argent", 0, em_cowries, 2),
    ("rank-chef-table", "or", 2, lambda: em_crown(1), 3),
    ("rank-ancetre", "or", 1, lambda: em_mask(0), 4),
    ("rank-legende-237", "or", 2, lambda: em_star(3), 5),
]

def rank(t, name, metal, k, emblem, level):
    s = deco(t, name, level) + halo(t, 236)
    if level >= 3:  # rayons d'honneur derrière la médaille
        s += f'<g transform="translate({C} {C})">' + metal_path(star(12 if level < 5 else 16, 228, 150, -90), "goldV") + '</g>'
    if level >= 5:
        s += f'<g transform="translate({C} {C+10})">{laurel(196)}</g>'
    s += coin(C, C, 170, name, metal, k, emblem="")
    s += f'<g transform="translate({C} {C}) scale(1.3)" filter="url(#sh)">{emblem()}</g>'
    if level >= 2:
        for i, x, y, a in ring_pos(C, C, 170, 4 if level < 4 else 8):
            s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="url(#gold)" filter="url(#metal)"/><circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="url(#en{i % 3})" filter="url(#gem)"/>'
    s += sparkles(t, [(C+120, C-140, .7), (C-150, C+110, .45)][: 1 + (level >= 3)])
    return s

# ───────── Économie ─────────
def a_nkap(t, name):
    return deco(t, name, 1) + halo(t) + coin(C, C, 190, name, "gold", 0) + sparkles(t, [(C+130, C-140, .8), (C-140, C+130, .45)])

def a_nkap_stack(t, name):
    s = deco(t, name, 2) + halo(t)
    for i in range(6):
        s += coin_flat(170, 380 - i*30, 112, 42, 22, "gold", 0)
    s += coin(330, 300, 130, name, "gold", 2)
    return s + sparkles(t, [(395, 175, .7), (110, 170, .5)])

def cowrie_hero(rx, ry):
    """Cauri monétaire en gros plan : coque ivoire dorée, lèvres crénelées, fente sombre."""
    out = (f'M0 {-ry} C{rx*.8:.1f} {-ry} {rx} {-ry*.45:.1f} {rx} {ry*.05:.1f} C{rx} {ry*.6:.1f} {rx*.7:.1f} {ry} 0 {ry} '
           f'C{-rx*.7:.1f} {ry} {-rx} {ry*.6:.1f} {-rx} {ry*.05:.1f} C{-rx} {-ry*.45:.1f} {-rx*.8:.1f} {-ry} 0 {-ry}Z')
    slit = f'M{rx*.02:.1f} {-ry*.86:.1f} C{rx*.14:.1f} {-ry*.35:.1f} {-rx*.12:.1f} {ry*.35:.1f} {rx*.03:.1f} {ry*.86:.1f}'
    g = f'<path d="{out}" fill="url(#shellBody)"/>'
    g += f'<path d="{slit}" stroke="#d9a55a" stroke-width="{rx*.5:.1f}" stroke-linecap="round" fill="none" opacity=".75"/>'
    teeth = ""
    for k in range(15):
        f = -0.8 + k*1.6/14
        y = f*ry; xs = rx*.08*math.sin(-f*2.4) + rx*.01
        L = rx*.2*(1 - abs(f)**2.5) + rx*.05
        for side in (-1, 1):
            teeth += f'<path d="M{xs + side*rx*.04:.1f} {y:.1f} L{xs + side*(rx*.04+L):.1f} {y - ry*.02:.1f}"/>'
    g += f'<g stroke="#fff6e0" stroke-width="{rx*.075:.1f}" stroke-linecap="round" fill="none">{teeth}</g>'
    g += f'<path d="{slit}" stroke="#3a1606" stroke-width="{rx*.085:.1f}" stroke-linecap="round" fill="none"/>'
    g += f'<path d="{out}" fill="none" stroke="#c8903e" stroke-opacity=".6" stroke-width="{rx*.06:.1f}"/>'
    hl = f'<ellipse cx="{-rx*.5:.1f}" cy="{-ry*.4:.1f}" rx="{rx*.16:.1f}" ry="{ry*.3:.1f}" fill="#fff" opacity=".85" filter="url(#soft)" transform="rotate(18 {-rx*.5:.1f} {-ry*.4:.1f})"/>'
    hl += f'<ellipse cx="{rx*.55:.1f}" cy="{ry*.35:.1f}" rx="{rx*.08:.1f}" ry="{ry*.18:.1f}" fill="#fff" opacity=".5" filter="url(#soft)"/>'
    return f'<g filter="url(#porcelain)">{g}</g>' + hl

def a_cauri(t, name):
    return deco(t, name, 3) + halo(t, 220) + f'<g transform="translate({C} {C}) rotate(-28)" filter="url(#sh)">{cowrie_hero(118, 172)}</g>' + sparkles(t, [(C+70, C-120, .9), (C-150, C+90, .5)])

def pouch(cx, cy, s, k, name, spill=True):
    body = "M-56 -96 Q-30 -70 -74 -40 C-170 20 -150 140 0 140 C150 140 170 20 74 -40 Q30 -70 56 -96Z"
    g = f'<path d="{body}" fill="url(#en{k})" filter="url(#porcelain)"/>'
    g += f'<path d="{body}" fill="{"url(#wax)" if name=="wax" else "url(#ndop)"}" opacity=".75"/>'
    g += f'<path d="M-118 40 Q0 70 118 40 L122 60 Q0 92 -122 60Z" fill="url(#goldV)" filter="url(#metal)"/>'
    g += "".join(f'<path d="M{x-9} 62 L{x} 46 L{x+9} 62Z" fill="url(#en{(k+1)%3})"/>' for x in range(-96, 100, 24))
    g += f'<path d="M-70 -44 Q0 -20 70 -44" stroke="url(#goldV)" stroke-width="12" fill="none" stroke-linecap="round" filter="url(#metal)"/>'
    g += f'<path d="M60 -40 Q90 0 76 40" stroke="url(#goldV)" stroke-width="6" fill="none"/><circle cx="76" cy="46" r="11" fill="url(#en{(k+2)%3})" filter="url(#gem)"/>'
    g += f'<ellipse cx="-70" cy="10" rx="24" ry="50" fill="#fff" opacity=".35" filter="url(#soft)" transform="rotate(20 -70 10)"/>'
    top = ""
    if spill:
        for x, y, r, sc in ((-40, -108, -30, .55), (30, -112, 25, .55), (-4, -132, 0, .6), (52, -90, 60, .45), (-62, -92, -70, .45)):
            top += f'<g transform="translate({x} {y}) rotate({r}) scale({sc})">{cowrie(50, 70)}</g>'
    return f'<g transform="translate({cx} {cy}) scale({s})" filter="url(#sh)">{top}{g}</g>'

def a_pouch(t, name):
    return deco(t, name, 4) + halo(t) + pouch(C, C+30, 1.35, 2, name) + sparkles(t, [(C+100, C-170, .7)])

def a_flask(t, name):
    cx, cy, r = C, 300, 130
    s = deco(t, name, 5) + halo(t, 230, 280)
    s += f'<circle cx="{cx}" cy="{cy}" r="{r+40}" fill="url(#en0)" opacity=".45" filter="url(#glow)"/>'
    s += f'<g filter="url(#sh)"><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#glass)" opacity=".55"/>'
    s += f'<clipPath id="liq"><circle cx="{cx}" cy="{cy}" r="{r-8}"/></clipPath>'
    s += f'<g clip-path="url(#liq)"><path d="M{cx-r} {cy-20} Q{cx-60} {cy-44} {cx} {cy-20} T{cx+r} {cy-20} V{cy+r} H{cx-r}Z" fill="url(#en0)" filter="url(#gem)"/>'
    rnd = random.Random(9)
    s += "".join(f'<circle cx="{cx+rnd.uniform(-80,80):.0f}" cy="{cy+rnd.uniform(0,100):.0f}" r="{rnd.uniform(3,9):.0f}" fill="#fff" opacity=".55"/>' for _ in range(12)) + '</g>'
    s += f'<rect x="{cx-36}" y="{cy-r-62}" width="72" height="70" rx="10" fill="url(#glass)" opacity=".6"/>'
    s += f'<rect x="{cx-48}" y="{cy-r-20}" width="96" height="22" rx="8" fill="url(#goldV)" filter="url(#metal)"/>'
    s += f'<rect x="{cx-30}" y="{cy-r-96}" width="60" height="44" rx="12" fill="url(#bronze)" filter="url(#metal)"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="url(#gold)" stroke-width="6" opacity=".9"/>'
    s += f'<ellipse cx="{cx-62}" cy="{cy-58}" rx="26" ry="54" fill="#fff" opacity=".7" transform="rotate(35 {cx-62} {cy-58})" filter="url(#soft)"/></g>'
    s += f'<g transform="translate({cx} {cy+20})">{bolt(1.15)}</g>'
    return s + sparkles(t, [(cx+120, cy-150, .7), (cx-140, cy+110, .45)])

def a_wheel(t, name):
    cx, cy, r = C, 236, 170
    s = deco(t, name, 6) + halo(t, 236, 236)
    s += f'<path d="M{cx-70} 470 L{cx-30} {cy+100} H{cx+30} L{cx+70} 470Z" fill="url(#goldV)" filter="url(#metal)"/><rect x="{cx-110}" y="456" width="220" height="26" rx="10" fill="url(#gold)" filter="url(#metal)"/>'
    s += f'<g filter="url(#sh)"><circle cx="{cx}" cy="{cy}" r="{r+22}" fill="url(#gold)" filter="url(#metal)"/>'
    for i in range(8):
        a0, a1 = math.radians(i*45-90), math.radians(i*45-45)
        k = [0, 3, 1, 3, 2, 3, 0 if name != "wax" else 1, 3][i]
        s += f'<path d="M{cx} {cy} L{cx+r*math.cos(a0):.1f} {cy+r*math.sin(a0):.1f} A{r} {r} 0 0 1 {cx+r*math.cos(a1):.1f} {cy+r*math.sin(a1):.1f}Z" fill="url(#en{k})" filter="url(#gem)"/>'
    s += "".join(f'<line x1="{cx}" y1="{cy}" x2="{cx+r*math.cos(math.radians(i*45-90)):.1f}" y2="{cy+r*math.sin(math.radians(i*45-90)):.1f}" stroke="url(#goldV)" stroke-width="7"/>' for i in range(8))
    for i, x, y, a in ring_pos(cx, cy, r+11, 16):
        s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#fffbe6"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="34" fill="url(#gold)" filter="url(#metal)"/><circle cx="{cx}" cy="{cy}" r="20" fill="url(#en2)" filter="url(#gem)"/></g>'
    s += metal_path(f"M{cx-26} {cy-r-44} H{cx+26} L{cx} {cy-r+18}Z")
    s += f'<circle cx="{cx}" cy="{cy-r-30}" r="10" fill="url(#en1)" filter="url(#gem)"/>'
    return s + sparkles(t, [(cx+160, cy-160, .7)])

def book(cx, cy, s, cover_k, tier, name, rot=-6):
    """Livre fermé vu de face, légèrement tourné. tier : normal / rare / exceptionnel."""
    W, H = 220, 290
    g = f'<rect x="{-W/2+14}" y="{-H/2+12}" width="{W}" height="{H}" rx="14" fill="#fff4dc"/>'
    g += "".join(f'<line x1="{W/2+2}" y1="{-H/2+20+i*9}" x2="{W/2+12}" y2="{-H/2+20+i*9}" stroke="#c8a46a" stroke-width="1.5"/>' for i in range(30))
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="14" fill="url(#en{cover_k})" filter="url(#porcelain)"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="14" fill="{"url(#wax)" if name=="wax" else "url(#ndop)"}" opacity=".45"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="30" height="{H}" rx="10" fill="#000" opacity=".18"/>'
    metal = {"normal": "argent", "rare": "goldV", "exceptionnel": "goldV"}[tier]
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = sx*W/2, sy*H/2
        g += f'<path d="M{x} {y} L{x-sx*46} {y} L{x} {y-sy*46}Z" fill="url(#{metal})" filter="url(#metal)"/>'
    g += f'<rect x="{-W/2+16}" y="{-H/2+16}" width="{W-32}" height="{H-32}" rx="8" fill="none" stroke="url(#{metal})" stroke-width="5"/>'
    rm = {"normal": 42, "rare": 52, "exceptionnel": 60}[tier]
    if tier != "normal":
        g += f'<path d="{star(16 if tier=="exceptionnel" else 8, rm+30, rm+4)}" fill="url(#{metal})" filter="url(#metal)"/>'
    g += f'<circle r="{rm}" fill="url(#{metal})" filter="url(#metal)"/><circle r="{rm-10}" fill="url(#en{(cover_k+1)%3})" filter="url(#gem)"/>'
    g += f'<path d="{star(8, rm-16, rm-30)}" fill="#fffbe6" opacity=".95"/>'
    if tier == "exceptionnel":
        g += f'<rect x="{W/2-12}" y="-26" width="34" height="52" rx="8" fill="url(#goldV)" filter="url(#metal)"/><circle cx="{W/2+6}" cy="0" r="10" fill="url(#en2)" filter="url(#gem)"/>'
        for i, x, y, a in ring_pos(0, 0, rm+46, 4, 45):
            g += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="url(#en{i % 3})" filter="url(#gem)"/>'
    g += f'<path d="M{-W/2+40} {-H/2+10} L{-W/2+90} {-H/2+10} L{-W/2+40} {H/2-10}Z" fill="#fff" opacity=".12"/>'
    return f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s})" filter="url(#sh)">{g}</g>'

BOOKS = {"book-normal": ("normal", 2), "book-rare": ("rare", 1), "book-exceptionnel": ("exceptionnel", 3)}

def a_book(tier, k):
    def f(t, name):
        s = deco(t, name, 7) + halo(t, 240 if tier == "exceptionnel" else 225)
        if tier == "exceptionnel":
            s += f'<circle cx="{C}" cy="{C}" r="190" fill="{t["glow"]}" opacity=".6" filter="url(#glow)"/>'
        s += book(C-6, C, 1.3, k, tier, name)
        pts = {"normal": [(C+150, C-160, .5)], "rare": [(C+150, C-160, .7), (C-160, C+150, .45)],
               "exceptionnel": [(C+150, C-170, .9), (C-170, C+150, .6), (C+170, C+120, .5)]}[tier]
        return s + sparkles(t, pts)
    return f

def a_card_back(t, name):
    W, H = 250, 370
    s = deco(t, name, 8) + halo(t, 230)
    g = f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="22" fill="url(#gold)" filter="url(#metal)"/>'
    g += f'<rect x="{-W/2+16}" y="{-H/2+16}" width="{W-32}" height="{H-32}" rx="12" fill="url(#en2)" filter="url(#gem)"/>'
    g += f'<rect x="{-W/2+16}" y="{-H/2+16}" width="{W-32}" height="{H-32}" rx="12" fill="{"url(#wax)" if name=="wax" else "url(#ndop)"}" opacity=".8"/>'
    g += f'<path d="{star(16, 96, 66)}" fill="url(#goldV)" filter="url(#metal)"/><circle r="68" fill="url(#gold)" filter="url(#metal)"/><circle r="56" fill="url(#en0)" filter="url(#gem)"/>'
    g += f'<g transform="rotate(-8) scale(.62)">{cowrie(50, 70)}</g>'
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        g += f'<circle cx="{sx*(W/2-34)}" cy="{sy*(H/2-34)}" r="9" fill="url(#en1)" filter="url(#gem)"/>'
    s += f'<g transform="translate({C} {C}) rotate(6)" filter="url(#sh)">{g}</g>'
    return s + sparkles(t, [(C+130, C-170, .7), (C-140, C+160, .45)])

def ticket(cx, cy, s, metal, k, name, stars):
    W, H, n = 380, 220, 26
    d = (f"M{-W/2+20} {-H/2} H{W/2-20} L{W/2} {-H/2+20} V{-n} A{n} {n} 0 0 0 {W/2} {n} V{H/2-20} L{W/2-20} {H/2} "
         f"H{-W/2+20} L{-W/2} {H/2-20} V{n} A{n} {n} 0 0 0 {-W/2} {-n} V{-H/2+20}Z")
    g = f'<path d="{d}" fill="url(#{metal})" filter="url(#metal)"/>'
    g += f'<rect x="{-W/2+30}" y="{-H/2+24}" width="{W-60}" height="{H-48}" rx="12" fill="url(#en{k})" filter="url(#gem)"/>'
    g += f'<rect x="{-W/2+30}" y="{-H/2+24}" width="{W-60}" height="{H-48}" rx="12" fill="{"url(#wax)" if name=="wax" else "url(#ndop)"}" opacity=".6"/>'
    g += f'<line x1="{W/2-96}" y1="{-H/2+30}" x2="{W/2-96}" y2="{H/2-30}" stroke="#fffbe6" stroke-width="5" stroke-dasharray="4 10" stroke-linecap="round"/>'
    g += f'<g transform="translate(-40 0)"><circle r="62" fill="url(#{metal})" filter="url(#metal)"/><circle r="48" fill="url(#en{(k+1)%3})" filter="url(#gem)"/><path d="{star(8, 38, 16)}" fill="#fffbe6"/></g>'
    for i in range(stars):
        g += f'<path d="{star(5, 14, 6)}" transform="translate({W/2-60} {-50+i*50})" fill="url(#goldV)" filter="url(#metal)"/>'
    g += f'<path d="M{-W/2+40} {-H/2+30} L{-W/2+140} {-H/2+30} L{-W/2+60} {H/2-30} L{-W/2+40} {H/2-30}Z" fill="#fff" opacity=".14"/>'
    return f'<g transform="translate({cx} {cy}) rotate(-8) scale({s})" filter="url(#sh)">{g}</g>'

TICKETS = {"ticket-bronze": ("bronze", 1, 1), "ticket-argent": ("argent", 2, 2), "ticket-or": ("or", 0, 3)}

def a_ticket(metal, k, stars):
    def f(t, name):
        s = deco(t, name, 9) + halo(t, 220 + stars*8)
        if stars == 3:
            s += f'<circle cx="{C}" cy="{C}" r="170" fill="{t["glow"]}" opacity=".55" filter="url(#glow)"/>'
        return s + ticket(C, C, 1.18, metal, k, name, stars) + sparkles(t, [(C+170, C-120, .4 + stars*.15)])
    return f

def chest(cx, cy, s, name):
    g = f'<circle cx="0" cy="-60" r="150" fill="#fff6c8" opacity=".8" filter="url(#glow)"/>'
    g += f'<path d="M-130 -40 L-110 -150 H110 L130 -40Z" fill="url(#en1)" filter="url(#porcelain)"/>'  # couvercle ouvert
    g += f'<path d="M-130 -40 L-110 -150 H110 L130 -40Z" fill="none" stroke="url(#goldV)" stroke-width="12"/>'
    g += "".join(f'<circle cx="{x}" cy="{y}" r="24" fill="url(#gold)" filter="url(#metal)"/>' for x, y in ((-60, -46), (-10, -60), (40, -48), (80, -40), (-90, -36)))
    g += f'<path d="M-140 -40 H140 V90 Q140 104 126 104 H-126 Q-140 104 -140 90Z" fill="url(#en1)" filter="url(#porcelain)"/>'
    g += f'<path d="M-140 -40 H140 V90 Q140 104 126 104 H-126 Q-140 104 -140 90Z" fill="{"url(#wax)" if name=="wax" else "url(#ndop)"}" opacity=".55"/>'
    g += f'<rect x="-140" y="-44" width="280" height="22" fill="url(#goldV)" filter="url(#metal)"/>'
    g += "".join(f'<rect x="{x}" y="-40" width="18" height="144" fill="url(#gold)" filter="url(#metal)"/>' for x in (-110, 92))
    g += f'<rect x="-26" y="-22" width="52" height="60" rx="10" fill="url(#gold)" filter="url(#metal)"/><circle cx="0" cy="6" r="13" fill="url(#en2)" filter="url(#gem)"/>'
    g += f'<g transform="translate(0 -128) scale(.62)">{em_crown(0)}</g>'
    return f'<g transform="translate({cx} {cy}) scale({s})" filter="url(#sh)">{g}</g>'

def a_pack(kind):
    def f(t, name):
        s = deco(t, name, 10) + halo(t, 240)
        if kind == "quartier":
            s += coin_flat(150, 370, 80, 30, 16) + coin_flat(150, 352, 80, 30, 16)
            s += pouch(300, 270, .95, 2, name)
            s += coin(140, 260, 70, name, "gold", 0)
        elif kind == "mboa":
            s += book(330, 230, .82, 2, "rare", name, 8)
            s += pouch(180, 300, .85, 1, name)
            for i in range(3):
                s += coin_flat(360, 420 - i*20, 70, 26, 14)
            s += shell(290, 420, .55, -40) + shell(430, 330, .5, 30)
        else:
            s += f'<circle cx="{C}" cy="{C}" r="200" fill="{t["glow"]}" opacity=".5" filter="url(#glow)"/>'
            s += chest(C, 300, 1.2, name)
            s += shell(110, 430, .55, -30) + shell(410, 440, .5, 40) + coin(430, 360, 46, name, "gold", 0)
        return s + sparkles(t, [(C+170, C-170, .7), (C-180, C-120, .5)])
    return f

ASSETS = {
    "economy/nkap": a_nkap, "economy/nkap-stack": a_nkap_stack, "economy/cauri": a_cauri, "economy/cauris-pouch": a_pouch,
    "economy/energy-flask": a_flask, "economy/loyalty-wheel": a_wheel,
    "economy/pack-quartier": a_pack("quartier"), "economy/pack-mboa": a_pack("mboa"), "economy/pack-chefferie": a_pack("chefferie"),
    **{f"tickets/{n}": a_ticket(*v) for n, v in TICKETS.items()},
    **{f"books/{n}": a_book(*v) for n, v in BOOKS.items()}, "books/card-back": a_card_back,
    **{f"ranks/{n}": (lambda m, k, e, l: (lambda t, name: rank(t, name, m, k, e, l)))(m, k, e, l) for n, m, k, e, l in RANKS},
}

def plain_svg(defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}"><defs>{defs}</defs>{body}</svg>'

if __name__ == "__main__":
    import style_wax, style_aurore
    out = os.path.join(os.path.dirname(__file__), "out")
    only = sys.argv[1:]
    for theme in ("soleil", "wax", "aurore"):
        os.makedirs(os.path.join(out, theme), exist_ok=True)
        for path, fn in ASSETS.items():
            key = path.split("/")[1]
            if only and key not in only:
                continue
            if theme == "soleil":
                doc = svg(THEMES["soleil"], fn(THEMES["soleil"], "soleil"))
            elif theme == "wax":
                doc = plain_svg(style_wax.DEFS, style_wax.ASSETS[key]())
            else:
                doc = plain_svg(style_aurore.DEFS, style_aurore.ASSETS[key]())
            open(os.path.join(out, theme, f"{key}.svg"), "w").write(doc)
    print("ok", len(ASSETS), "assets × 3 directions")
