"""Générateur des illustrations de cartes Njambo v3 — rendu semi-réaliste (SVG + filtres de lumière).
Usage : python3 gen.py && node render.js *.svg"""
import math, random

GOLD_STOPS = '<stop offset="0" stop-color="#fff0b0"/><stop offset=".18" stop-color="#e3a42c"/><stop offset=".36" stop-color="#b98222"/><stop offset=".52" stop-color="#f7d06a"/><stop offset=".7" stop-color="#c58a1c"/><stop offset=".86" stop-color="#ffe7a0"/><stop offset="1" stop-color="#9a6214"/>'

def relief(fid, dome=6, lum=.6, scale=6, exp=28, spec=1.1, az=225, el=50, noise=0.0, diffk=1.25, point=None, light="#ffffff"):
    """Filtre « matière » : relief issu de la silhouette + luminance, éclairage diffus et spéculaire."""
    src = (f'<fePointLight x="{point[0]}" y="{point[1]}" z="{point[2]}"/>' if point else f'<feDistantLight azimuth="{az}" elevation="{el}"/>')
    nz = (f'<feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="5" result="nz"/>'
          f'<feComposite in="h0" in2="nz" operator="arithmetic" k2="1" k3="{noise}" result="h"/>') if noise else '<feOffset in="h0" result="h"/>'
    return f'''<filter id="{fid}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>
  <feComposite in="lum" in2="SourceAlpha" operator="in" result="lumA"/>
  <feGaussianBlur in="lumA" stdDeviation="1.2" result="lumB"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="{dome}" result="dome"/>
  <feComposite in="dome" in2="lumB" operator="arithmetic" k2="{1-lum*.5:.2f}" k3="{lum}" result="h0"/>
  {nz}
  <feDiffuseLighting in="h" surfaceScale="{scale}" diffuseConstant="1" lighting-color="{light}" result="diff">{src}</feDiffuseLighting>
  <feSpecularLighting in="h" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="#fffaf0" result="sp">{src}</feSpecularLighting>
  <feComposite in="SourceGraphic" in2="diff" operator="arithmetic" k1="{diffk}" result="lit"/>
  <feComposite in="sp" in2="SourceAlpha" operator="in" result="spA"/>
  <feComposite in="lit" in2="spA" operator="arithmetic" k2="1" k3="1" result="o"/>
  <feComposite in="o" in2="SourceAlpha" operator="in"/>
</filter>'''

COMMON = f'''
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">{GOLD_STOPS}</linearGradient>
<linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1">{GOLD_STOPS}</linearGradient>
<radialGradient id="shellBody" cx="42%" cy="34%" r="75%"><stop offset="0" stop-color="#fffef8"/><stop offset=".4" stop-color="#fbf0d6"/><stop offset=".75" stop-color="#efd39a"/><stop offset="1" stop-color="#c4914a"/></radialGradient>
<linearGradient id="aperture" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3414"/><stop offset=".5" stop-color="#4a1e0a"/><stop offset="1" stop-color="#6a3414"/></linearGradient>
<radialGradient id="gemTeal" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#b6fff4"/><stop offset=".35" stop-color="#22d2bf"/><stop offset=".8" stop-color="#067a72"/><stop offset="1" stop-color="#03413f"/></radialGradient>
<radialGradient id="gemPink" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffd0dc"/><stop offset=".35" stop-color="#ec4a78"/><stop offset=".8" stop-color="#8c1638"/><stop offset="1" stop-color="#4a0a1e"/></radialGradient>
<radialGradient id="gemBlue" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#d4dcff"/><stop offset=".35" stop-color="#5172f0"/><stop offset=".8" stop-color="#1c2f8a"/><stop offset="1" stop-color="#0c1446"/></radialGradient>
<radialGradient id="pearl" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f6ead2"/><stop offset="1" stop-color="#b89a6a"/></radialGradient>
{relief("metal", dome=4, lum=.4, scale=6, exp=30, spec=1.4, el=42, noise=.06, diffk=1.18)}
{relief("porcelain", dome=16, lum=.45, scale=9, exp=45, spec=1.5, diffk=1.18)}
{relief("gem", dome=5, lum=.3, scale=7, exp=60, spec=1.8, diffk=1.2)}
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="blur8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="blur20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
<filter id="drop" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="6" dy="14" stdDeviation="10" flood-color="#2a0a06" flood-opacity=".55"/></filter>
<filter id="dropS" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="3" dy="6" stdDeviation="4" flood-color="#2a0a06" flood-opacity=".5"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/>
  <feColorMatrix type="matrix" values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 1.2 -.45"/></filter>
<filter id="glint" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
'''

def glint(x, y, s=1.0, rot=0):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#glint)" fill="#fffdf2">'
            '<path d="M0 -40 C2 -6 6 -2 40 0 C6 2 2 6 0 40 C-2 6 -6 2 -40 0 C-6 -2 -2 -6 0 -40Z" opacity=".95"/>'
            '<path d="M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3Z" transform="rotate(45)" opacity=".7"/><circle r="5"/></g>')

def cowrie(rx, ry, teeth=13):
    """Cauri monétaire vu côté ouverture : corps ivoire brillant, fente étroite, sillons bruns sur les lèvres."""
    t = ""
    for k in range(teeth):
        f = -0.78 + k*(1.56/(teeth-1))
        y = f*ry; L = rx*.14*(1-abs(f)**3) + rx*.04
        xs = rx*.03*math.sin(f*2.2)
        t += f'<path d="M{xs-rx*.07:.1f} {y:.1f} L{xs-rx*.07-L:.1f} {y-ry*.012:.1f}"/><path d="M{xs+rx*.07:.1f} {y:.1f} L{xs+rx*.07+L:.1f} {y-ry*.012:.1f}"/>'
    outline = (f'M0 {-ry} C{rx*.72:.1f} {-ry} {rx} {-ry*.5:.1f} {rx} {ry*.02:.1f} C{rx} {ry*.62:.1f} {rx*.62:.1f} {ry} 0 {ry} '
               f'C{-rx*.62:.1f} {ry} {-rx} {ry*.62:.1f} {-rx} {ry*.02:.1f} C{-rx} {-ry*.5:.1f} {-rx*.72:.1f} {-ry} 0 {-ry}Z')
    b = f'<path d="{outline}" fill="url(#shellBody)"/>'
    b += f'<path d="{outline}" fill="none" stroke="#d9a548" stroke-opacity=".7" stroke-width="{rx*.1:.1f}"/>'
    b += f'<ellipse cx="0" cy="0" rx="{rx*.5:.1f}" ry="{ry*.82:.1f}" fill="#fffaf0" opacity=".55" filter="url(#soft)"/>'
    b += f'<g stroke="#6a3010" stroke-opacity=".85" stroke-width="{max(2.2, rx*.06):.1f}" stroke-linecap="round" fill="none">{t}</g>'
    b += (f'<path d="M{rx*.02:.1f} {-ry*.9:.1f} C{rx*.12:.1f} {-ry*.4:.1f} {-rx*.1:.1f} {ry*.3:.1f} {rx*.04:.1f} {ry*.9:.1f}" '
          f'fill="none" stroke="url(#aperture)" stroke-width="{rx*.15:.1f}" stroke-linecap="round"/>')
    b += (f'<path d="M{rx*.02:.1f} {-ry*.9:.1f} C{rx*.12:.1f} {-ry*.4:.1f} {-rx*.1:.1f} {ry*.3:.1f} {rx*.04:.1f} {ry*.9:.1f}" '
          f'fill="none" stroke="#1a0804" stroke-width="{rx*.06:.1f}" stroke-linecap="round"/>')
    return f'<g filter="url(#porcelain)">{b}</g>' + (
        f'<ellipse cx="{-rx*.42:.1f}" cy="{-ry*.48:.1f}" rx="{rx*.14:.1f}" ry="{ry*.22:.1f}" fill="#fff" opacity=".8" filter="url(#soft)" transform="rotate(20 {-rx*.42:.1f} {-ry*.48:.1f})"/>')

def gem(x, y, r, kind="Teal", setting=True):
    s = ""
    if setting:
        s += f'<circle cx="{x}" cy="{y}" r="{r*1.32:.1f}" fill="url(#gold)" filter="url(#metal)"/>'
        for i in range(6):
            a = math.radians(i*60+30)
            s += f'<circle cx="{x+r*1.12*math.cos(a):.1f}" cy="{y+r*1.12*math.sin(a):.1f}" r="{r*.22:.1f}" fill="#ffe08a"/>'
    s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#gem{kind})" filter="url(#gem)"/>'
    s += f'<ellipse cx="{x-r*.32:.1f}" cy="{y-r*.38:.1f}" rx="{r*.28:.1f}" ry="{r*.16:.1f}" fill="#fff" opacity=".9" transform="rotate(-30 {x-r*.32:.1f} {y-r*.38:.1f})"/>'
    return s

def ring_pos(cx, cy, r, n, rot=0):
    for i in range(n):
        a = math.radians(rot + i*360/n - 90)
        yield i, cx + r*math.cos(a), cy + r*math.sin(a), rot + i*360/n

def god_rays(cx, cy, n, length, seed, col="#fff4cc", op=.5):
    rnd = random.Random(seed); s = ""
    for i in range(n):
        a = math.radians(rnd.uniform(0, 360)); w = rnd.uniform(.02, .07)
        L = length*rnd.uniform(.6, 1)
        s += (f'<path d="M{cx} {cy} L{cx+L*math.cos(a-w):.0f} {cy+L*math.sin(a-w):.0f} L{cx+L*math.cos(a+w):.0f} {cy+L*math.sin(a+w):.0f}Z" '
              f'opacity="{rnd.uniform(.3,1):.2f}"/>')
    return f'<g fill="{col}" opacity="{op}" filter="url(#blur8)" style="mix-blend-mode:screen">{s}</g>'

def bokeh(w, h, n, seed, cols, rmin, rmax, op):
    rnd = random.Random(seed); s = ""
    for _ in range(n):
        r = rnd.uniform(rmin, rmax)
        s += (f'<circle cx="{rnd.uniform(0,w):.0f}" cy="{rnd.uniform(0,h):.0f}" r="{r:.0f}" fill="{rnd.choice(cols)}" '
              f'fill-opacity="{rnd.uniform(.15,op):.2f}" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>')
    return f'<g filter="url(#soft)" style="mix-blend-mode:screen">{s}</g>'

