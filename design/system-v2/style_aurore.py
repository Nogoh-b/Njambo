"""Itération C « Aurore cristal » : verre et pierres taillées qui lévitent dans la
lumière — facettes, reflets nacrés, anneaux d'orbite, faisceaux. Chaque rang est
une taille de gemme différente."""
import math, random

C = 256
TINT = {
    "lilac": "#a98bff", "aqua": "#43e3e0", "rose": "#ff8cc6", "champ": "#f6c84a", "ice": "#bfe6ff",
    "amber": "#ffa95a", "copper": "#e8743e", "silver": "#b8c6e6", "mint": "#7ff0b6", "violet": "#7a5cff",
}
_n = [0]
def uid(p="a"):
    _n[0] += 1
    return f"{p}{_n[0]}"

def hx(c):
    c = c.lstrip("#"); return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))
def mix(a, b, t):
    A, B = hx(a), hx(b)
    return "#" + "".join(f"{round(A[i] + (B[i]-A[i])*t):02x}" for i in range(3))

DEFS = '''
<linearGradient id="aSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".15"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>
<linearGradient id="aIris" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd6ee"/><stop offset=".3" stop-color="#d8ccff"/><stop offset=".55" stop-color="#bff4ff"/><stop offset=".8" stop-color="#fff2c8"/><stop offset="1" stop-color="#ffc8e4"/></linearGradient>
<radialGradient id="aPearl" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#ffe8f6"/><stop offset=".65" stop-color="#dcd2ff"/><stop offset="1" stop-color="#9fd8f0"/></radialGradient>
<radialGradient id="aBeam" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="aBeamV" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="aGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="aGlowS" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="aBloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
'''

def poly(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"

def reg(cx, cy, r, n, rot=-90, sy=1.0):
    return [(cx + r*math.cos(math.radians(rot + i*360/n)), cy + sy*r*math.sin(math.radians(rot + i*360/n))) for i in range(n)]

def gem_cut(pts, tint, inner=.56, glyph="", table_tint=None, crown=None):
    """Gemme taillée : couronne de facettes éclairées selon leur orientation, table claire, arêtes blanches."""
    cx = sum(p[0] for p in pts)/len(pts); cy = sum(p[1] for p in pts)/len(pts)
    q = [(cx + (x-cx)*inner, cy + (y-cy)*inner) for x, y in pts]
    s = f'<path d="{poly(pts)}" fill="{tint}" opacity=".55" filter="url(#aGlow)"/>'
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i+1) % n]
        mx, my = (a[0]+b[0])/2 - cx, (a[1]+b[1])/2 - cy
        ang = math.atan2(my, mx)
        lit = .5 + .5*math.cos(ang - math.radians(-135))  # lumière en haut à gauche
        col = mix(mix(tint, "#2a0e80", .32), mix(tint, "#ffffff", .7), lit)
        s += f'<path d="{poly([a, b, q[(i+1) % n], q[i]])}" fill="{col}"/>'
        # demi-facettes pour l'éclat
        m = ((a[0]+b[0])/2, (a[1]+b[1])/2)
        s += f'<path d="{poly([a, m, q[i]])}" fill="#fff" opacity="{.18*lit:.2f}"/>'
    tt = table_tint or mix(tint, "#ffffff", .45)
    i = uid()
    s += f'<linearGradient id="{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="{tt}"/><stop offset="1" stop-color="{tint}"/></linearGradient>'
    s += f'<path d="{poly(q)}" fill="url(#{i})"/>'
    s += f'<path d="{poly(q)}" fill="url(#aIris)" opacity=".35" style="mix-blend-mode:overlay"/>'
    s += "".join(f'<line x1="{pts[i][0]:.1f}" y1="{pts[i][1]:.1f}" x2="{q[i][0]:.1f}" y2="{q[i][1]:.1f}" stroke="#fff" stroke-opacity=".7" stroke-width="1.6"/>' for i in range(n))
    s += f'<path d="{poly(q)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>'
    s += f'<path d="{poly(pts)}" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>'
    if glyph:
        s += f'<g transform="translate({cx:.1f} {cy:.1f})">{glyph}</g>'
    return s

