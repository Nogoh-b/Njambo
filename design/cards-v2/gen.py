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
  <feDiffuseLighting in="ta" surfaceScale="2.2" diffuseConstant="1" result="d"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>
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

if __name__ == "__main__":
    for name, fn in (("card-back", card_back), ("cauris_chanceux", cauris), ("feu_camp", feu)):
        open(f"{name}.svg", "w").write(fn())
    print("ok")