def power_frame(W=720):
    """Cadre commun des cartes de pouvoir : laiton martelé en relief + cabochons aux coins."""
    s = f'<rect width="{W}" height="{W}" filter="url(#grain)" opacity=".18" style="mix-blend-mode:overlay"/>'
    s += f'<path fill-rule="evenodd" d="M0 0 H{W} V{W} H0Z M30 46 Q30 30 46 30 H{W-46} Q{W-30} 30 {W-30} 46 V{W-46} Q{W-30} {W-30} {W-46} {W-30} H46 Q30 {W-30} 30 {W-46}Z" fill="url(#gold)" filter="url(#metal)"/>'
    s += f'<rect x="30" y="30" width="{W-60}" height="{W-60}" rx="16" fill="none" stroke="#5a3408" stroke-opacity=".55" stroke-width="3"/>'
    s += f'<rect x="12" y="12" width="{W-24}" height="{W-24}" rx="12" fill="none" stroke="#fff3c2" stroke-opacity=".5" stroke-width="2" stroke-dasharray="1 8" stroke-linecap="round"/>'
    for (x, y, k) in ((30, 30, "Pink"), (W-30, 30, "Teal"), (W-30, W-30, "Pink"), (30, W-30, "Teal")):
        s += gem(x, y, 13, k)
    for x in (W/2,):
        s += gem(x, 16, 7, "Blue", setting=False) + gem(x, W-16, 7, "Blue", setting=False)
    return s