def light_glyph(d, s=1.0, w=7, fill=False):
    st = f'fill="#fff"' if fill else f'fill="none" stroke="#fff" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"'
    return (f'<g transform="scale({s})"><path d="{d}" {st.replace("#fff", "#7a5cff")} opacity=".55" filter="url(#aGlowS)"/>'
            f'<path d="{d}" {st} filter="url(#aBloom)"/></g>')

def orbit(cx, cy, rx, ry, rot, col="#fff", op=.75, dots=2, seed=1, w=2.5):
    rnd = random.Random(seed)
    s = f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{col}" stroke-opacity="{op}" stroke-width="{w}" transform="rotate({rot} {cx} {cy})"/>'
    for _ in range(dots):
        a = rnd.uniform(0, 2*math.pi)
        x = cx + rx*math.cos(a); y = cy + ry*math.sin(a)
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        X = cx + (x-cx)*ca - (y-cy)*sa; Y = cy + (x-cx)*sa + (y-cy)*ca
        s += f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{rnd.uniform(4,7):.1f}" fill="#fff" filter="url(#aBloom)"/>'
    return s

def twinkle(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})" filter="url(#aBloom)"><path d="M0 -30 Q2 -2 30 0 Q2 2 0 30 Q-2 2 -30 0 Q-2 -2 0 -30Z" fill="#fff"/>'
            f'<circle r="4" fill="#fff"/></g>')

def ambience(tints, seed, r=220, rings=True):
    rnd = random.Random(seed)
    s = "".join(f'<circle cx="{C + rnd.uniform(-60, 60):.0f}" cy="{C + rnd.uniform(-60, 60):.0f}" r="{r*rnd.uniform(.55, .8):.0f}" fill="{TINT[t]}" opacity=".32" filter="url(#aGlow)"/>' for t in tints)
    s += "".join(f'<circle cx="{C + rnd.uniform(-225, 225):.0f}" cy="{C + rnd.uniform(-225, 225):.0f}" r="{rnd.uniform(1.5, 3.5):.1f}" fill="#fff" opacity="{rnd.uniform(.5, 1):.2f}"/>' for _ in range(22))
    return s

def floor(cy=470, rx=130, tint="lilac"):
    return f'<ellipse cx="{C}" cy="{cy}" rx="{rx}" ry="{rx*.16:.0f}" fill="{TINT[tint]}" opacity=".45" filter="url(#aGlowS)"/>'

def glass(d, tint, op=.38):
    i = uid()
    return (f'<path d="{d}" fill="{tint}" fill-opacity="{op}"/><path d="{d}" fill="url(#aSheen)" opacity=".7"/>'
            f'<path d="{d}" fill="none" stroke="#fff" stroke-width="3.5" stroke-opacity=".95"/>')

