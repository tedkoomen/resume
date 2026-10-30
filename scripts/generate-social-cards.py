"""Regenerate the committed 1200x630 social cards: python3 -m pip install Pillow.
Run from any directory with python3 scripts/generate-social-cards.py.
Font source: google/fonts ofl/ibmplexmono (SIL OFL, included with the fonts).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG, FG, MUTED, LINE, ACCENT, RED = '#171817', '#e7e5dc', '#acada3', '#41443b', '#d8b878', '#efaa9c'
SCALE = 2

def card(filename, title, subtitle, issue, art):
    im = Image.new('RGB', (1200*SCALE, 630*SCALE), BG)
    d = ImageDraw.Draw(im)
    def text(x,y,value,size=22,color=FG,medium=False):
        font=ImageFont.truetype(str(ROOT/'static/fonts'/('IBMPlexMono-Medium.ttf' if medium else 'IBMPlexMono-Regular.ttf')),size*SCALE)
        d.text((x*SCALE,y*SCALE),value,font=font,fill=color)
    def line(x,y,x2,y2,color=LINE,width=1):
        d.line((x*SCALE,y*SCALE,x2*SCALE,y2*SCALE),fill=color,width=width*SCALE)
    def box(x,y,x2,y2,fill=None,outline=LINE):
        d.rectangle((x*SCALE,y*SCALE,x2*SCALE,y2*SCALE),fill=fill,outline=outline,width=SCALE)
    box(28,28,1172,602)
    text(64,58,'SCREAMING INTO THE VOID',19,MUTED)
    text(986,58,issue,19,ACCENT)
    line(64,108,1136,108)
    title_lines=title.split('\n')
    y=200 if len(title_lines)<4 else 168
    for row in title_lines:
        text(64,y,row,46,FG,True);y+=62
    text(64,y+22,subtitle,19,MUTED)
    if art == 'counter':
        box(770,185,1136,438)
        text(790,204,'LOST UPDATE',19,ACCENT)
        for x,client in [(790,'A'),(960,'B')]:
            text(x,259,f'{client}: read 0',18)
            text(x,302,f'{client}: write 1',18)
        line(790,350,1116,350)
        text(790,375,'expected 2 / actual 1',18,RED)
    elif art == 'latency':
        box(770,185,1136,438)
        text(790,204,'UPSTREAM BOTTLENECK',18,ACCENT)
        text(790,253,'public internet',19)
        box(790,287,1114,307,ACCENT,ACCENT)
        text(790,334,'local compute',19)
        box(790,370,796,390,FG,FG)
        text(790,464,'schematic / not to scale',15,MUTED)
    elif art == 'zig':
        box(770,155,1136,457)
        text(790,175,'ZAILS / PIPELINE',19,ACCENT)
        for i,name in enumerate(['ingest','parse','dispatch','publish']):
            yy=230+i*49
            text(790,yy,f'0{i+1}',19,ACCENT)
            text(850,yy,name,22)
            if i<3:line(790,yy+39,1116,yy+39)
    else:
        text(840,220,'>_',100,ACCENT,True)
        text(790,370,'ENGINEERING NOTES',20,MUTED)
    line(64,520,1136,520)
    text(64,550,'TED KOOMEN',20,MUTED)
    text(895,550,'tedkoomen.com',22,ACCENT)
    path=ROOT/filename;path.parent.mkdir(parents=True,exist_ok=True)
    im.resize((1200,630),Image.Resampling.LANCZOS).save(path,optimize=True)
    print(path.relative_to(ROOT))

card('src/images/social-ai-illusion.png','AI and the\nIllusion of\nOptimization','Confidence is not correctness.','002 / AI','counter')
card('src/images/social-wrong-thing.png','Optimizing the\nWrong Thing,\nFaster','Faster code. The same bottleneck.','003 / AI','latency')
card('src/images/social-zig-framework.png',"Why I'm Building\na Server Framework\nin Zig",'Comptime. Event loops. Explicit memory.','001 / ZIG','zig')
card('static/social/site.png','Screaming\ninto the void','Software, systems, and the cost of getting it wrong.','~/ NOTES','site')