def svg(w, h, defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{COMMON}{defs}</defs>{body}</svg>'

def strip(x, y, w, h, unit=1.0):
    cols = [("#f2bb45", 40), ("#c75b3a", 22), ("#10b7a6", 34), ("#4a6af0", 26), ("#d83c68", 22)]
    s = ""; cx = x; i = 0
    while cx < x + w:
        c, ww = cols[i % 5]; ww *= unit
        s += f'<rect x="{cx:.1f}" y="{y}" width="{min(ww, x+w-cx):.1f}" height="{h}" fill="{c}"/>'
        cx += ww; i += 1
    return f'<g filter="url(#textile)">{s}</g>'

TEXTILE = '''<filter id="textile" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".9 .12" numOctaves="2" seed="3" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .9 0 0 0 0" result="ta"/>
  <feDiffuseLighting in="ta" surfaceScale="1.4" diffuseConstant="1" result="d"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>
  <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.25" result="o"/>
  <feComposite in="o" in2="SourceAlpha" operator="in"/></filter>'''

# ───────────────────────── DOS DE CARTE ─────────────────────────
def card_back():
    W, H, cx, cy = 900, 1260, 450, 630
    defs = TEXTILE + '''
    <radialGradient id="velvet" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#8aa2ff"/><stop offset=".3" stop-color="#4f6ff2"/><stop offset=".7" stop-color="#2c45b8"/><stop offset="1" stop-color="#1a1760"/></radialGradient>
    <pattern id="ndop" width="90" height="90" patternUnits="userSpaceOnUse">
      <path d="M45 6 L84 45 L45 84 L6 45Z" fill="none" stroke="#dbe3ff" stroke-opacity=".5" stroke-width="5"/>
      <path d="M45 24 L66 45 L45 66 L24 45Z" fill="#dbe3ff" fill-opacity=".22"/>
      <path d="M45 36 L54 45 L45 54 L36 45Z" fill="#ffe08a" fill-opacity=".7"/>
      <path d="M0 0 L12 0 L0 12Z M90 0 L78 0 L90 12Z M0 90 L12 90 L0 78Z M90 90 L78 90 L90 78Z" fill="#dbe3ff" fill-opacity=".4"/></pattern>
    <radialGradient id="haloB" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8dc" stop-opacity=".95"/><stop offset=".35" stop-color="#ffd86e" stop-opacity=".45"/><stop offset="1" stop-color="#ffd86e" stop-opacity="0"/></radialGradient>
    <radialGradient id="medalBg" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#3a59e0"/><stop offset="1" stop-color="#121046"/></radialGradient>
    <clipPath id="inB"><rect x="70" y="70" width="760" height="1120" rx="30"/></clipPath>'''
    b = f'<rect width="{W}" height="{H}" rx="56" fill="#140f36"/>'
    # cadre or massif
    b += f'<path fill-rule="evenodd" d="M56 12 H{W-56} Q{W-12} 12 {W-12} 56 V{H-56} Q{W-12} {H-12} {W-56} {H-12} H56 Q12 {H-12} 12 {H-56} V56 Q12 12 56 12Z M100 70 H{W-100} Q{W-70} 70 {W-70} 100 V{H-100} Q{W-70} {H-70} {W-100} {H-70} H100 Q70 {H-70} 70 {H-100} V100 Q70 70 100 70Z" fill="url(#gold)" filter="url(#metal)"/>'
    # gravure sur le cadre
    b += f'<rect x="40" y="40" width="{W-80}" height="{H-80}" rx="40" fill="none" stroke="#6a3e08" stroke-opacity=".5" stroke-width="2" stroke-dasharray="14 6 2 6"/>'
    b += '<g clip-path="url(#inB)">'
    b += f'<rect width="{W}" height="{H}" fill="url(#velvet)" filter="url(#textile)"/>'
    b += f'<rect width="{W}" height="{H}" fill="url(#ndop)" filter="url(#textile)"/>'
    b += god_rays(cx, cy, 40, 900, 4, op=.4)
    b += bokeh(W, H, 34, 8, ["#fff3c2", "#ffd86e", "#9fe8ff", "#ffb0c8"], 6, 22, .5)
    for yy in (180, 1046):
        b += f'<rect x="70" y="{yy-8}" width="760" height="50" fill="url(#goldV)" filter="url(#metal)"/>' + strip(70, yy, 760, 34)
        b += f'<rect x="70" y="{yy}" width="760" height="34" fill="none" stroke="#3a2004" stroke-opacity=".5" stroke-width="2"/>'
    b += f'<rect x="70" y="70" width="760" height="1120" fill="url(#vigB)" />'
    b += '</g>'
    b = b.replace('url(#vigB)', 'none')
    b += f'<rect x="70" y="70" width="760" height="1120" rx="30" fill="none" stroke="#3a2004" stroke-opacity=".6" stroke-width="4"/>'
    # coins : cabochons sertis
    for (x, y, k) in ((130, 130, "Pink"), (770, 130, "Teal"), (130, 1130, "Teal"), (770, 1130, "Pink")):
        b += f'<g filter="url(#dropS)">{gem(x, y, 22, k)}</g>'
    for x in (300, 450, 600):
        b += f'<g filter="url(#dropS)">{gem(x, 41, 9, "Blue", False)}{gem(x, H-41, 9, "Blue", False)}</g>'
    # médaillon
    b += f'<circle cx="{cx}" cy="{cy}" r="400" fill="url(#haloB)" style="mix-blend-mode:screen"/>'
    sun = ""
    for i, x, y, a in ring_pos(cx, cy, 0, 16):
        sun += f'<path d="M{cx-24} {cy-200} L{cx} {cy-300} L{cx+24} {cy-200}Z" transform="rotate({a} {cx} {cy})"/>'
        sun += f'<path d="M{cx-14} {cy-200} L{cx} {cy-255} L{cx+14} {cy-200}Z" transform="rotate({a+11.25} {cx} {cy})"/>'
    b += f'<g fill="url(#goldV)" filter="url(#metal)">{sun}</g>'
    b += f'<g filter="url(#drop)"><circle cx="{cx}" cy="{cy}" r="218" fill="url(#gold)" filter="url(#metal)"/></g>'
    # anneau gravé en zigzag
    pts = " ".join(f"{cx+(196+(8 if i%2 else -8))*math.cos(math.radians(i*5)):.1f},{cy+(196+(8 if i%2 else -8))*math.sin(math.radians(i*5)):.1f}" for i in range(73))
    b += f'<polyline points="{pts}" fill="none" stroke="#6a3e08" stroke-opacity=".7" stroke-width="3"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="176" fill="#3a2004"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="172" fill="url(#medalBg)" filter="url(#textile)"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="172" fill="url(#ndop)" opacity=".7"/>'
    kinds = ["Pink", "Teal", "Blue", "Teal"]
    for i, x, y, a in ring_pos(cx, cy, 197, 12, 15):
        b += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="url(#pearl)" filter="url(#gem)"/>'
    for i, x, y, a in ring_pos(cx, cy, 197, 4):
        b += gem(round(x, 1), round(y, 1), 15, kinds[i])
    b += f'<circle cx="{cx}" cy="{cy}" r="150" fill="url(#haloB)" opacity=".8" style="mix-blend-mode:screen"/>'
    b += f'<g transform="translate({cx} {cy}) rotate(-8)" filter="url(#drop)">{cowrie(80, 112)}</g>'
    b += glint(cx+52, cy-70, .9) + glint(450, 330, 1.1) + glint(450, 930, 1.1) + glint(250, 480, .5, 20) + glint(660, 800, .5, 20) + glint(780, 160, .6) + glint(150, 1100, .5)
    return svg(W, H, defs, b)

# ───────────────────────── CAURIS CHANCEUX ─────────────────────────
def cauris():
    W = 720; cx, cy = 360, 350
    defs = '''
    <linearGradient id="strandH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8702a"/><stop offset=".25" stop-color="#f6d28a"/><stop offset=".55" stop-color="#e2b060"/><stop offset="1" stop-color="#7a4a18"/></linearGradient>
    <linearGradient id="strandV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6424"/><stop offset=".3" stop-color="#eec77a"/><stop offset=".6" stop-color="#d8a556"/><stop offset="1" stop-color="#6e4214"/></linearGradient>
    <pattern id="raffia" width="72" height="72" patternUnits="userSpaceOnUse">
      <rect x="0" y="1" width="36" height="16" rx="5" fill="url(#strandH)"/><rect x="0" y="19" width="36" height="16" rx="5" fill="url(#strandH)"/>
      <rect x="37" y="0" width="16" height="36" rx="5" fill="url(#strandV)"/><rect x="55" y="0" width="16" height="36" rx="5" fill="url(#strandV)"/>
      <rect x="1" y="36" width="16" height="36" rx="5" fill="url(#strandV)"/><rect x="19" y="36" width="16" height="36" rx="5" fill="url(#strandV)"/>
      <rect x="36" y="37" width="36" height="16" rx="5" fill="url(#strandH)"/><rect x="36" y="55" width="36" height="16" rx="5" fill="url(#strandH)"/></pattern>
    <filter id="fibers" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".02 .9" numOctaves="2" seed="2" result="t1"/>
      <feColorMatrix in="t1" type="matrix" values="0 0 0 0 .35  0 0 0 0 .2  0 0 0 0 .05  0 0 0 1.4 -.55"/></filter>
    <radialGradient id="sunlight" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#fff8d8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffcf6a" stop-opacity=".45"/><stop offset=".75" stop-color="#d8541e" stop-opacity=".15"/><stop offset="1" stop-color="#5a0e3a" stop-opacity=".75"/></radialGradient>
    <radialGradient id="dish" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#2fe0cc"/><stop offset=".55" stop-color="#0f9e90"/><stop offset="1" stop-color="#05504c"/></radialGradient>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".4" stop-color="#ffe28a" stop-opacity=".7"/><stop offset="1" stop-color="#ffb43a" stop-opacity="0"/></radialGradient>
    <filter id="dof" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="2.2"/></filter>'''
    b = '<g filter="url(#dof)">'
    b += f'<rect width="{W}" height="{W}" fill="#c88a3a"/><rect width="{W}" height="{W}" fill="url(#raffia)" transform="rotate(-12 360 360) scale(1.25) translate(-72 -72)"/>'
    b += f'<rect width="{W}" height="{W}" filter="url(#fibers)" opacity=".8"/>'
    # petits cauris posés sur la natte (flous de profondeur)
    for (x, y, r, s) in ((105, 160, -40, .42), (630, 140, 30, .38), (650, 560, -20, .45), (80, 560, 50, .4), (560, 650, 80, .3), (190, 660, -70, .3), (620, 340, 100, .3), (95, 360, -100, .32)):
        b += f'<g transform="translate({x} {y}) rotate({r}) scale({s})" filter="url(#drop)">{cowrie(70, 98)}</g>'
    b += '</g>'
    b += f'<rect width="{W}" height="{W}" fill="url(#sunlight)" style="mix-blend-mode:soft-light"/>'
    b += f'<rect width="{W}" height="{W}" fill="url(#sunlight)" opacity=".55"/>'
    b += god_rays(cx, -80, 24, 900, 6, op=.45)
    # coupelle en laiton sertie, posée sur la natte
    b += f'<ellipse cx="{cx+18}" cy="{cy+40}" rx="250" ry="236" fill="#3a1606" opacity=".45" filter="url(#blur20)"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="240" fill="url(#gold)" filter="url(#metal)"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="240" fill="none" stroke="#5a3408" stroke-opacity=".5" stroke-width="3"/>'
    pts = " ".join(f"{cx+(214+(9 if i%2 else -9))*math.cos(math.radians(i*4.5)):.1f},{cy+(214+(9 if i%2 else -9))*math.sin(math.radians(i*4.5)):.1f}" for i in range(81))
    b += f'<polyline points="{pts}" fill="none" stroke="#6a3e08" stroke-opacity=".6" stroke-width="3"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="190" fill="#3a2004"/><circle cx="{cx}" cy="{cy}" r="186" fill="url(#dish)" filter="url(#gem)"/>'
    # motif ndop gravé dans l'émail
    tri = "".join(f'<path d="M{cx-14} {cy-186} L{cx} {cy-146} L{cx+14} {cy-186}Z" transform="rotate({i*22.5} {cx} {cy})"/>' for i in range(16))
    b += f'<g fill="#fff3c2" opacity=".55">{tri}</g>'
    kinds = ["Pink", "Blue"]
    for i, x, y, a in ring_pos(cx, cy, 240, 16, 11.25):
        b += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="url(#pearl)" filter="url(#gem)"/>'
    for i, x, y, a in ring_pos(cx, cy, 240, 8):
        b += gem(round(x, 1), round(y, 1), 14, kinds[i % 2])
    # aura + cauris
    b += f'<circle cx="{cx}" cy="{cy}" r="200" fill="url(#aura)" style="mix-blend-mode:screen"/>'
    b += f'<g transform="translate({cx-128} {cy+78}) rotate(-36)" filter="url(#drop)">{cowrie(54, 76)}</g>'
    b += f'<g transform="translate({cx+128} {cy+78}) rotate(36)" filter="url(#drop)">{cowrie(54, 76)}</g>'
    b += f'<g transform="translate({cx} {cy-8}) rotate(-4)" filter="url(#drop)">{cowrie(92, 130)}</g>'
    b += glint(cx-40, cy-95, 1.1) + glint(cx+170, cy-150, .8, 15) + glint(cx-180, cy-130, .6) + glint(cx+110, cy+120, .5) + glint(cx-118, cy+40, .4)
    b += bokeh(W, W, 18, 13, ["#fff6d0", "#ffd86e"], 5, 16, .55)
    b += power_frame(W)
    return svg(W, W, defs, b)

# ───────────────────────── FEU DE CAMP ─────────────────────────
def feu():
    W = 720; fx, fy = 360, 470
    PL = (fx, fy, 160)
    defs = relief("firelit", dome=6, lum=.5, scale=6, exp=18, spec=.6, point=PL, light="#ffc078", diffk=1.5) + \
           relief("firelitWood", dome=4, lum=.7, scale=5, exp=12, spec=.4, point=PL, light="#ffb060", diffk=1.6, noise=.15) + '''
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2478"/><stop offset=".4" stop-color="#6e2f86"/><stop offset=".7" stop-color="#d45a5a"/><stop offset="1" stop-color="#ffb05a"/></linearGradient>
    <radialGradient id="fireHalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d0"/><stop offset=".2" stop-color="#ffcf5a" stop-opacity=".85"/><stop offset=".55" stop-color="#ff7a2a" stop-opacity=".35"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
    <linearGradient id="flOuter" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e8280e"/><stop offset=".5" stop-color="#ff4a10"/><stop offset=".85" stop-color="#d82a0a" stop-opacity=".8"/><stop offset="1" stop-color="#a8180a" stop-opacity=".2"/></linearGradient>
    <linearGradient id="flMid" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffa62a"/><stop offset=".6" stop-color="#ff7a14"/><stop offset="1" stop-color="#ff5a10" stop-opacity=".6"/></linearGradient>
    <linearGradient id="flIn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff0a0"/><stop offset=".55" stop-color="#ffd04a"/><stop offset="1" stop-color="#ffaa2a" stop-opacity=".5"/></linearGradient>
    <linearGradient id="flCore" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#fff6c8"/><stop offset="1" stop-color="#ffe080" stop-opacity="0"/></linearGradient>
    <filter id="flame" x="-40%" y="-40%" width="180%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency=".012 .035" numOctaves="3" seed="11" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="20" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.2"/></filter>
    <filter id="flame2" x="-40%" y="-40%" width="180%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="3" seed="23" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="22" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.5"/></filter>
    <filter id="smoke" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="4" seed="8"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .75  0 0 0 0 .6  0 0 0 0 .8  0 0 0 1.6 -.7"/></filter>
    <linearGradient id="smokeMask" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="smokeM"><path d="M300 0 C260 120 320 200 330 300 H390 C400 200 460 120 420 0Z" fill="url(#smokeMask)" filter="url(#blur20)"/></mask>
    <filter id="dirt" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".05 .12" numOctaves="4" seed="4" result="t"/>
      <feColorMatrix in="t" type="matrix" values=".5 0 0 0 .28  .3 0 0 0 .12  .2 0 0 0 .12  0 0 0 0 1" result="c"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="h"/>
      <feDiffuseLighting in="h" surfaceScale="4" diffuseConstant="1.3" lighting-color="#ffb060" result="l"><fePointLight x="360" y="470" z="120"/></feDiffuseLighting>
      <feComposite in="c" in2="l" operator="arithmetic" k1="1.6" k4=".02" result="o"/>
      <feComposite in="o" in2="SourceAlpha" operator="in"/></filter>
    <filter id="woodTex" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".008 .35" numOctaves="3" seed="6"/>
      <feColorMatrix type="matrix" values=".6 0 0 0 .3  .35 0 0 0 .12  .15 0 0 0 .04  0 0 0 0 1"/>
      <feComposite in2="SourceAlpha" operator="in"/></filter>
    <linearGradient id="cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd2a0"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".7" stop-color="#7a4a3a"/><stop offset="1" stop-color="#2a0e08"/></linearGradient>
    <radialGradient id="endgrain" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe2b0"/><stop offset=".5" stop-color="#e8a868"/><stop offset=".85" stop-color="#b86a34"/><stop offset="1" stop-color="#3a1608"/></radialGradient>
    <linearGradient id="stoneC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8a088"/><stop offset="1" stop-color="#5a3a3a"/></linearGradient>
    <filter id="rock" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="9" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="10" xChannelSelector="R" yChannelSelector="G" result="shape"/>
      <feGaussianBlur in="shape" stdDeviation="6" result="dome"/>
      <feColorMatrix in="dome" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="dA"/>
      <feComposite in="dA" in2="t" operator="arithmetic" k2="1" k3=".25" result="h"/>
      <feDiffuseLighting in="h" surfaceScale="3.5" diffuseConstant="1.3" lighting-color="#ffc080" result="l"><fePointLight x="360" y="440" z="140"/></feDiffuseLighting>
      <feSpecularLighting in="h" surfaceScale="3.5" specularConstant=".5" specularExponent="14" lighting-color="#ffe0b0" result="s"><fePointLight x="360" y="440" z="140"/></feSpecularLighting>
      <feComposite in="shape" in2="l" operator="arithmetic" k1="1.5" result="o1"/>
      <feComposite in="o1" in2="s" operator="arithmetic" k2="1" k3=".6" result="o2"/>
      <feComposite in="o2" in2="shape" operator="in"/></filter>
    <pattern id="pagneP" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#c8305a"/><path d="M0 13 L13 0 L26 13 L13 26Z" fill="#f2bb45"/><circle cx="13" cy="13" r="3.5" fill="#1c1741"/></pattern>
    <pattern id="pagneT" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#0e9a8c"/><path d="M0 0 L26 26 M26 0 L0 26" stroke="#fff1c8" stroke-width="3"/></pattern>
    <linearGradient id="shadeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#140820" stop-opacity=".85"/><stop offset=".65" stop-color="#140820" stop-opacity=".2"/><stop offset="1" stop-color="#ffb060" stop-opacity=".35"/></linearGradient>
    <radialGradient id="moon" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#fffdf0"/><stop offset=".7" stop-color="#f6e6c0"/><stop offset="1" stop-color="#d8c090"/></radialGradient>
    <filter id="moonTex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="14"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .45  0 0 0 1.4 -.6"/><feComposite in2="SourceAlpha" operator="in"/></filter>'''
    b = f'<rect width="{W}" height="{W}" fill="url(#sky)"/>'
    rnd = random.Random(2)
    b += "".join(f'<circle cx="{rnd.uniform(40,680):.0f}" cy="{rnd.uniform(40,280):.0f}" r="{rnd.uniform(.6,2.2):.1f}" fill="#fff" opacity="{rnd.uniform(.3,1):.2f}"/>' for _ in range(80))
    b += '<circle cx="570" cy="125" r="80" fill="#fff0c8" opacity=".35" filter="url(#blur20)"/>'
    b += '<circle cx="570" cy="125" r="44" fill="url(#moon)"/><circle cx="570" cy="125" r="44" filter="url(#moonTex)" opacity=".6"/>'
    # lointain
    b += '<path d="M0 410 C90 370 170 395 250 380 S420 350 520 375 S650 360 720 380 V720 H0Z" fill="#4a1e66" opacity=".85" filter="url(#soft)"/>'
    def palm(x, y, s, flip=1):
        fronds = ""
        for ang, ln in ((-160, 1), (-130, 1.1), (-100, .9), (-75, .95), (-45, 1.1), (-15, 1), (-175, .8), (5, .8)):
            a = math.radians(ang); ex, ey = 20 + 120*ln*math.cos(a), -160 + 120*ln*math.sin(a) + 40
            mx, my = 20 + 70*ln*math.cos(a), -160 + 70*ln*math.sin(a) - 20
            fronds += f'<path d="M20 -160 Q{mx:.0f} {my:.0f} {ex:.0f} {ey:.0f} Q{mx:.0f} {my+14:.0f} 20 -154Z"/>'
        return (f'<g transform="translate({x} {y}) scale({s*flip} {s})" fill="#2a1240">'
                '<path d="M-5 0 Q3 -80 16 -160 L24 -160 Q13 -80 7 0Z"/>' + fronds + '</g>')
    b += f'<g opacity=".95">{palm(60, 440, 1.05)}{palm(150, 425, .62)}{palm(665, 430, .95, -1)}</g>'
    # fumée
    b += '<rect width="720" height="360" filter="url(#smoke)" mask="url(#smokeM)" opacity=".18"/>'
    # sol
    b += '<path d="M0 470 Q360 438 720 470 V720 H0Z" fill="#000" filter="url(#dirt)"/>'
    b += f'<ellipse cx="{fx}" cy="560" rx="300" ry="110" fill="#ff9a3a" opacity=".35" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    # halo du feu
    b += f'<circle cx="{fx}" cy="470" r="300" fill="url(#fireHalo)" opacity=".75" style="mix-blend-mode:screen"/>'
    # villageois
    def villager(x, y, s, pat, flip=1, wrap="#c8305a"):
        body = "M-44 0 C-54 -50 -46 -108 -24 -134 C-12 -146 10 -150 24 -140 C32 -122 36 -102 40 -84 L74 -74 C94 -70 100 -54 96 -42 L100 0Z"
        return (f'<g transform="translate({x} {y}) scale({s*flip} {s})">'
                f'<path d="{body}" fill="#22102c"/>'
                f'<path d="M-46 -2 C-52 -40 -48 -70 -40 -78 L40 -84 L74 -74 C94 -70 100 -54 96 -42 L100 -2Z" fill="url(#{pat})"/>'
                f'<path d="M-46 -2 C-52 -40 -48 -70 -40 -78 L40 -84 L74 -74 C94 -70 100 -54 96 -42 L100 -2Z" fill="url(#shadeL)"/>'
                '<path d="M-10 -142 L-6 -160 L14 -160 L16 -142Z" fill="#22102c"/>'
                '<ellipse cx="6" cy="-178" rx="20" ry="23" fill="#22102c"/>'
                '<path d="M24 -184 C30 -176 30 -168 26 -162 L30 -158 L24 -154" fill="#22102c"/>'
                f'<path d="M-16 -186 C-20 -214 26 -218 26 -190 C10 -196 -2 -196 -16 -186Z" fill="{wrap}"/>'
                '<path d="M26 -190 C30 -176 32 -166 26 -158 M24 -140 C32 -122 36 -102 40 -84 L74 -74 C94 -70 100 -54 96 -42" fill="none" stroke="#ffb060" stroke-width="4" stroke-linecap="round" opacity=".95" filter="url(#glint)"/>'
                '<path d="M60 -100 C70 -96 80 -88 84 -78" fill="none" stroke="#22102c" stroke-width="12" stroke-linecap="round"/>'
                '</g>')
    b += villager(222, 505, .55, "pagneT", 1, "#f2bb45") + villager(498, 505, .55, "pagneP", -1, "#10b7a6")
    b += villager(118, 600, .95, "pagneP") + villager(602, 600, .95, "pagneT", -1, "#f2bb45")
    # pierres
    for (x, y, rx, ry) in ((200, 590, 46, 28), (268, 622, 48, 28), (360, 636, 52, 28), (452, 622, 48, 28), (520, 590, 46, 28)):
        b += f'<ellipse cx="{x}" cy="{y+14}" rx="{rx+6}" ry="{ry*.6:.0f}" fill="#1a0610" opacity=".55" filter="url(#soft)"/>'
        b += f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="url(#stoneC)" filter="url(#rock)"/>'
    # braises
    b += f'<ellipse cx="{fx}" cy="572" rx="120" ry="26" fill="#ff7a2a" filter="url(#blur8)"/><ellipse cx="{fx}" cy="572" rx="70" ry="14" fill="#fff0a0" filter="url(#blur8)"/>'
    # flammes (couches en mode écran, bords déchiquetés par la turbulence)
    b += f'<ellipse cx="{fx}" cy="440" rx="170" ry="200" fill="#ff8a2a" opacity=".5" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    fl = lambda d, col, flt, op=1: f'<path d="{d}" fill="{col}" filter="url(#{flt})" opacity="{op}"/>'
    T1 = "M360 120 C392 210 500 262 474 398 C460 474 424 552 360 558 C296 552 258 474 246 398 C226 300 296 262 296 196 C322 236 334 258 344 282 C348 220 336 168 360 120Z"
    T2 = "M462 250 C508 334 500 438 446 500 C436 446 426 412 404 390 C430 344 458 300 462 250Z M258 274 C216 356 222 448 268 506 C276 456 288 418 308 396 C286 360 268 322 258 274Z"
    T3 = "M360 214 C392 296 450 338 428 434 C416 492 392 536 360 540 C328 536 302 494 296 446 C288 384 328 348 338 296 C348 320 352 340 356 356 C364 306 348 262 360 214Z"
    T4 = "M360 300 C386 358 420 396 406 462 C398 504 382 530 360 532 C338 530 320 504 316 472 C308 420 342 392 360 300Z"
    T5 = "M360 388 C376 426 392 450 386 486 C382 508 372 522 360 524 C348 522 338 508 334 490 C330 458 348 440 360 388Z"
    b += fl(T1, "url(#flOuter)", "flame", .95) + fl(T2, "#ff5a14", "flame2", .9)
    b += fl(T3, "url(#flMid)", "flame") + fl(T4, "url(#flIn)", "flame2") + fl(T5, "url(#flCore)", "flame2")
    b += f'<ellipse cx="{fx}" cy="470" rx="60" ry="80" fill="#fff6c8" opacity=".5" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    # bûches (texture bois + éclairage du feu)
    def log(rot, endx):
        return (f'<g transform="translate(360 578) rotate({rot})">'
                '<rect x="-160" y="-22" width="320" height="44" rx="22" fill="#000" filter="url(#woodTex)"/>'
                '<rect x="-160" y="-22" width="320" height="44" rx="22" fill="url(#cyl)" style="mix-blend-mode:multiply"/>'
                f'<rect x="-40" y="-22" width="80" height="20" rx="8" fill="#ff8a2a" opacity=".55" filter="url(#soft)" style="mix-blend-mode:screen"/>'
                f'<ellipse cx="{endx}" rx="15" ry="22" fill="url(#endgrain)"/>'
                f'<ellipse cx="{endx}" rx="9" ry="13" fill="none" stroke="#8a4a20" stroke-width="1.5" opacity=".7"/>'
                f'<ellipse cx="{endx}" rx="4" ry="6" fill="none" stroke="#8a4a20" stroke-width="1.5" opacity=".7"/></g>')
    b += log(-16, 160) + log(16, -160)
    b += f'<ellipse cx="{fx}" cy="562" rx="80" ry="16" fill="#ffd060" opacity=".55" filter="url(#blur8)" style="mix-blend-mode:screen"/>'
    # étincelles (traînées floues)
    rnd = random.Random(9); sp = ""
    for _ in range(34):
        x = rnd.uniform(230, 500); y = rnd.uniform(40, 330); l = rnd.uniform(6, 20)
        sp += f'<path d="M{x:.0f} {y:.0f} q{rnd.uniform(-8,8):.0f} {l/2:.0f} {rnd.uniform(-3,3):.0f} {l:.0f}" stroke="{rnd.choice(["#fff3c2","#ffd25a","#ffb43a","#ffe9a0"])}" stroke-width="{rnd.uniform(1.5,3.2):.1f}" stroke-linecap="round" fill="none"/>'
    b += f'<g filter="url(#glint)">{sp}</g>'
    b += bokeh(W, 420, 14, 5, ["#ffcf6a", "#ff8a3a"], 4, 12, .5)
    b += power_frame(W)
    return svg(W, W, defs, b)

# ═════════════════════ BRIQUES COMMUNES AUX CARTES DE POUVOIR ═════════════════════
TONES = {
    "gold":   ("#fff7d6", "#ffc94a", "#e0782a", "#6e2248", "#fff3c2"),
    "teal":   ("#e8fff8", "#3ddcc8", "#0b8f86", "#0a3450", "#c8fff4"),
    "pink":   ("#ffe8ef", "#ff6f9a", "#c22a5e", "#3a0c3a", "#ffd0de"),
    "cobalt": ("#e4ebff", "#6f8aff", "#2c45b8", "#120e48", "#d8e0ff"),
}

WOOD = '''<filter id="woodV" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".28 .008" numOctaves="3" seed="12"/>
  <feColorMatrix type="matrix" values=".55 0 0 0 .38  .35 0 0 0 .18  .18 0 0 0 .07  0 0 0 0 1"/>
  <feComposite in2="SourceAlpha" operator="in"/></filter>
<linearGradient id="cylH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0e06"/><stop offset=".22" stop-color="#b07850"/><stop offset=".38" stop-color="#ffffff"/><stop offset=".6" stop-color="#c89070"/><stop offset="1" stop-color="#1a0804"/></linearGradient>'''

def bg_textile(tone, cy=.42):
    c0, c1, c2, c3, line = TONES[tone]
    defs = TEXTILE + f'''
    <radialGradient id="bgT" cx="50%" cy="{cy*100:.0f}%" r="78%"><stop offset="0" stop-color="{c0}"/><stop offset=".25" stop-color="{c1}"/><stop offset=".62" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/></radialGradient>
    <pattern id="ndopT" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M40 6 L74 40 L40 74 L6 40Z" fill="none" stroke="{line}" stroke-opacity=".45" stroke-width="4"/>
      <path d="M40 22 L58 40 L40 58 L22 40Z" fill="{line}" fill-opacity=".18"/>
      <path d="M40 34 L46 40 L40 46 L34 40Z" fill="#ffe08a" fill-opacity=".6"/></pattern>
    <radialGradient id="vigT" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="{c3}" stop-opacity="0"/><stop offset="1" stop-color="{c3}" stop-opacity=".6"/></radialGradient>'''
    body = ('<rect width="720" height="720" fill="url(#bgT)" filter="url(#textile)"/>'
            '<rect width="720" height="720" fill="url(#ndopT)" filter="url(#textile)" opacity=".75"/>'
            + god_rays(360, 720*cy, 34, 760, hash(tone) % 97, op=.38)
            + bokeh(720, 720, 22, len(tone), [c0, "#ffe08a", line], 5, 18, .45)
            + '<rect width="720" height="720" fill="url(#vigT)"/>')
    return defs, body

def bg_sky(top, mid, low, horizon=470, stars=40, seed=3):
    defs = f'<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset=".55" stop-color="{mid}"/><stop offset="1" stop-color="{low}"/></linearGradient>'
    rnd = random.Random(seed)
    st = "".join(f'<circle cx="{rnd.uniform(40,680):.0f}" cy="{rnd.uniform(40,horizon-160):.0f}" r="{rnd.uniform(.6,2):.1f}" fill="#fff" opacity="{rnd.uniform(.3,1):.2f}"/>' for _ in range(stars))
    return defs, f'<rect width="720" height="720" fill="url(#skyG)"/>{st}'

def floor_shadow(cx, cy, rx, ry, op=.5):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#2a0a10" opacity="{op}" filter="url(#blur20)"/>'

def sound_waves(cx, cy, n, r0, step, col, sw=6, a0=-150, a1=-30):
    s = ""
    for i in range(n):
        r = r0 + i*step
        x0, y0 = cx + r*math.cos(math.radians(a0)), cy + r*math.sin(math.radians(a0))
        x1, y1 = cx + r*math.cos(math.radians(a1)), cy + r*math.sin(math.radians(a1))
        s += f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 0 1 {x1:.1f} {y1:.1f}" fill="none" stroke="{col}" stroke-width="{sw-i:.1f}" stroke-linecap="round" opacity="{1-i*.18:.2f}"/>'
    return f'<g filter="url(#glint)">{s}</g>'

def bead_band(cx, y, rx, ry, n, cols, r=7):
    """Rangée de perles sur un cylindre (seulement la face avant)."""
    s = ""
    for i in range(n):
        a = math.pi * (i + .5) / n
        x = cx - rx*math.cos(a); yy = y + ry*math.sin(a)
        k = 0.55 + 0.45*math.sin(a)
        s += f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="{r*k:.1f}" fill="url(#{cols[i % len(cols)]})" filter="url(#gem)"/>'
    return s

# ───────────────────────── TAMBOUR D'APPEL ─────────────────────────
def tambour():
    d, bg = bg_textile("gold", .36)
    defs = d + WOOD + '''
    <radialGradient id="skin" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#fff4dc"/><stop offset=".6" stop-color="#ecd0a0"/><stop offset="1" stop-color="#b88a58"/></radialGradient>
    <filter id="hide" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="4" seed="4"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .3  0 0 0 0 .15  0 0 0 1.2 -.5"/><feComposite in2="SourceAlpha" operator="in"/></filter>'''
    b = bg + floor_shadow(370, 640, 200, 34, .6)
    body = "M208 196 C206 300 286 382 300 440 C306 500 262 560 246 616 Q360 640 474 616 C458 560 414 500 420 440 C434 382 514 300 512 196Z"
    b += f'<path d="{body}" fill="#000" filter="url(#woodV)"/>'
    b += f'<path d="{body}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    b += f'<path d="{body}" fill="url(#cylH)" opacity=".22" style="mix-blend-mode:screen"/>'
    # frise sculptée sur le pied
    tri = "".join(f'<path d="M{x} 520 l12 -22 l12 22Z"/>' for x in range(282, 430, 26))
    b += f'<g fill="#2a0e06" opacity=".55">{tri}</g><path d="M276 528 Q360 540 444 528 M280 494 Q360 506 440 494" stroke="#2a0e06" stroke-width="3" fill="none" opacity=".6"/>'
    # anneau inférieur + laçage
    b += '<ellipse cx="360" cy="412" rx="84" ry="18" fill="none" stroke="#e8d2a0" stroke-width="9"/>'
    lace = ""
    cols = ["#10b7a6", "#d83c68"]
    for i in range(14):
        a = math.pi*(i+.5)/14
        xt = 360 - 150*math.cos(a); yt = 222 + 28*math.sin(a)
        xb = 360 - 82*math.cos(a + math.pi/28); yb = 412 + 18*math.sin(a)
        xb2 = 360 - 82*math.cos(a - math.pi/28)
        op = .45 + .55*math.sin(a)
        lace += f'<path d="M{xt:.1f} {yt:.1f} L{xb:.1f} {yb:.1f} M{xt:.1f} {yt:.1f} L{xb2:.1f} {yb:.1f}" stroke="{cols[i%2]}" stroke-width="4.5" opacity="{op:.2f}"/>'
    b += f'<g stroke-linecap="round" filter="url(#dropS)">{lace}</g>'
    b += '<ellipse cx="360" cy="412" rx="84" ry="18" fill="none" stroke="#fff6dc" stroke-width="3" stroke-dasharray="6 5" opacity=".8"/>'
    # peau + cercle de corde
    b += '<ellipse cx="360" cy="200" rx="154" ry="44" fill="url(#skin)"/><ellipse cx="360" cy="200" rx="154" ry="44" filter="url(#hide)" opacity=".55"/>'
    b += '<ellipse cx="360" cy="200" rx="154" ry="44" fill="none" stroke="#8a5a2a" stroke-width="12"/>'
    b += '<ellipse cx="360" cy="200" rx="154" ry="44" fill="none" stroke="#f0dcae" stroke-width="7" stroke-dasharray="9 5"/>'
    b += '<ellipse cx="360" cy="226" rx="152" ry="30" fill="none" stroke="#e8d2a0" stroke-width="8" stroke-dasharray="10 4" opacity=".9"/>'
    b += '<ellipse cx="330" cy="188" rx="60" ry="14" fill="#fff" opacity=".35" filter="url(#soft)"/>'
    b += sound_waves(360, 196, 4, 120, 46, "#fff3c2", 8)
    b += glint(250, 186, .7) + glint(470, 210, .5) + glint(360, 60, .8)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── BÉNÉDICTION DU CHEF ─────────────────────────
def benediction():
    d, bg = bg_textile("gold", .3)
    defs = d + WOOD + '''
    <pattern id="beadsP" width="22" height="20" patternUnits="userSpaceOnUse">
      <rect width="22" height="20" fill="#1a0e3a"/>
      <circle cx="5.5" cy="5" r="4.4" fill="#d83c68"/><circle cx="16.5" cy="5" r="4.4" fill="#f2bb45"/>
      <circle cx="0" cy="15" r="4.4" fill="#2a8cf0"/><circle cx="11" cy="15" r="4.4" fill="#fff4dc"/><circle cx="22" cy="15" r="4.4" fill="#2a8cf0"/>
      <circle cx="4" cy="3.5" r="1.4" fill="#fff" opacity=".8"/><circle cx="15" cy="3.5" r="1.4" fill="#fff" opacity=".8"/><circle cx="9.5" cy="13.5" r="1.4" fill="#fff" opacity=".8"/></pattern>
    <radialGradient id="blessing" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffe28a" stop-opacity=".45"/><stop offset="1" stop-color="#ffe28a" stop-opacity="0"/></radialGradient>
    <radialGradient id="featherCore" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7a0e2e"/><stop offset="1" stop-color="#c82a52"/></radialGradient>'''
    b = bg
    b += '<path d="M250 0 L470 0 L560 520 L160 520Z" fill="url(#blessing)" opacity=".85" filter="url(#blur8)" style="mix-blend-mode:screen"/>'
    b += floor_shadow(370, 650, 250, 36, .6)
    b += '<g transform="translate(360 540) scale(1.25) translate(-360 -530)">'
    # tabouret royal perlé
    base = "M248 470 L248 600 Q360 634 472 600 L472 470Z"
    b += f'<path d="{base}" fill="url(#beadsP)"/>'
    b += '<g fill="#120820">' + "".join(f'<path d="M{x} 500 l22 36 l-22 36 l-22 -36Z"/>' for x in (300, 360, 420)) + '</g>'
    b += f'<path d="{base}" fill="url(#cylH)" opacity=".85" style="mix-blend-mode:multiply"/>'
    b += '<ellipse cx="360" cy="604" rx="118" ry="24" fill="#000" filter="url(#woodV)"/><ellipse cx="360" cy="604" rx="118" ry="24" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    seat = "M200 440 Q200 476 360 482 Q520 476 520 440 L520 424 Q360 446 200 424Z"
    b += f'<path d="{seat}" fill="#000" filter="url(#woodV)"/><path d="{seat}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    b += '<ellipse cx="360" cy="424" rx="160" ry="34" fill="#000" filter="url(#woodV)"/>'
    b += '<ellipse cx="360" cy="424" rx="160" ry="34" fill="#ffdca0" opacity=".35" style="mix-blend-mode:screen"/>'
    b += '<ellipse cx="360" cy="424" rx="132" ry="24" fill="none" stroke="#2a0e06" stroke-width="3" opacity=".5"/>'
    b += bead_band(360, 452, 160, 28, 26, ["gemPink", "pearl", "gemTeal", "pearl"], 7)
    b += "</g>"
    # chapeau juju (plumes) en lévitation
    rnd = random.Random(21); fe = ""
    for i in range(900):
        a = rnd.uniform(0, 2*math.pi); L = rnd.uniform(90, 168)*(0.9 if math.sin(a) > 0 else 1)
        x0, y0 = 360 + 30*math.cos(a), 230 + 24*math.sin(a)
        x1, y1 = 360 + L*math.cos(a), 230 + L*.8*math.sin(a)
        bend = rnd.uniform(-14, 14)
        col = rnd.choice(["#d83c68", "#e8466e", "#ff7aa0", "#c22a5e", "#ffb0c8", "#fff0f4", "#a8183e"])
        fe += f'<path d="M{x0:.0f} {y0:.0f} Q{(x0+x1)/2+bend:.0f} {(y0+y1)/2-bend:.0f} {x1:.0f} {y1:.0f}" stroke="{col}" stroke-width="{rnd.uniform(2,5):.1f}" opacity="{rnd.uniform(.6,1):.2f}"/>'
    b += f'<circle cx="360" cy="230" r="190" fill="#fff3c2" opacity=".55" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    b += f'<g fill="none" stroke-linecap="round" filter="url(#dropS)">{fe}</g>'
    b += '<circle cx="360" cy="230" r="42" fill="url(#featherCore)" filter="url(#gem)"/>'
    b += gem(360, 230, 18, "Teal")
    b += glint(360, 112, 1.1) + glint(240, 170, .6) + glint(490, 200, .5) + glint(470, 420, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── PLUIE D'ÉTOILES ─────────────────────────
def pluie():
    d, sky = bg_sky("#2a2070", "#b8467a", "#ffbf5a", 560, 70, 31)
    defs = d + '''
    <radialGradient id="calab" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#ffd08a"/><stop offset=".5" stop-color="#d08a3a"/><stop offset="1" stop-color="#5a2a10"/></radialGradient>
    <radialGradient id="inside" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffd25a"/><stop offset="1" stop-color="#b8701a"/></radialGradient>
    <radialGradient id="coin" cx="40%" cy="35%" r="70%">''' + GOLD_STOPS + '''</radialGradient>
    <radialGradient id="horizonGlow" cx="50%" cy="100%" r="80%"><stop offset="0" stop-color="#fff2c0"/><stop offset="1" stop-color="#fff2c0" stop-opacity="0"/></radialGradient>'''
    b = sky + '<rect y="300" width="720" height="420" fill="url(#horizonGlow)" opacity=".7"/>'
    b += '<path d="M0 520 C120 490 240 505 360 495 S600 480 720 500 V720 H0Z" fill="#5a2050" opacity=".9" filter="url(#soft)"/>'
    # étoiles filantes
    rnd = random.Random(8); tails = ""; heads = ""
    for i in range(11):
        x = rnd.uniform(120, 620); y = rnd.uniform(70, 360); L = rnd.uniform(90, 200)
        ang = math.radians(rnd.uniform(58, 72)); dx, dy = -L*math.cos(ang)*.55, -L*math.sin(ang)
        gid = f"tail{i}"
        defs += f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x:.0f}" y1="{y:.0f}" x2="{x+dx:.0f}" y2="{y+dy:.0f}"><stop offset="0" stop-color="#fff8dc"/><stop offset=".3" stop-color="#ffd25a" stop-opacity=".7"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/></linearGradient>'
        w = rnd.uniform(3, 7)
        tails += f'<path d="M{x:.0f} {y:.0f} L{x+dx:.0f} {y+dy:.0f}" stroke="url(#{gid})" stroke-width="{w:.1f}" stroke-linecap="round"/>'
        heads += glint(round(x), round(y), w/9)
    b += f'<g filter="url(#glowS2)">{tails}</g>{heads}'
    defs += '<filter id="glowS2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    # calebasse
    b += floor_shadow(370, 640, 230, 30, .6)
    b += '<path d="M150 470 C150 600 250 650 360 650 C470 650 570 600 570 470Z" fill="url(#calab)" filter="url(#porcelain)"/>'
    eng = "".join(f'<path d="M{x} 500 l14 26 l14 -26" />' for x in range(196, 520, 28))
    b += f'<g fill="none" stroke="#3a1606" stroke-width="3" opacity=".55">{eng}<path d="M168 498 Q360 530 552 498 M178 540 Q360 572 542 540"/></g>'
    b += '<ellipse cx="360" cy="470" rx="210" ry="46" fill="#7a4418"/><ellipse cx="360" cy="472" rx="196" ry="38" fill="url(#inside)"/>'
    # pièces et cauris débordants
    coins = ""
    rnd = random.Random(4)
    for i in range(26):
        x = rnd.uniform(200, 520); y = 470 - rnd.uniform(0, 40)*math.cos((x-360)/170)
        coins += f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="22" ry="9" fill="url(#coin)" transform="rotate({rnd.uniform(-20,20):.0f} {x:.0f} {y:.0f})" filter="url(#metal)"/>'
    b += coins
    for (x, y, r) in ((300, 444, -60), (420, 440, 50), (360, 430, 10)):
        b += f'<g transform="translate({x} {y}) rotate({r}) scale(.28)">{cowrie(100, 140)}</g>'
    b += '<ellipse cx="360" cy="420" rx="160" ry="90" fill="#fff3c2" opacity=".55" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    b += glint(360, 410, 1.2) + glint(250, 450, .5) + glint(470, 445, .6)
    b += bokeh(720, 720, 16, 22, ["#fff3c2", "#ffd25a"], 4, 12, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── TOTEM DES ANCÊTRES ─────────────────────────
def totem():
    d, bg = bg_textile("gold", .4)
    defs = d + WOOD + '''
    <radialGradient id="aegis" cx="50%" cy="50%" r="50%"><stop offset=".7" stop-color="#ffe9a0" stop-opacity="0"/><stop offset=".9" stop-color="#fff3c2" stop-opacity=".55"/><stop offset="1" stop-color="#fff3c2" stop-opacity="0"/></radialGradient>
    <linearGradient id="kaolin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8c8b0" stop-opacity="0"/><stop offset=".5" stop-color="#fff8ea" stop-opacity=".85"/><stop offset="1" stop-color="#d8c8b0" stop-opacity="0"/></linearGradient>'''
    b = bg
    b += '<circle cx="360" cy="370" r="300" fill="url(#aegis)"/>'
    b += '<circle cx="360" cy="370" r="262" fill="none" stroke="#fff3c2" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" opacity=".8"/>'
    b += floor_shadow(370, 650, 150, 26, .6)
    def face(cy, w, h):
        f = f'<path d="M{360-w} {cy-h*.55} C{360-w} {cy-h} {360+w} {cy-h} {360+w} {cy-h*.55} C{360+w*1.02} {cy+h*.25} {360+w*.6} {cy+h*.9} 360 {cy+h} C{360-w*.6} {cy+h*.9} {360-w*1.02} {cy+h*.25} {360-w} {cy-h*.55}Z"'
        out = f + ' fill="#000" filter="url(#woodV)"/>' + f + ' fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
        out += f'<path d="M{360-w*.8} {cy-h*.45} Q{360-w*.4} {cy-h*.62} 360 {cy-h*.45} Q{360+w*.4} {cy-h*.62} {360+w*.8} {cy-h*.45}" stroke="#2a0e06" stroke-width="6" fill="none" opacity=".7"/>'
        for sx in (-1, 1):
            ex = 360 + sx*w*.42
            out += f'<path d="M{ex-w*.26:.0f} {cy-h*.22:.0f} Q{ex:.0f} {cy-h*.38:.0f} {ex+w*.26:.0f} {cy-h*.22:.0f} Q{ex:.0f} {cy-h*.1:.0f} {ex-w*.26:.0f} {cy-h*.22:.0f}Z" fill="#1a0804"/>'
            out += f'<path d="M{ex-w*.18:.0f} {cy-h*.23:.0f} Q{ex:.0f} {cy-h*.3:.0f} {ex+w*.18:.0f} {cy-h*.23:.0f}" stroke="#fff3c2" stroke-width="2.5" fill="none" opacity=".9"/>'
        out += f'<path d="M352 {cy-h*.35} L342 {cy+h*.25} Q360 {cy+h*.34} 378 {cy+h*.25} L368 {cy-h*.35}Z" fill="#c89060" opacity=".55"/>'
        out += f'<path d="M340 {cy+h*.25} Q360 {cy+h*.36} 380 {cy+h*.25}" stroke="#2a0e06" stroke-width="4" fill="none"/>'
        out += f'<ellipse cx="360" cy="{cy+h*.56}" rx="{w*.3}" ry="{h*.09}" fill="#2a0e06"/><path d="M{360-w*.28} {cy+h*.55} Q360 {cy+h*.5} {360+w*.28} {cy+h*.55}" stroke="#d83c68" stroke-width="4" fill="none"/>'
        for sx in (-1, 1):
            out += f'<path d="M{360+sx*w*.75} {cy-h*.05} l{sx*-12} 10 l{sx*12} 10 l{sx*-12} 10 l{sx*12} 10" stroke="#fff3c2" stroke-width="4" fill="none" opacity=".85"/>'
        out += f'<rect x="{360-w}" y="{cy-h}" width="{2*w}" height="{2*h}" fill="url(#kaolin)" opacity=".25" style="mix-blend-mode:screen"/>'
        return out
    # fût + socle
    col = "M300 180 L420 180 L430 610 L290 610Z"
    b += f'<path d="{col}" fill="#000" filter="url(#woodV)"/><path d="{col}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    b += '<path d="M250 600 L470 600 L486 640 L234 640Z" fill="#000" filter="url(#woodV)"/><path d="M250 600 L470 600 L486 640 L234 640Z" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    # coiffe en crête
    crest = "M300 150 C300 70 330 40 360 30 C390 40 420 70 420 150Z"
    b += f'<path d="{crest}" fill="#000" filter="url(#woodV)"/><path d="{crest}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    b += '<path d="M318 140 L360 60 L402 140" stroke="#2a0e06" stroke-width="5" fill="none" opacity=".6"/>'
    b += face(220, 86, 92) + face(450, 78, 84)
    b += bead_band(360, 322, 70, 16, 14, ["gemTeal", "pearl", "gemPink", "pearl"], 8)
    b += bead_band(360, 548, 74, 16, 14, ["gemPink", "pearl", "gemBlue", "pearl"], 8)
    b += gem(360, 40, 12, "Teal")
    b += '<rect x="280" y="20" width="160" height="620" fill="#ffd28a" opacity=".18" style="mix-blend-mode:screen"/>'
    b += glint(260, 140, .7) + glint(470, 330, .5) + glint(360, 28, .8)
    b += power_frame()
    return svg(720, 720, defs, b)


GLASS = """<linearGradient id="glassH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".15" stop-color="#ffffff" stop-opacity=".08"/><stop offset=".75" stop-color="#ffffff" stop-opacity=".04"/><stop offset=".9" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity=".1"/></linearGradient>"""

CLOUDS = """<filter id="clouds" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".005 .012" numOctaves="4" seed="SEED" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.8 -1.15" result="a"/>
  <feGaussianBlur in="a" stdDeviation="4" result="ab"/>
  <feOffset in="ab" dx="0" dy="14" result="sh"/>
  <feColorMatrix in="sh" type="matrix" values="0 0 0 0 SR  0 0 0 0 SG  0 0 0 0 SB  0 0 0 .7 0" result="shade"/>
  <feComposite in="ab" in2="shade" operator="over"/></filter>"""

def clouds(seed, shade="#7ac8d0"):
    r, g, bb = (int(shade[i:i+2], 16)/255 for i in (1, 3, 5))
    return CLOUDS.replace("SEED", str(seed)).replace("SR", f"{r:.2f}").replace("SG", f"{g:.2f}").replace("SB", f"{bb:.2f}")

def leaf(x, y, s, rot, col="#5cc86a"):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})"><path d="M0 -40 C24 -22 24 22 0 40 C-24 22 -24 -22 0 -40Z" fill="{col}" filter="url(#gem)"/>'
            '<path d="M0 -38 L0 38 M0 -14 L10 -22 M0 2 L-12 -6 M0 16 L11 8" stroke="#1e6a30" stroke-width="2" opacity=".7"/></g>')