def pearl_cowrie(cx, cy, rx, ry, rot=0):
    out = (f'M0 {-ry} C{rx*.8:.1f} {-ry} {rx} {-ry*.45:.1f} {rx} {ry*.05:.1f} C{rx} {ry*.62:.1f} {rx*.7:.1f} {ry} 0 {ry} '
           f'C{-rx*.7:.1f} {ry} {-rx} {ry*.62:.1f} {-rx} {ry*.05:.1f} C{-rx} {-ry*.45:.1f} {-rx*.8:.1f} {-ry} 0 {-ry}Z')
    slit = f'M{rx*.04:.1f} {-ry*.82:.1f} C{rx*.16:.1f} {-ry*.3:.1f} {-rx*.12:.1f} {ry*.3:.1f} {rx*.04:.1f} {ry*.82:.1f}'
    g = f'<g transform="translate({cx} {cy}) rotate({rot})"><path d="{out}" fill="url(#aPearl)"/>'
    g += f'<path d="{out}" fill="url(#aIris)" opacity=".45" style="mix-blend-mode:overlay"/>'
    for k in range(13):
        f = -.78 + k*1.56/12; y = f*ry; xs = rx*.08*math.sin(-f*2.4) + rx*.02; L = rx*.2*(1 - abs(f)**2.4) + rx*.05
        g += f'<path d="M{xs-L-rx*.04:.1f} {y:.1f} H{xs+L+rx*.04:.1f}" stroke="#b9a8e8" stroke-width="{max(1.6, rx*.06):.1f}" stroke-linecap="round" opacity=".8"/>'
    g += f'<path d="{slit}" stroke="#5a3e9a" stroke-width="{max(2.5, rx*.08):.1f}" fill="none" stroke-linecap="round"/>'
    g += f'<path d="{out}" fill="none" stroke="#fff" stroke-width="2.5"/>'
    g += f'<ellipse cx="{-rx*.45:.1f}" cy="{-ry*.45:.1f}" rx="{rx*.14:.1f}" ry="{ry*.24:.1f}" fill="#fff" opacity=".9" transform="rotate(18 {-rx*.45:.1f} {-ry*.45:.1f})"/>'
    return g + '</g>'

N_GLYPH = "M-30 40 V-40 L30 40 V-40"

def crystal(x, y, w, h, tint, rot=0):
    """Prisme hexagonal pointu (cristal de quartz)."""
    t = h*.28
    pts_l = [(x-w/2, y), (x-w/2, y-h+t), (x-w/6, y-h), (x-w/6, y+w*.12)]
    pts_m = [(x-w/6, y+w*.12), (x-w/6, y-h), (x+w/6, y-h-t*.15), (x+w/6, y+w*.12)]
    pts_r = [(x+w/6, y+w*.12), (x+w/6, y-h-t*.15), (x+w/2, y-h+t), (x+w/2, y)]
    top_tip = (x+w*.02, y-h-t*1.1)
    s = f'<g transform="rotate({rot} {x} {y})">'
    s += f'<path d="{poly([(x-w/2, y), (x-w/2, y-h+t), top_tip, (x+w/2, y-h+t), (x+w/2, y), (x, y+w*.2)])}" fill="{tint}" opacity=".6" filter="url(#aGlow)"/>'
    s += f'<path d="{poly(pts_l)}" fill="{mix(tint, "#ffffff", .55)}"/><path d="{poly(pts_m)}" fill="{mix(tint, "#ffffff", .2)}"/><path d="{poly(pts_r)}" fill="{mix(tint, "#2a1a70", .3)}"/>'
    s += f'<path d="{poly([(x-w/2, y-h+t), (x-w/6, y-h), top_tip])}" fill="#fff" opacity=".95"/>'
    s += f'<path d="{poly([(x-w/6, y-h), (x+w/6, y-h-t*.15), top_tip])}" fill="{mix(tint, "#ffffff", .7)}"/>'
    s += f'<path d="{poly([(x+w/6, y-h-t*.15), (x+w/2, y-h+t), top_tip])}" fill="{mix(tint, "#ffffff", .35)}"/>'
    s += f'<path d="{poly([(x-w/2, y), (x-w/2, y-h+t), top_tip, (x+w/2, y-h+t), (x+w/2, y), (x+w/6, y+w*.12), (x-w/6, y+w*.12)])}" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>'
    s += f'<line x1="{x-w/6}" y1="{y+w*.12}" x2="{x-w/6}" y2="{y-h}" stroke="#fff" stroke-opacity=".8" stroke-width="1.6"/><line x1="{x+w/6}" y1="{y+w*.12}" x2="{x+w/6}" y2="{y-h-t*.15}" stroke="#fff" stroke-opacity=".6" stroke-width="1.6"/>'
    return s + '</g>'

