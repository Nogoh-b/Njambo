"""Packs d'interface Njambo (icônes, navigation, boutons, modes de jeu) en trois
directions : soleil (métal ciselé), wax (autocollant), cristal (gemmes et verre).
Usage : python3 gen_ui.py && node render2x.js out_ui/*/*/*.svg"""
import math, os, random, sys

sys.path.insert(0, os.path.dirname(__file__))
import gen as soleil_lib          # noqa: E402  (métal, émaux, halo)
import style_wax as wx            # noqa: E402
import style_aurore as cr         # noqa: E402

# ───────── Glyphes communs (repère -50..50, traits) ─────────
def gear():
    pts = []
    for i in range(32):
        a = math.radians(i*360/32)
        r = 34 if (i // 2) % 2 == 0 else 24
        pts.append(f"{r*math.cos(a):.1f} {r*math.sin(a):.1f}")
    return "M" + " L".join(pts) + "Z M10 0 A10 10 0 1 0 -10 0 A10 10 0 1 0 10 0Z"

def star5(r1=36, r2=15):
    return "M" + " L".join(f"{(r1 if i%2==0 else r2)*math.cos(math.radians(-90+i*36)):.1f} {(r1 if i%2==0 else r2)*math.sin(math.radians(-90+i*36)):.1f}" for i in range(10)) + "Z"

GLYPHS = {  # (traits, remplissages)
    "bot": ("M-30 -12 H30 V30 H-30Z M0 -12 V-28", "M0 -34 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M-13 9 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M13 9 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0"),
    "cards": ("M-36 -22 L-6 -30 L6 22 L-24 30Z M2 -30 H32 V26 H2", "M17 -6 C11 -14 3 -6 17 6 C31 -6 23 -14 17 -6Z"),
    "check": ("M-30 2 L-8 24 L32 -24", ""),
    "code": ("M-16 -24 L-38 0 L-16 24 M16 -24 L38 0 L16 24 M6 -32 L-6 32", ""),
    "coin": ("M34 0 A34 34 0 1 1 -34 0 A34 34 0 1 1 34 0Z M-12 15 V-15 L12 15 V-15", ""),
    "copy": ("M-28 -32 H10 V16 H-28Z M-12 16 V32 H28 V-16 H10", ""),
    "crown": ("M-34 22 L-38 -20 L-16 0 L0 -30 L16 0 L38 -20 L34 22Z", "M-34 22 H34 V30 H-34Z"),
    "cut": ("M-14 14 L22 -32 M14 14 L-22 -32 M-12 24 A11 11 0 1 1 -34 24 A11 11 0 1 1 -12 24Z M34 24 A11 11 0 1 1 12 24 A11 11 0 1 1 34 24Z", ""),
    "empty": ("M-32 -22 H32 V26 H-32Z M-32 -22 L-20 -36 H20 L32 -22 M-10 4 H10", ""),
    "eye": ("M-40 0 Q0 -38 40 0 Q0 38 -40 0Z", "M12 0 A12 12 0 1 1 -12 0 A12 12 0 1 1 12 0Z"),
    "friends": ("M-34 32 A20 20 0 0 1 6 32 M4 32 A16 16 0 0 1 36 32 M-3 -10 A11 11 0 1 1 -25 -10 A11 11 0 1 1 -3 -10Z M27 -6 A10 10 0 1 1 7 -6 A10 10 0 1 1 27 -6Z", ""),
    "globe": ("M34 0 A34 34 0 1 1 -34 0 A34 34 0 1 1 34 0Z M14 0 A14 34 0 1 1 -14 0 A14 34 0 1 1 14 0Z M-34 0 H34 M-29 -17 H29 M-29 17 H29", ""),
    "history": ("M-30 -6 A32 32 0 1 1 -20 24 M-38 -18 L-30 -4 L-16 -12 M0 -16 V2 L14 10", ""),
    "home": ("M-38 -2 L0 -34 L38 -2 M-26 -10 V32 H26 V-10 M-8 32 V12 H8 V32", ""),
    "hourglass": ("M-24 -34 H24 M-24 34 H24 M-18 -34 Q-18 -6 0 0 Q18 -6 18 -34 M-18 34 Q-18 6 0 0 Q18 6 18 34", "M-12 30 Q0 14 12 30Z"),
    "language": ("M-36 -26 H2 M-17 -34 V-26 M-28 -26 Q-20 4 2 10 M-4 -26 Q-12 0 -32 10 M8 34 L22 -6 L36 34 M13 22 H31", ""),
    "message": ("M-36 -30 H36 V18 H-4 L-22 34 V18 H-36Z M-22 -12 H22 M-22 2 H10", ""),
    "music": ("M-12 26 V-24 L32 -32 V18", "M-12 26 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 M32 18 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0"),
    "notification": ("M-28 18 Q-22 4 -22 -8 Q-22 -32 0 -32 Q22 -32 22 -8 Q22 4 28 18Z M-9 26 Q0 36 9 26 M0 -32 V-38", ""),
    "online": ("M-20 -20 A28 28 0 0 0 -20 20 M20 -20 A28 28 0 0 1 20 20 M-32 -32 A45 45 0 0 0 -32 32 M32 -32 A45 45 0 0 1 32 32", "M8 0 A8 8 0 1 1 -8 0 A8 8 0 1 1 8 0Z"),
    "play": ("M-16 -30 L30 0 L-16 30Z", ""),
    "plus": ("M34 0 A34 34 0 1 1 -34 0 A34 34 0 1 1 34 0Z M0 -16 V16 M-16 0 H16", ""),
    "profile": ("M14 -14 A14 14 0 1 1 -14 -14 A14 14 0 1 1 14 -14Z M-32 34 Q0 -2 32 34", ""),
    "search": ("M14 -8 A22 22 0 1 1 -30 -8 A22 22 0 1 1 14 -8Z M8 8 L32 32", ""),
    "settings": (gear(), ""),
    "sound": ("M-34 -12 H-18 L2 -30 V30 L-18 12 H-34Z M14 -14 Q24 0 14 14 M24 -26 Q42 0 24 26", ""),
    "spark": ("M0 -36 V-20 M0 20 V36 M-36 0 H-20 M20 0 H36 M-25 -25 L-14 -14 M14 14 L25 25 M25 -25 L14 -14 M-14 14 L-25 25", "M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0Z"),
    "sparkle": ("", "M-6 -36 Q-2 -8 26 -4 Q-2 0 -6 28 Q-10 0 -38 -4 Q-10 -8 -6 -36Z M26 14 Q28 24 38 26 Q28 28 26 38 Q24 28 14 26 Q24 24 26 14Z"),
    "star": (star5(), ""),
    "trophy": ("M-22 -32 H22 V-6 Q22 18 0 18 Q-22 18 -22 -6Z M-22 -24 Q-40 -24 -36 -6 Q-32 6 -22 6 M22 -24 Q40 -24 36 -6 Q32 6 22 6 M0 18 V30 M-16 32 H16", ""),
    "users": ("M-2 -10 A12 12 0 1 1 -26 -10 A12 12 0 1 1 -2 -10Z M-38 32 A24 24 0 0 1 10 32 M26 -14 A10 10 0 1 1 6 -14 A10 10 0 1 1 26 -14Z M14 30 A16 16 0 0 1 40 22", ""),
    "wind": ("M-36 -12 H14 Q28 -12 28 -24 Q28 -34 18 -34 M-36 4 H26 Q38 4 38 16 Q38 28 26 28 M-36 20 H-4", ""),
    # navigation
    "events": ("M-32 -24 H32 V32 H-32Z M-32 -8 H32 M-16 -34 V-18 M16 -34 V-18", "M0 2 L5 13 L16 14 L8 21 L10 32 L0 26 L-10 32 L-8 21 L-16 14 L-5 13Z"),
    "shop": ("M-30 -14 H30 L26 34 H-26Z M-14 -14 V-22 Q-14 -36 0 -36 Q14 -36 14 -22 V-14", ""),
    "social": ("M-34 32 A20 20 0 0 1 6 32 M4 32 A16 16 0 0 1 36 32 M-3 -10 A11 11 0 1 1 -25 -10 A11 11 0 1 1 -3 -10Z M27 -6 A10 10 0 1 1 7 -6 A10 10 0 1 1 27 -6Z", ""),
}
ICONS = ["bot", "cards", "check", "code", "coin", "copy", "crown", "cut", "empty", "eye", "friends", "globe", "history", "home", "hourglass", "language",
         "message", "music", "notification", "online", "play", "plus", "profile", "search", "settings", "sound", "spark", "sparkle", "star", "trophy", "users", "wind"]
NAV = ["home", "play", "events", "shop", "social", "notification", "settings"]

def glyph(name, stroke, sw, fill=None, extra=""):
    st, fl = GLYPHS[name]
    s = ""
    if st:
        s += f'<path d="{st}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'
    if fl:
        s += f'<path d="{fl}" fill="{fill or stroke}" {extra}/>'
    return s

# ───────── Icônes 512 ─────────
def icon_soleil(name, k):
    t = soleil_lib.THEMES["soleil"]
    em = (f'<g transform="scale(2.7)">{glyph(name, "#4a2604", 11, "#4a2604", "opacity=\'.5\' transform=\'translate(1 1.6)\'")}'
          f'{glyph(name, "url(#goldV)", 8.5, "url(#goldV)", "filter=\'url(#metal)\'")}</g>')
    body = soleil_lib.halo(t, 236) + soleil_lib.coin(256, 256, 214, "soleil", "gold", k % 3, emblem=em)
    return soleil_lib.svg(t, body)

WAX_ICON = ["turq", "fuchsia", "mango", "violet"]
def icon_wax(name, k):
    col = WAX_ICON[k % 4]
    s = wx.toon(wx.scallop(256, 256, 196, 14, 9), col, "wDots", pop=.55)
    s += wx.toon(wx.circ(256, 256, 150), wx.COL[col][1], hl=False, sw=6)
    s += f'<g transform="translate(256 256) scale(3)">{glyph(name, wx.OUT, 17, wx.OUT)}{glyph(name, "#fff6e0", 9, "#fff6e0")}</g>'
    s += wx.gloss(170, 150, 34, 14)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{wx.DEFS}</defs><g filter="url(#wSh)">{s}</g></svg>'

CR_ICON = ["lilac", "aqua", "rose", "champ"]
def icon_cristal(name, k):
    tint = cr.TINT[CR_ICON[k % 4]]
    g = (f'<g transform="scale(2.5)"><g opacity=".85">{glyph(name, "#3a1a8a", 14, "#3a1a8a")}</g>'
         f'<g filter="url(#aBloom)">{glyph(name, "#ffffff", 8, "#ffffff")}</g></g>')
    s = cr.gem_cut(cr.reg(256, 256, 226, 8, -112.5), tint, .74, g)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{cr.DEFS}</defs>{s}</svg>'

# ───────── Icônes de navigation (SVG 24) ─────────
def nav_svg(name, style, k):
    if style == "soleil":
        body = glyph(name, "#5a3606", 15, "#5a3606") + glyph(name, "url(#g)", 8.5, "url(#g)")
        defs = '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset=".55" stop-color="#f0a91e"/><stop offset="1" stop-color="#b9760c"/></linearGradient>'
    elif style == "wax":
        c = wx.COL[WAX_ICON[k % 4]][0]
        body = glyph(name, wx.OUT, 15, wx.OUT) + glyph(name, c, 7.5, c)
        defs = ""
    else:
        body = glyph(name, "url(#g)", 11, "url(#g)") + glyph(name, "#ffffff", 3.5, "#ffffff", "opacity='.75'")
        defs = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a184ff"/><stop offset=".55" stop-color="#7a5cff"/><stop offset="1" stop-color="#16b8c4"/></linearGradient>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><defs>{defs}</defs><g transform="translate(12 12) scale(.24)">{body}</g></svg>\n'

# ───────── Cadres de boutons 360×144 (9-slice 40/58) ─────────
TONES = {"dark": ("#5a3e2a", "#2a1c12"), "gold": ("#ffd24a", "#b9760c"), "teal": ("#22d6c0", "#08776e"), "pink": ("#ff5a8a", "#a8183e"), "ghost": ("#f4e6c8", "#b89a6a")}

def cut_rect(x, y, w, h, c):
    return f"M{x+c} {y} H{x+w-c} L{x+w} {y+c} V{y+h-c} L{x+w-c} {y+h} H{x+c} L{x} {y+h-c} V{y+c}Z"

def frame(style, tone):
    W, H = 360, 144
    hi, lo = TONES[tone]
    if style == "soleil":
        defs = (f'<linearGradient id="fm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8d8"/><stop offset=".3" stop-color="{hi}"/><stop offset=".7" stop-color="{lo}"/><stop offset="1" stop-color="{hi}"/></linearGradient>'
                + soleil_lib.cards_gen.relief("metal", dome=4, lum=.4, scale=6, exp=30, spec=1.4, el=42, diffk=1.18))
        s = f'<path fill-rule="evenodd" d="{cut_rect(2, 2, W-4, H-4, 30)} {cut_rect(18, 16, W-36, H-32, 20)}" fill="url(#fm)" filter="url(#metal)"/>'
        s += f'<path d="{cut_rect(24, 22, W-48, H-44, 16)}" fill="none" stroke="#fff6d8" stroke-opacity=".7" stroke-width="2"/>'
        for x, y in ((22, 72), (W-22, 72)):
            s += f'<path d="M{x} {y-9} L{x+9} {y} L{x} {y+9} L{x-9} {y}Z" fill="#fff6d8" stroke="{lo}" stroke-width="2"/>'
    elif style == "wax":
        defs = wx.DEFS
        s = f'<path fill-rule="evenodd" d="{cut_rect(4, 4, W-8, H-8, 26)} {cut_rect(22, 20, W-44, H-40, 16)}" fill="{hi}"/>'
        s += f'<path fill-rule="evenodd" d="{cut_rect(4, 4, W-8, H-8, 26)} {cut_rect(22, 20, W-44, H-40, 16)}" fill="url(#wDots)"/>'
        s += f'<path d="{cut_rect(4, 4, W-8, H-8, 26)}" fill="none" stroke="{wx.OUT}" stroke-width="8" stroke-linejoin="round"/>'
        s += f'<path d="{cut_rect(22, 20, W-44, H-40, 16)}" fill="none" stroke="{wx.OUT}" stroke-width="5" stroke-linejoin="round"/>'
    else:
        defs = (cr.DEFS + f'<linearGradient id="fm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="{hi}"/><stop offset=".6" stop-color="#d8ccff"/><stop offset="1" stop-color="{hi}"/></linearGradient>')
        s = f'<path fill-rule="evenodd" d="{cut_rect(3, 3, W-6, H-6, 24)} {cut_rect(18, 16, W-36, H-32, 16)}" fill="url(#fm)" fill-opacity=".9"/>'
        s += f'<path d="{cut_rect(3, 3, W-6, H-6, 24)}" fill="none" stroke="#fff" stroke-width="3"/>'
        s += f'<path d="{cut_rect(18, 16, W-36, H-32, 16)}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>'
        s += f'<path fill-rule="evenodd" d="{cut_rect(3, 3, W-6, H-6, 24)} {cut_rect(18, 16, W-36, H-32, 16)}" fill="url(#aIris)" opacity=".35"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><defs>{defs}</defs>{s}</svg>'

def icon_plate(style):
    if style == "soleil":
        t = soleil_lib.THEMES["soleil"]
        s = soleil_lib.coin(256, 256, 236, "soleil", "gold", 2, emblem="")
        return soleil_lib.svg(t, s)
    if style == "wax":
        s = wx.toon(wx.scallop(256, 256, 220, 14, 10), "mango", "wDots", pop=.55) + wx.toon(wx.circ(256, 256, 170), "cream", hl=False)
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{wx.DEFS}</defs>{s}</svg>'
    s = cr.gem_cut(cr.reg(256, 256, 240, 8, -112.5), cr.TINT["lilac"], .78)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{cr.DEFS}</defs>{s}</svg>'

# ───────── Cartes de modes de jeu 960×540 ─────────
MODES = {"mode-online": "globe", "mode-ai": "bot", "mode-friends": "friends"}

def mode_card(style, mode):
    W, H = 960, 540
    em = MODES[mode]
    rnd = random.Random(len(mode))
    if style == "soleil":
        t = soleil_lib.THEMES["soleil"]
        defs = soleil_lib.theme_defs(t) + soleil_lib.COMMON + '<radialGradient id="bgS" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#f0a33a"/><stop offset="1" stop-color="#8a3a12"/></radialGradient><radialGradient id="felt" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2fe0cc"/><stop offset="1" stop-color="#06605a"/></radialGradient>'
        s = f'<rect width="{W}" height="{H}" fill="url(#bgS)"/>'
        s += "".join(f'<path d="M480 190 L{480+900*math.cos(math.radians(a-3)):.0f} {190+900*math.sin(math.radians(a-3)):.0f} L{480+900*math.cos(math.radians(a+3)):.0f} {190+900*math.sin(math.radians(a+3)):.0f}Z" fill="#fff6d0" opacity=".22"/>' for a in range(0, 360, 20))
        s += f'<ellipse cx="480" cy="440" rx="400" ry="120" fill="url(#gold)" filter="url(#metal)"/><ellipse cx="480" cy="436" rx="370" ry="100" fill="url(#felt)"/>'
        for i in range(5):
            x = 330 + i*75
            s += f'<g transform="translate({x} 430) rotate({(i-2)*6})"><rect x="-26" y="-36" width="52" height="72" rx="6" fill="#fffaf0" stroke="#b9760c" stroke-width="3"/><path d="M0 -14 L12 0 L0 14 L-12 0Z" fill="{["#ff5a4e", "#2238b0"][i % 2]}"/></g>'
        emb = f'<g transform="scale(2.2)">{glyph(em, "#4a2604", 11, "#4a2604", "opacity=\'.5\' transform=\'translate(1 1.6)\'")}{glyph(em, "url(#goldV)", 8.5, "url(#goldV)", "filter=\'url(#metal)\'")}</g>'
        s += soleil_lib.coin(480, 200, 150, "soleil", "gold", {"globe": 0, "bot": 1, "friends": 2}[em], emblem=emb)
        s += "".join(soleil_lib.glint(x, y, sc) for x, y, sc in ((680, 90, .9), (270, 130, .6), (760, 300, .5)))
    elif style == "wax":
        defs = wx.DEFS
        bg = {"globe": "turq", "bot": "violet", "friends": "fuchsia"}[em]
        s = f'<rect width="{W}" height="{H}" fill="{wx.COL[bg][0]}"/><rect width="{W}" height="{H}" fill="url(#wRings)" opacity=".5"/>'
        s += f'<path d="M0 360 Q240 320 480 350 T960 340 V540 H0Z" fill="{wx.COL[bg][1]}"/>'
        s += wx.toon(f"M80 440 A400 110 0 0 1 880 440 A400 110 0 0 1 80 440Z", "mango", "wZig", pop=.5)
        s += wx.toon(f"M120 436 A360 86 0 0 1 840 436 A360 86 0 0 1 120 436Z", "turq" if bg != "turq" else "violet", "wDots", pop=.4, hl=False)
        for i in range(5):
            x = 330 + i*75
            s += f'<g transform="translate({x} 430) rotate({(i-2)*7})">{wx.toon(wx.poly([(-26,-36),(26,-36),(26,36),(-26,36)]), "cream", sw=5)}{wx.toon("M0 -14 L12 0 L0 14 L-12 0Z", ["red", "violet"][i % 2], hl=False, sw=3)}</g>'
        s += wx.toon(wx.scallop(480, 200, 150, 16, 10), "gold", "wRings", pop=.45) + wx.toon(wx.circ(480, 200, 112), "cream", hl=False)
        s += f'<g transform="translate(480 200) scale(2.2)">{glyph(em, wx.OUT, 17, wx.OUT)}{glyph(em, wx.COL[bg][0], 9, wx.COL[bg][0])}</g>'
        s += f'<g transform="translate(224 -56)">{wx.confetti(7, 14)}</g>' + wx.shine(720, 90, 1.2) + wx.shine(240, 120, .9)
    else:
        defs = cr.DEFS + '<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a6a"/><stop offset=".6" stop-color="#5a3ab0"/><stop offset="1" stop-color="#e88cc8"/></linearGradient>'
        tint = {"globe": "aqua", "bot": "lilac", "friends": "rose"}[em]
        s = f'<rect width="{W}" height="{H}" fill="url(#night)"/>'
        s += "".join(f'<circle cx="{rnd.uniform(0, W):.0f}" cy="{rnd.uniform(0, 300):.0f}" r="{rnd.uniform(1, 3):.1f}" fill="#fff" opacity="{rnd.uniform(.4, 1):.2f}"/>' for _ in range(60))
        s += f'<ellipse cx="480" cy="440" rx="400" ry="110" fill="{cr.TINT[tint]}" opacity=".5" filter="url(#aGlow)"/>'
        s += f'<ellipse cx="480" cy="440" rx="400" ry="110" fill="{cr.TINT[tint]}" fill-opacity=".35" stroke="#fff" stroke-width="4"/><ellipse cx="480" cy="436" rx="360" ry="86" fill="url(#aIris)" opacity=".35" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>'
        for i in range(5):
            x = 330 + i*75
            s += f'<g transform="translate({x} 424) rotate({(i-2)*6})"><rect x="-26" y="-36" width="52" height="72" rx="8" fill="url(#aIris)" stroke="#fff" stroke-width="3"/><path d="M0 -14 L12 0 L0 14 L-12 0Z" fill="#fff" filter="url(#aBloom)"/></g>'
        g = f'<g transform="scale(2)"><g opacity=".6" filter="url(#aGlowS)">{glyph(em, "#5a3ad0", 12, "#5a3ad0")}</g><g filter="url(#aBloom)">{glyph(em, "#fff", 8, "#fff")}</g></g>'
        s += cr.gem_cut(cr.reg(480, 200, 150, 8, -112.5), cr.TINT[tint], .7, g)
        s += cr.orbit(480, 200, 260, 60, -10, dots=3, seed=3) + cr.twinkle(720, 90, 1.1) + cr.twinkle(230, 120, .8)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><defs>{defs}</defs>{s}</svg>'

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "out_ui")
    for style in ("soleil", "wax", "cristal"):
        for sub in ("icons", "buttons", "nav", "menu"):
            os.makedirs(os.path.join(out, style, sub), exist_ok=True)
        fn = {"soleil": icon_soleil, "wax": icon_wax, "cristal": icon_cristal}[style]
        for k, name in enumerate(ICONS):
            open(os.path.join(out, style, "icons", f"{name}.svg"), "w").write(fn(name, k))
        for k, name in enumerate(NAV):
            open(os.path.join(out, style, "nav", f"{name}.svg"), "w").write(nav_svg(name, style, k))
        for tone in TONES:
            open(os.path.join(out, style, "buttons", f"{tone}-frame.svg"), "w").write(frame(style, tone))
        open(os.path.join(out, style, "buttons", "icon-plate.svg"), "w").write(icon_plate(style))
        for mode in MODES:
            open(os.path.join(out, style, "menu", f"{mode}.svg"), "w").write(mode_card(style, mode))
    print("ok")