def mini_card(x, y, w, rot, face=False):
    h = w*1.4
    inner = (f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="{w*.1:.0f}" fill="#fff8e8" stroke="#c8a060" stroke-width="2"/>'
             f'<text x="{-w*.3:.0f}" y="{-h*.22:.0f}" font-family="Georgia,serif" font-weight="900" font-size="{w*.32:.0f}" fill="#c22a5e">7</text>'
             f'<text x="0" y="{h*.12:.0f}" text-anchor="middle" font-size="{w*.5:.0f}" fill="#c22a5e">♥</text>') if face else (
             f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="{w*.1:.0f}" fill="url(#gold)"/>'
             f'<rect x="{-w/2+w*.08:.1f}" y="{-h/2+w*.08:.1f}" width="{w*.84:.1f}" height="{h-w*.16:.1f}" rx="{w*.06:.0f}" fill="#3154d4"/>'
             f'<path d="M0 {-h*.28:.0f} L{w*.26:.0f} 0 L0 {h*.28:.0f} L{-w*.26:.0f} 0Z" fill="none" stroke="#ffe08a" stroke-width="2"/>'
             f'<ellipse rx="{w*.1:.1f}" ry="{w*.15:.1f}" fill="#fff0d0"/>')
    return f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#dropS)">{inner}</g>'