# ───────── Assets ─────────
def nkap():
    s = ambience(["champ", "lilac"], 1) + floor(470, 120, "champ")
    s += orbit(C, C, 220, 60, -18, dots=2, seed=2)
    s += gem_cut(reg(C, C-6, 170, 8, -112.5), TINT["champ"], .62, light_glyph(N_GLYPH, 1.3, 12))
    s += orbit(C, C, 220, 60, -18, op=.0) + twinkle(400, 120, 1) + twinkle(110, 380, .6)
    return s

def nkap_stack():
    s = ambience(["champ", "aqua"], 2) + floor(480, 150, "champ")
    s += f'<path d="M{C-120} 480 L{C-90} 60 H{C+90} L{C+120} 480Z" fill="url(#aBeamV)" opacity=".5"/>'
    for i in range(5):
        y = 430 - i*72
        s += gem_cut(reg(C, y, 130 - i*4, 8, -112.5, .34), TINT["champ" if i % 2 == 0 else "lilac"], .66)
    s += f'<g transform="translate({C} {430-4*72}) scale(1 .34)">{light_glyph(N_GLYPH, 1.1, 12)}</g>'
    s += twinkle(400, 110, .9) + twinkle(110, 200, .6)
    return s

def cauri():
    s = ambience(["rose", "aqua"], 3) + floor(480, 120, "rose")
    s += f'<circle cx="{C}" cy="{C}" r="190" fill="url(#aIris)" opacity=".22"/>'
    s += pearl_cowrie(C, C, 100, 146, -24)
    s += f'<circle cx="{C}" cy="{C}" r="190" fill="none" stroke="#fff" stroke-width="3.5" stroke-opacity=".9"/>'
    s += f'<path d="M{C-150} {C-80} A170 170 0 0 1 {C-40} {C-180}" stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none" opacity=".75"/>'
    s += orbit(C, C, 236, 58, 24, dots=3, seed=4) + twinkle(410, 110, .9)
    return s

def pouch():
    s = ambience(["lilac", "rose"], 4) + floor(480, 140, "lilac")
    jar = f"M{C-120} {C-60} C{C-180} {C} {C-170} {C+180} {C} {C+200} C{C+170} {C+180} {C+180} {C} {C+120} {C-60}Z"
    s += f'<path d="{jar}" fill="{TINT["lilac"]}" fill-opacity=".25"/>'
    rnd = random.Random(7)
    for k in range(11):
        x = C + rnd.uniform(-110, 110); y = C + 60 + rnd.uniform(-20, 110)
        s += pearl_cowrie(x, y, 26, 38, rnd.uniform(-70, 70))
    s += glass(jar, TINT["lilac"], .12)
    s += f'<path d="M{C-130} {C+40} Q{C-140} {C+130} {C-80} {C+170}" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none" opacity=".7"/>'
    s += f'<rect x="{C-128}" y="{C-92}" width="256" height="40" rx="14" fill="url(#aIris)" stroke="#fff" stroke-width="3"/>'
    s += gem_cut(reg(C, C-130, 52, 6), TINT["rose"], .55)
    s += twinkle(420, 150, .9) + twinkle(90, 230, .6)
    return s

def flask():
    s = ambience(["aqua", "lilac"], 5) + floor(490, 100, "aqua")
    d = f"M{C} 70 L{C+120} {C+40} L{C} 470 L{C-120} {C+40}Z"
    s += f'<path d="{d}" fill="{TINT["aqua"]}" opacity=".5" filter="url(#aGlow)"/>'
    i = uid()
    s += f'<clipPath id="{i}"><path d="{d}"/></clipPath><g clip-path="url(#{i})"><path d="M{C-130} {C+10} Q{C-60} {C-14} {C} {C+10} T{C+130} {C+10} V480 H{C-130}Z" fill="{TINT["aqua"]}"/>'
    rnd = random.Random(3)
    s += "".join(f'<circle cx="{C + rnd.uniform(-60, 60):.0f}" cy="{rnd.uniform(C+30, 430):.0f}" r="{rnd.uniform(3, 8):.0f}" fill="#fff" opacity=".7"/>' for _ in range(12)) + '</g>'
    s += glass(d, TINT["ice"], .15)
    s += f'<path d="M{C} 70 L{C} 470 M{C-120} {C+40} H{C+120}" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>'
    s += gem_cut(reg(C, 64, 36, 6), TINT["lilac"], .5)
    s += f'<g transform="translate({C} {C+80})">{light_glyph("M8 -56 L-26 6 L-2 6 L-10 56 L26 -8 L2 -8Z", 1.0, 0, True)}</g>'
    s += orbit(C, C+40, 200, 46, -12, dots=2, seed=6) + twinkle(400, 120, .9)
    return s

def wheel():
    s = ambience(["rose", "aqua", "champ"], 6) + floor(486, 140, "rose")
    cx, cy = C, 236
    tints = ["rose", "champ", "aqua", "lilac", "rose", "champ", "aqua", "lilac"]
    for i in range(8):
        a0, a1 = math.radians(i*45-90+2), math.radians(i*45-45-2)
        r0, r1 = 92, 178
        d = (f"M{cx+r0*math.cos(a0):.1f} {cy+r0*math.sin(a0):.1f} L{cx+r1*math.cos(a0):.1f} {cy+r1*math.sin(a0):.1f} "
             f"A{r1} {r1} 0 0 1 {cx+r1*math.cos(a1):.1f} {cy+r1*math.sin(a1):.1f} L{cx+r0*math.cos(a1):.1f} {cy+r0*math.sin(a1):.1f} "
             f"A{r0} {r0} 0 0 0 {cx+r0*math.cos(a0):.1f} {cy+r0*math.sin(a0):.1f}Z")
        s += glass(d, TINT[tints[i]], .7)
    s += f'<circle cx="{cx}" cy="{cy}" r="196" fill="none" stroke="url(#aIris)" stroke-width="8"/>'
    s += gem_cut(reg(cx, cy, 70, 8, -112.5), TINT["lilac"], .55, light_glyph("M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6Z", 1, 0, True))
    s += gem_cut([(cx-26, 22), (cx+26, 22), (cx, 84)], TINT["rose"], .45)
    s += orbit(cx, cy, 230, 60, -10, dots=2, seed=9) + twinkle(420, 400, .7)
    return s

def pack_quartier():
    s = ambience(["aqua"], 7) + floor(470, 110, "aqua")
    s += crystal(C, 440, 130, 300, TINT["aqua"], -6)
    s += orbit(C, 300, 200, 50, -14, dots=2, seed=10) + twinkle(400, 130, .8)
    return s

def pack_mboa():
    s = ambience(["lilac", "rose"], 8) + floor(470, 170, "lilac")
    s += crystal(C-80, 450, 100, 220, TINT["rose"], -22) + crystal(C+86, 452, 96, 200, TINT["aqua"], 20)
    s += crystal(C, 450, 120, 300, TINT["lilac"], 0)
    s += gem_cut(reg(400, 130, 40, 8, -112.5), TINT["champ"], .6, light_glyph("M-10 13 V-13 L10 13 V-13", 1, 4))
    s += twinkle(110, 140, .7)
    return s

def pack_chefferie():
    s = ambience(["champ", "lilac", "rose"], 9) + floor(476, 200, "champ")
    s += f'<path d="M{C-150} 480 L{C-60} 40 H{C+60} L{C+150} 480Z" fill="url(#aBeamV)" opacity=".45"/>'
    s += crystal(C-130, 460, 80, 170, TINT["aqua"], -32) + crystal(C+132, 462, 80, 170, TINT["rose"], 30)
    s += crystal(C-70, 460, 100, 250, TINT["lilac"], -14) + crystal(C+74, 460, 100, 240, TINT["violet"], 14)
    s += crystal(C, 460, 128, 330, TINT["champ"], 0)
    s += orbit(C, 90, 120, 26, 0, col="#fff6d0", op=.95, dots=5, seed=11, w=4)
    s += twinkle(420, 120, 1) + twinkle(90, 150, .7)
    return s