# ───────────────────────── BOUCLIER DU VILLAGE ─────────────────────────
def bouclier():
    d, bg = bg_textile("teal", .42)
    defs = d + WOOD + """
    <radialGradient id="hideG" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#fff2d6"/><stop offset=".55" stop-color="#e2c08a"/><stop offset="1" stop-color="#9a6a3a"/></radialGradient>
    <filter id="hide2" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="9"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .4  0 0 0 0 .25  0 0 0 0 .1  0 0 0 1.3 -.55"/><feComposite in2="SourceAlpha" operator="in"/></filter>
    <radialGradient id="dome" cx="50%" cy="50%" r="50%"><stop offset=".75" stop-color="#9ffff0" stop-opacity="0"/><stop offset=".95" stop-color="#c8fff6" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></radialGradient>
    <linearGradient id="spearShaft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1a08"/><stop offset=".4" stop-color="#c8904a"/><stop offset="1" stop-color="#3a1a08"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a6a78"/><stop offset=".45" stop-color="#f4fbff"/><stop offset=".55" stop-color="#b8c8d4"/><stop offset="1" stop-color="#3a4652"/></linearGradient>"""
    b = bg
    # lances croisées
    for rot in (-32, 32):
        b += (f'<g transform="rotate({rot} 360 370)" filter="url(#dropS)"><rect x="352" y="40" width="16" height="640" rx="8" fill="url(#spearShaft)"/>'
              '<path d="M360 -10 C384 40 384 90 368 120 L352 120 C336 90 336 40 360 -10Z" fill="url(#steel)" filter="url(#metal)"/>'
              '<rect x="348" y="118" width="24" height="18" rx="4" fill="url(#gold)" filter="url(#metal)"/></g>')
    b += floor_shadow(370, 650, 170, 26, .45)
    # bouclier ovale en cuir peint
    b += '<ellipse cx="360" cy="370" rx="176" ry="262" fill="#000" filter="url(#woodV)"/>'
    b += '<ellipse cx="360" cy="370" rx="164" ry="250" fill="url(#hideG)" filter="url(#porcelain)"/>'
    b += '<ellipse cx="360" cy="370" rx="164" ry="250" filter="url(#hide2)" opacity=".5"/>'
    pat = ""
    for k, y in enumerate(range(150, 600, 60)):
        w = 150*math.sqrt(max(0, 1-((y-370)/250)**2))
        col = "#0e8f84" if k % 2 else "#b8284e"
        pat += f'<path d="M{360-w*.9:.0f} {y} L{360-w*.45:.0f} {y+26} L360 {y} L{360+w*.45:.0f} {y+26} L{360+w*.9:.0f} {y}" stroke="{col}" stroke-width="9" fill="none" stroke-linejoin="round"/>'
    b += f'<g opacity=".85" clip-path="url(#shieldClip)">{pat}</g>'
    defs += '<clipPath id="shieldClip"><ellipse cx="360" cy="370" rx="160" ry="246"/></clipPath>'
    b += '<path d="M360 128 L360 612" stroke="#3a1a08" stroke-width="14" opacity=".75"/>'
    b += '<ellipse cx="360" cy="370" rx="168" ry="254" fill="none" stroke="#e8cf9a" stroke-width="7" stroke-dasharray="11 5"/>'
    b += f'<g filter="url(#drop)"><circle cx="360" cy="370" r="46" fill="url(#gold)" filter="url(#metal)"/></g>' + gem(360, 370, 18, "Teal", False)
    # dôme protecteur
    b += '<ellipse cx="360" cy="370" rx="290" ry="300" fill="url(#dome)"/>'
    hexes = ""
    for row in range(-6, 7):
        for col in range(-6, 7):
            x = 360 + col*52 + (26 if row % 2 else 0); y = 370 + row*45
            if ((x-360)/280)**2 + ((y-370)/290)**2 < 1 and ((x-360)/180)**2 + ((y-370)/265)**2 > 1:
                hexes += f'<path d="M{x} {y-28} l24 14 v28 l-24 14 l-24 -14 v-28Z"/>'
    b += f'<g fill="none" stroke="#dffffa" stroke-width="2" opacity=".35" filter="url(#glowS2)">{hexes}</g>'
    defs += '<filter id="glowS2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    b += glint(250, 210, .8) + glint(560, 160, .6) + glint(470, 560, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── ÉCLAIR DU MFOUNDI ─────────────────────────