def ticket(tier):
    tint = {"bronze": "copper", "argent": "silver", "or": "champ"}[tier]
    stars = {"bronze": 1, "argent": 2, "or": 3}[tier]
    s = ambience([tint, "lilac"], 10 + stars) + floor(440, 150, tint)
    W, H = 360, 220
    g = f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="28" fill="{TINT[tint]}" opacity=".6" filter="url(#aGlow)"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="28" fill="{TINT[tint]}" fill-opacity=".95"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="28" fill="url(#aIris)" opacity=".3"/>'
    i = uid()
    g += f'<clipPath id="{i}"><rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="28"/></clipPath><g clip-path="url(#{i})">'
    g += "".join(f'<path d="M{-W/2+x} {-H/2} l60 0 l-120 {H} l-60 0Z" fill="#fff" opacity="{op}"/>' for x, op in ((60, .35), (150, .18), (300, .25)))
    g += '</g>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="28" fill="url(#aSheen)" opacity=".6"/>'
    g += f'<rect x="{-W/2+14}" y="{-H/2+14}" width="{W-28}" height="{H-28}" rx="18" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="1 9" stroke-linecap="round"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="28" fill="none" stroke="#fff" stroke-width="4"/>'
    g += f'<line x1="{W/2-100}" y1="{-H/2+20}" x2="{W/2-100}" y2="{H/2-20}" stroke="#fff" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>'
    g += gem_cut(reg(-50, 0, 64, 8, -112.5), TINT[tint], .55, light_glyph("M0 -24 L7 -7 L24 0 L7 7 L0 24 L-7 7 L-24 0 L-7 -7Z", 1, 0, True))
    for k in range(stars):
        g += gem_cut(reg(W/2-50, (k - (stars-1)/2)*52, 18, 4), TINT["lilac" if tier != "or" else "rose"], .5)
    s += f'<g transform="translate({C} {C-10}) rotate(-10)">{g}</g>'
    s += orbit(C, C, 236, 52, -10, dots=stars, seed=12) + twinkle(420, 120, .5 + .15*stars)
    return s

def book(tier):
    tint = {"normal": "aqua", "rare": "rose", "exceptionnel": "lilac"}[tier]
    pages = {"normal": 1, "rare": 3, "exceptionnel": 5}[tier]
    s = ambience([tint, "champ"], 14 + pages) + floor(476, 150, tint)
    s += f'<path d="M{C-150} 420 L{C-100} 40 H{C+100} L{C+150} 420Z" fill="url(#aBeamV)" opacity="{.25 + .07*pages:.2f}"/>'
    rnd = random.Random(pages)
    for k in range(pages):
        a = (k - (pages-1)/2)*30 + rnd.uniform(-6, 6)
        x = C + (k - (pages-1)/2)*62; y = 170 - (abs(k - (pages-1)/2) < .6)*40 + abs(k - (pages-1)/2)*8
        g = f'<rect x="-34" y="-48" width="68" height="96" rx="8" fill="url(#aIris)" stroke="#fff" stroke-width="3"/>'
        g += f'<rect x="-34" y="-48" width="68" height="96" rx="8" fill="{TINT[tint]}" opacity=".35"/>'
        g += light_glyph("M0 -18 L5 -5 L18 0 L5 5 L0 18 L-5 5 L-18 0 L-5 -5Z", 1, 0, True)
        s += f'<g transform="translate({x:.0f} {y:.0f}) rotate({a:.0f})" opacity=".95">{g}</g>'
    # livre ouvert en verre
    s += f'<path d="M{C-180} 330 Q{C-90} 300 {C} 330 Q{C+90} 300 {C+180} 330 L{C+180} 430 Q{C+90} 400 {C} 430 Q{C-90} 400 {C-180} 430Z" fill="{TINT[tint]}" fill-opacity=".85" stroke="#fff" stroke-width="3.5"/>'
    s += f'<path d="M{C-166} 318 Q{C-90} 282 {C} 314 V414 Q{C-90} 384 {C-166} 416Z" fill="url(#aIris)" stroke="#fff" stroke-width="3"/>'
    s += f'<path d="M{C+166} 318 Q{C+90} 282 {C} 314 V414 Q{C+90} 384 {C+166} 416Z" fill="#ffffff" fill-opacity=".9" stroke="#fff" stroke-width="3"/>'
    for side in (-1, 1):
        for k in range(4):
            y = 336 + k*17
            s += f'<path d="M{C+side*22} {y} Q{C+side*86} {y-24} {C+side*146} {y-4}" stroke="{TINT[tint]}" stroke-opacity=".7" stroke-width="3" fill="none" stroke-linecap="round"/>'
    s += f'<ellipse cx="{C}" cy="318" rx="120" ry="22" fill="#fff" opacity=".55" filter="url(#aGlowS)"/>'
    if tier == "exceptionnel":
        s += orbit(C, 200, 220, 54, -8, col="#fff6d0", dots=3, seed=15, w=3.5)
    s += twinkle(420, 110, .5 + .12*pages) + twinkle(90, 150, .3 + .1*pages)
    return s

def card_back():
    s = ambience(["violet", "rose"], 18) + floor(480, 120, "lilac")
    W, H = 240, 360
    g = f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="26" fill="#3a2a90" opacity=".6" filter="url(#aGlow)"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="26" fill="#2c2070"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="26" fill="url(#aIris)" opacity=".28"/>'
    rnd = random.Random(5)
    pts = [(rnd.uniform(-90, 90), rnd.uniform(-150, 150)) for _ in range(9)]
    g += "".join(f'<line x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>' for a, b in zip(pts, pts[1:]))
    g += "".join(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(2, 4.5):.1f}" fill="#fff" filter="url(#aBloom)"/>' for x, y in pts)
    g += f'<circle r="74" fill="none" stroke="url(#aIris)" stroke-width="5"/>'
    g += gem_cut(reg(0, 0, 58, 8, -112.5), TINT["rose"], .55)
    g += pearl_cowrie(0, 0, 20, 30, -10)
    g += f'<rect x="{-W/2+12}" y="{-H/2+12}" width="{W-24}" height="{H-24}" rx="16" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="26" fill="url(#aSheen)" opacity=".5"/>'
    g += f'<rect x="{-W/2}" y="{-H/2}" width="{W}" height="{H}" rx="26" fill="none" stroke="#fff" stroke-width="4"/>'
    s += f'<g transform="translate({C} {C-6}) rotate(8)">{g}</g>' + twinkle(420, 110, .9) + twinkle(80, 400, .6)
    return s

GLYPHS = {
    "flame": ("M0 -40 C16 -20 32 -8 28 14 C24 32 12 40 0 40 C-14 40 -28 32 -28 14 C-30 -4 -14 -12 -10 -26 C-4 -16 -2 -30 0 -40Z", 1.4),
    "drum": ("M-30 -30 H30 L18 6 L10 40 H-10 L-18 6Z M-30 -30 L-18 6 M30 -30 L18 6 M-14 -30 L-6 6 M14 -30 L6 6", 1.3),
    "cards": ("M-34 -24 L-6 -34 L8 6 L-20 16Z M-4 -30 H26 V14 H-4Z M8 -14 L14 -8 L8 -2 L2 -8Z", 1.6),
    "cowrie": ("M0 -36 C20 -36 26 -18 26 0 C26 20 18 36 0 36 C-18 36 -26 20 -26 0 C-26 -18 -20 -36 0 -36Z M2 -26 C6 -10 -4 10 2 26", 1.4),
    "crown": ("M-34 18 L-40 -22 L-18 -4 L0 -32 L18 -4 L40 -22 L34 18Z", 1.4),
    "mask": ("M0 -40 C22 -40 28 -18 26 4 C24 26 12 40 0 42 C-12 40 -24 26 -26 4 C-28 -18 -22 -40 0 -40Z M-16 -4 H-4 M4 -4 H16 M-8 22 Q0 28 8 22", 1.4),
    "star": ("M0 -40 L10 -12 L40 -12 L16 6 L26 36 L0 18 L-26 36 L-16 6 L-40 -12 L-10 -12Z", 1.4),
}