def eclair():
    d, sky = bg_sky("#1a5a9a", "#3ac8c8", "#c8fff0", 430, 30, 5)
    defs = d + clouds(17, "#5aa8c0") + """
    <linearGradient id="river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6fffa"/><stop offset=".5" stop-color="#5ee6d4"/><stop offset="1" stop-color="#0a7a80"/></linearGradient>
    <filter id="ripple" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .08" numOctaves="2" seed="3" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="18" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="bolt" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="14" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b2"/>
      <feMerge><feMergeNode in="b1"/><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>"""
    b = sky
    b += '<rect width="720" height="360" filter="url(#clouds)" opacity=".85"/>'
    b += '<ellipse cx="380" cy="150" rx="260" ry="120" fill="#e6fffa" opacity=".45" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    # collines de Yaoundé + lumières
    b += '<path d="M0 420 C80 380 150 400 220 370 S360 340 430 372 S580 350 720 390 V720 H0Z" fill="#13707a"/>'
    rnd = random.Random(4)
    b += "".join(f'<circle cx="{rnd.uniform(20,700):.0f}" cy="{rnd.uniform(400,470):.0f}" r="{rnd.uniform(1.2,2.6):.1f}" fill="{rnd.choice(["#ffe08a","#fff3c2","#ffb060"])}" filter="url(#glowS)"/>' for _ in range(40))
    defs += '<filter id="glowS" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    b += '<path d="M0 470 C100 455 200 470 300 458 S520 450 720 470 V720 H0Z" fill="#168a84"/>'
    # rivière sinueuse
    riv = "M330 470 C380 500 300 530 330 560 C370 600 520 610 480 660 C460 690 380 700 360 720 L560 720 C600 690 640 650 580 610 C520 570 400 560 420 530 C440 505 380 490 380 470Z"
    b += f'<path d="{riv}" fill="url(#river)" filter="url(#ripple)"/>'
    b += f'<path d="{riv}" fill="#ffffff" opacity=".25" filter="url(#blur8)" style="mix-blend-mode:screen"/>'
    b += '<path d="M0 560 C100 540 200 600 300 620 L300 720 H0Z M720 560 C650 580 620 640 600 720 H720Z" fill="#0e6a6a" opacity=".85"/>'
    # éclair ramifié
    rnd = random.Random(12)
    def bolt_path(x, y, tx, ty, n, jit):
        pts = [(x, y)]
        for i in range(1, n):
            t = i/n
            pts.append((x+(tx-x)*t + rnd.uniform(-jit, jit), y+(ty-y)*t + rnd.uniform(-jit*.3, jit*.3)))
        pts.append((tx, ty))
        return pts
    main = bolt_path(380, 60, 400, 520, 14, 34)
    bl = '<path d="M' + " L".join(f"{p[0]:.0f} {p[1]:.0f}" for p in main) + '" stroke-width="7"/>'
    for k in (3, 6, 9):
        x, y = main[k]; br = bolt_path(x, y, x + rnd.choice([-1, 1])*rnd.uniform(90, 160), y + rnd.uniform(80, 150), 6, 18)
        bl += '<path d="M' + " L".join(f"{p[0]:.0f} {p[1]:.0f}" for p in br) + '" stroke-width="3.5"/>'
    b += f'<g fill="none" stroke="#ffffff" stroke-linejoin="round" stroke-linecap="round" filter="url(#bolt)">{bl}</g>'
    b += '<ellipse cx="400" cy="520" rx="120" ry="30" fill="#e6fffa" opacity=".7" filter="url(#blur20)" style="mix-blend-mode:screen"/>'
    b += '<path d="M400 520 L404 690" stroke="#ffffff" stroke-width="10" opacity=".35" filter="url(#blur8)" style="mix-blend-mode:screen"/>'
    b += glint(380, 62, 1.0)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── FILET DU PÊCHEUR ─────────────────────────