RANKS = {
    "rank-braise": ("flame", "amber", lambda: reg(C, C+16, 190, 3), .5),
    "rank-tambour": ("drum", "copper", lambda: reg(C, C, 176, 6), .55),
    "rank-mboa": ("cards", "aqua", lambda: [(C-150, C-150), (C+150, C-150), (C+150, C+150), (C-150, C+150)], .55),
    "rank-notable": ("cowrie", "lilac", lambda: [(C-150, C-140), (C+150, C-140), (C+150, C+20), (C, C+180), (C-150, C+20)], .55),
    "rank-chef-table": ("crown", "champ", lambda: [(C-170, C-120), (C-80, C-60), (C, C-170), (C+80, C-60), (C+170, C-120), (C+140, C+110), (C, C+180), (C-140, C+110)], .52),
    "rank-ancetre": ("mask", "rose", lambda: [(C, C-200), (C+110, C-80), (C+120, C+40), (C, C+200), (C-120, C+40), (C-110, C-80)], .55),
    "rank-legende-237": ("star", "violet", None, .5),
}

def rank(key):
    glyph, tint, shape, inner = RANKS[key]
    level = list(RANKS).index(key)
    s = ambience([tint, "lilac" if tint != "lilac" else "rose"], 30 + level) + floor(486, 120 + level*8, tint)
    if level >= 4:
        s += f'<path d="M{C-140} 486 L{C-70} 30 H{C+70} L{C+140} 486Z" fill="url(#aBeamV)" opacity=".2"/>'
    if key == "rank-legende-237":
        star = []
        for i in range(16):
            r = 210 if i % 2 == 0 else 120
            a = math.radians(-90 + i*22.5)
            star.append((C + r*math.cos(a), C + r*math.sin(a)))
        s += gem_cut(star, TINT["violet"], .52, light_glyph(GLYPHS["star"][0], 1.5, 0, True), TINT["champ"])
        s += orbit(C, C, 236, 70, -20, col="#fff6d0", dots=3, seed=40, w=3.5) + orbit(C, C, 236, 70, 40, col="#d8f4ff", dots=2, seed=41, w=2.5)
        s += (f'<text x="{C}" y="{C+150}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="44" '
              f'fill="#fff" stroke="#7a5cff" stroke-width="7" paint-order="stroke" filter="url(#aBloom)">237</text>')
    else:
        d, sc = GLYPHS[glyph]
        s += gem_cut(shape(), TINT[tint], inner, light_glyph(d, sc, 7, glyph in ("crown", "star")))
        if level >= 2:
            s += orbit(C, C, 226, 56, -14 + level*6, dots=level - 1, seed=level)
    s += twinkle(410, 110, .6 + level*.06)
    return s

ASSETS = {
    "nkap": nkap, "nkap-stack": nkap_stack, "cauri": cauri, "cauris-pouch": pouch, "energy-flask": flask, "loyalty-wheel": wheel,
    "pack-quartier": pack_quartier, "pack-mboa": pack_mboa, "pack-chefferie": pack_chefferie,
    "ticket-bronze": lambda: ticket("bronze"), "ticket-argent": lambda: ticket("argent"), "ticket-or": lambda: ticket("or"),
    "book-normal": lambda: book("normal"), "book-rare": lambda: book("rare"), "book-exceptionnel": lambda: book("exceptionnel"), "card-back": card_back,
    **{k: (lambda k: (lambda: rank(k)))(k) for k in RANKS},
}