def filet():
    defs = """
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8fff6"/><stop offset=".3" stop-color="#3ed8c4"/><stop offset=".75" stop-color="#0a8a8a"/><stop offset="1" stop-color="#064a5a"/></linearGradient>
    <filter id="caustics" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency=".02 .03" numOctaves="2" seed="6"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -3 0 0 0 .9"/></filter>
    <filter id="netWarp" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="2" seed="5" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="22" xChannelSelector="R" yChannelSelector="G"/></filter>
    <linearGradient id="fishSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a6a8a"/><stop offset=".35" stop-color="#7ae0e8"/><stop offset=".55" stop-color="#f4ffff"/><stop offset="1" stop-color="#c8d8e0"/></linearGradient>
    <linearGradient id="fishGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8501a"/><stop offset=".4" stop-color="#ffb04a"/><stop offset=".6" stop-color="#fff0c8"/><stop offset="1" stop-color="#e8c890"/></linearGradient>
    <pattern id="scales" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M0 10 A6 6 0 0 1 12 10" fill="none" stroke="#08384a" stroke-opacity=".3" stroke-width="1.2"/></pattern>
    <radialGradient id="float" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffd0a0"/><stop offset=".6" stop-color="#e2602a"/><stop offset="1" stop-color="#7a2a10"/></radialGradient>"""
    b = '<rect width="720" height="720" fill="url(#sea)"/>'
    b += '<rect width="720" height="720" filter="url(#caustics)" opacity=".35" style="mix-blend-mode:screen"/>'
    b += god_rays(360, -120, 22, 900, 14, "#f0fffc", .55)
    rnd = random.Random(3)
    b += "".join(f'<circle cx="{rnd.uniform(60,660):.0f}" cy="{rnd.uniform(80,640):.0f}" r="{rnd.uniform(2,7):.1f}" fill="none" stroke="#e8fffa" stroke-width="1.5" opacity="{rnd.uniform(.4,.9):.2f}"/>' for _ in range(30))
    # poissons dans le filet
    def fish(x, y, s, rot, grad):
        return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#dropS)">'
                '<path d="M-90 0 C-60 -42 30 -46 70 -8 L110 -38 C104 -10 104 10 110 38 L70 8 C30 46 -60 42 -90 0Z" fill="url(#' + grad + ')" filter="url(#porcelain)"/>'
                '<path d="M-60 -2 C-30 -30 30 -30 66 -6 L66 6 C30 30 -30 30 -60 2Z" fill="url(#scales)"/>'
                '<path d="M-20 -34 C0 -60 30 -56 40 -30" fill="' + ('#ff8a3a' if grad == 'fishGold' else '#4ac8d8') + '" opacity=".8"/>'
                '<circle cx="-64" cy="-6" r="7" fill="#fff"/><circle cx="-65" cy="-6" r="4" fill="#08202a"/><circle cx="-66" cy="-8" r="1.5" fill="#fff"/>'
                '<path d="M-40 -18 C-46 -6 -46 6 -40 18" stroke="#08384a" stroke-width="2" fill="none" opacity=".5"/></g>')
    b += fish(300, 400, .95, -12, "fishSilver") + fish(450, 470, .8, 18, "fishGold") + fish(330, 540, .7, 5, "fishSilver") + fish(470, 330, .6, -25, "fishGold")
    # filet (maillage déformé)
    net = ""
    for i in range(-12, 30):
        x = i*38
        net += f'<path d="M{x} 120 L{x+420} 700"/><path d="M{x} 120 L{x-420} 700"/>'
    b += f'<g clip-path="url(#netClip)"><g fill="none" stroke="#fff6dc" stroke-width="2.6" opacity=".85" filter="url(#netWarp)">{net}</g></g>'
    defs += '<clipPath id="netClip"><path d="M110 150 Q360 110 610 150 C660 330 620 560 520 650 Q360 700 200 650 C100 560 60 330 110 150Z"/></clipPath>'
    b += '<path d="M110 150 Q360 110 610 150" stroke="#c8a060" stroke-width="10" fill="none" filter="url(#dropS)"/>'
    for i in range(7):
        t = i/6; x = 110 + 500*t; y = 150 - 40*math.sin(math.pi*t)*.95
        b += f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="18" ry="13" fill="url(#float)" filter="url(#gem)"/>'
    b += glint(250, 120, .7) + glint(560, 260, .5) + glint(320, 380, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── MAIN DU GRIOT (kora) ─────────────────────────
def griot():
    d, bg = bg_textile("teal", .4)
    defs = d + WOOD + """
    <radialGradient id="gourd" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="#ffe0a8"/><stop offset=".5" stop-color="#d0883a"/><stop offset="1" stop-color="#5a2a0e"/></radialGradient>
    <radialGradient id="leather" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#f8e2b8"/><stop offset=".7" stop-color="#d0a468"/><stop offset="1" stop-color="#8a5a2a"/></radialGradient>"""
    b = bg + floor_shadow(370, 650, 200, 30, .5)
    # manche
    neck = "M346 30 L374 30 L380 470 L340 470Z"
    b += f'<path d="{neck}" fill="#000" filter="url(#woodV)"/><path d="{neck}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
    for y in range(70, 300, 46):
        b += f'<rect x="336" y="{y}" width="48" height="9" rx="4" fill="#e8d2a0" filter="url(#dropS)"/>'
    # calebasse + peau
    b += '<circle cx="360" cy="500" r="170" fill="url(#gourd)" filter="url(#porcelain)"/>'
    b += '<ellipse cx="360" cy="470" rx="150" ry="120" fill="url(#leather)" filter="url(#porcelain)"/>'
    for i in range(22):
        a = math.radians(i*360/22)
        b += f'<circle cx="{360+142*math.cos(a):.0f}" cy="{470+112*math.sin(a):.0f}" r="5" fill="url(#gold)" filter="url(#metal)"/>'
    b += '<circle cx="300" cy="500" r="20" fill="#3a1606" opacity=".7"/>'
    # chevalet + cordes
    b += '<path d="M344 300 L376 300 L370 470 L350 470Z" fill="#f0dcae" filter="url(#porcelain)"/>'
    strings = ""
    for i in range(11):
        y = 310 + i*14
        strings += f'<path d="M{356 if i%2 else 364} {y} L{344 + (i%2)*32} 52"/>'
    b += f'<g stroke="#fffaf0" stroke-width="2.4" opacity=".95" filter="url(#glowS3)">{strings}</g>'
    defs += '<filter id="glowS3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    # notes de musique dorées
    notes = ""
    for (x, y, sc, r) in ((200, 200, 1.1, -12), (520, 170, .9, 10), (560, 330, .7, -6), (170, 380, .7, 14), (480, 90, .6, 4)):
        notes += (f'<g transform="translate({x} {y}) rotate({r}) scale({sc})"><ellipse cx="0" cy="30" rx="14" ry="10" transform="rotate(-20 0 30)"/>'
                  '<rect x="11" y="-30" width="5" height="60"/><path d="M16 -30 Q40 -20 34 6 Q30 -10 16 -12Z"/></g>')
    b += f'<g fill="url(#gold)" filter="url(#metal)">{notes}</g>'
    b += sound_waves(360, 240, 3, 150, 40, "#e8fff8", 5, -160, -20)
    b += glint(360, 40, .9) + glint(250, 430, .5) + glint(470, 530, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── SABLE DU TEMPS ─────────────────────────
def sable():
    d, bg = bg_textile("teal", .45)
    defs = d + WOOD + GLASS + """
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".6" stop-color="#e8b040"/><stop offset="1" stop-color="#b87a1a"/></linearGradient>
    <filter id="sandTex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="2"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .6  0 0 0 0 .4  0 0 0 0 .1  0 0 0 1.5 -.7"/><feComposite in2="SourceAlpha" operator="in"/></filter>
    <radialGradient id="frost" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e8fffc" stop-opacity=".0"/><stop offset=".7" stop-color="#c8fff6" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity=".0"/></radialGradient>"""
    b = bg + floor_shadow(370, 652, 190, 28, .55)
    b += '<circle cx="360" cy="370" r="260" fill="url(#frost)"/>'
    # verre
    glass = "M246 120 C246 250 340 320 352 370 C340 420 246 490 246 620 L474 620 C474 490 380 420 368 370 C380 320 474 250 474 120Z"
    b += f'<path d="{glass}" fill="#c8fff6" opacity=".18"/>'
    # sable haut (peu) + filet + tas bas (beaucoup)
    b += '<path d="M300 280 C320 320 350 350 356 368 L364 368 C370 350 400 320 420 280 Q360 296 300 280Z" fill="url(#sand)"/>'
    b += '<rect x="357" y="368" width="6" height="200" fill="url(#sand)" opacity=".95"/>'
    b += '<path d="M252 612 C262 540 330 520 360 500 C390 520 458 540 468 612Z" fill="url(#sand)"/><path d="M252 612 C262 540 330 520 360 500 C390 520 458 540 468 612Z" filter="url(#sandTex)" opacity=".6"/>'
    b += f'<path d="{glass}" fill="url(#glassH)"/>'
    b += f'<path d="{glass}" fill="none" stroke="#e8fffa" stroke-width="4" opacity=".85"/>'
    b += '<path d="M266 150 C266 240 320 300 336 340" stroke="#fff" stroke-width="8" stroke-linecap="round" fill="none" opacity=".55" filter="url(#soft)"/>'
    b += '<path d="M266 600 C266 520 310 450 334 410" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".4" filter="url(#soft)"/>'
    # cristaux de givre
    def crystal(x, y, s):
        arms = "".join(f'<g transform="rotate({a})"><path d="M0 0 L0 -30 M0 -14 L-8 -22 M0 -14 L8 -22 M0 -24 L-5 -30 M0 -24 L5 -30"/></g>' for a in range(0, 360, 60))
        return f'<g transform="translate({x} {y}) scale({s})" stroke="#f4fffd" stroke-width="2.5" stroke-linecap="round" fill="none" filter="url(#glint)">{arms}</g>'
    b += crystal(300, 200, 1) + crystal(430, 470, .8) + crystal(290, 560, .6) + crystal(560, 200, .9) + crystal(150, 420, .8) + crystal(590, 520, .6) + crystal(420, 170, .5)
    # montants et plateaux en bois
    for x in (226, 482):
        post = f"M{x} 112 L{x+12} 112 L{x+12} 628 L{x} 628Z"
        b += f'<path d="{post}" fill="#000" filter="url(#woodV)"/><path d="{post}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
        for y in (220, 370, 520):
            b += f'<ellipse cx="{x+6}" cy="{y}" rx="12" ry="8" fill="url(#gold)" filter="url(#metal)"/>'
    for (y, h) in ((86, 34), (620, 34)):
        plate = f"M200 {y} L520 {y} L520 {y+h} L200 {y+h}Z"
        b += f'<g filter="url(#dropS)"><path d="{plate}" fill="#000" filter="url(#woodV)"/></g><path d="{plate}" fill="url(#cylH)" style="mix-blend-mode:multiply"/>'
        b += f'<rect x="200" y="{y+h/2-4}" width="320" height="8" fill="url(#gold)" filter="url(#metal)"/>'
    b += gem(360, 103, 11, "Teal", False) + gem(360, 637, 11, "Teal", False)
    b += glint(282, 160, .8) + glint(455, 590, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

# ───────────────────────── VENT DU NORD ─────────────────────────
def vent():
    d, sky = bg_sky("#3ab8d8", "#8ae8e0", "#f0fff8", 720, 0, 2)
    defs = d + clouds(44, "#8ac8d8") + """
    <linearGradient id="wind" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>"""
    b = sky + '<rect width="720" height="720" filter="url(#clouds)" opacity=".9"/>'
    b += '<path d="M0 600 C120 560 260 590 360 570 S600 550 720 580 V720 H0Z" fill="#2a9a8a" opacity=".6" filter="url(#soft)"/>'
    # rubans de vent en spirale
    rib = ""
    for k in range(7):
        r0 = 40 + k*34; pts = []
        for i in range(60):
            t = i/59; a = math.radians(-200 + t*400 + k*25)
            r = r0 + t*120
            pts.append(f"{360 + r*math.cos(a):.0f} {360 + r*.72*math.sin(a):.0f}")
        rib += f'<path d="M{" L".join(pts)}" stroke="url(#wind)" stroke-width="{18-k*2:.0f}" opacity="{1-k*.06:.2f}"/>'
    b += f'<g fill="none" stroke-linecap="round" filter="url(#soft)">{rib}</g>'
    b += f'<g fill="none" stroke-linecap="round" opacity=".9">{rib}</g>'.replace('stroke="url(#wind)"', 'stroke="url(#windC)"')
    defs += '<linearGradient id="windC" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2ab8b0" stop-opacity="0"/><stop offset=".5" stop-color="#e8fffc"/><stop offset="1" stop-color="#2ab8b0" stop-opacity="0"/></linearGradient>'
    b += '<circle cx="360" cy="360" r="70" fill="#ffffff" opacity=".6" filter="url(#blur20)"/>'
    # feuilles et cartes emportées
    for (x, y, s, r, c) in ((170, 220, .8, 40, "#5cc86a"), (540, 180, .7, -30, "#7ad860"), (590, 470, .6, 70, "#e8b040"), (140, 500, .7, -50, "#5cc86a"), (450, 600, .5, 20, "#7ad860"), (300, 130, .5, 80, "#e8b040")):
        b += leaf(x, y, s, r, c)
    b += mini_card(250, 380, 96, -28) + mini_card(470, 300, 110, 22, True) + mini_card(400, 470, 84, 64)
    b += glint(470, 230, .7) + glint(200, 300, .5) + glint(560, 400, .5)
    b += power_frame()
    return svg(720, 720, defs, b)

CARDS = {"card-back": card_back, "cauris_chanceux": cauris, "feu_camp": feu,
         "tambour_appel": tambour, "benediction_chef": benediction, "pluie_etoiles": pluie, "totem_ancetres": totem,
         "bouclier_village": bouclier, "eclair_mfoundi": eclair, "filet_pecheur": filet, "main_griot": griot, "sable_temps": sable, "vent_nord": vent}

if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or list(CARDS)
    for n in names:
        open(f"{n}.svg", "w").write(CARDS[n]())
    print("ok", " ".join(names))
