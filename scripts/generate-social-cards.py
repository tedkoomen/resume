"""Regenerate the committed 1200x630 social cards: python3 -m pip install Pillow.
Run from any directory with python3 scripts/generate-social-cards.py.
Font sources: google/fonts ofl/ibmplexmono and ofl/newsreader (SIL OFL, included).
Newsreader is a static instance at optical size 48, weight 500.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG, FG, MUTED, LINE, ACCENT, RED = '#242720', '#e6e6da', '#aeb0a0', '#4b5142', '#b1bc91', '#c99380'
SCALE = 2

def card(filename, title, subtitle, issue, art):
    im = Image.new('RGB', (1200*SCALE, 630*SCALE), BG)
    d = ImageDraw.Draw(im)
    def text(x,y,value,size=22,color=FG,medium=False):
        font=ImageFont.truetype(str(ROOT/'static/fonts'/('Newsreader-Medium.ttf' if medium else 'IBMPlexMono-Regular.ttf')),size*SCALE)
        d.text((x*SCALE,y*SCALE),value,font=font,fill=color)
    def line(x,y,x2,y2,color=LINE,width=1):
        d.line((x*SCALE,y*SCALE,x2*SCALE,y2*SCALE),fill=color,width=width*SCALE)
    def box(x,y,x2,y2,fill=None,outline=LINE):
        d.rectangle((x*SCALE,y*SCALE,x2*SCALE,y2*SCALE),fill=fill,outline=outline,width=SCALE)
    text(64,58,'Critical Section',32,FG,True)
    text(986,58,issue,19,ACCENT)
    line(64,108,1136,108)
    title_lines=title.split('\n')
    y=200 if len(title_lines)<4 else 168
    for row in title_lines:
        text(64,y,row,59,FG,True);y+=62
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
    elif art == 'mutex':
        text(770,165,'THREAD A',19,ACCENT)
        text(1000,165,'THREAD B',19,RED)
        line(814,206,814,266,ACCENT,3)
        line(1050,206,1050,240,RED,3)
        line(1035,240,1065,240,RED,3)
        text(1000,251,'waiting',17,RED)
        box(770,295,1136,428,outline=ACCENT)
        text(790,311,'MUTEX OWNED BY A',18,ACCENT)
        text(790,353,'++counter',35,FG)
        line(814,266,814,295,ACCENT,3)
        line(807,286,814,295,ACCENT,2)
        line(821,286,814,295,ACCENT,2)
        text(770,455,'B enters after A unlocks',17,MUTED)
    elif art == 'queues':
        text(770,165,'SPSC FAN-IN',19,ACCENT)
        for i in range(3):
            text(770,210+i*48,chr(65+i),18)
            for j in range(4): box(815+j*38,209+i*48,844+j*38,236+i*48,ACCENT if j<i+1 else None)
        text(770,390,'SHARED MPSC',19,ACCENT)
        for j in range(12): box(770+j*30,435,794+j*30,468,ACCENT if j<6 else None)
    elif art == 'cache':
        text(770,165,'ONE LINE / TWO WRITERS',18,ACCENT)
        box(770,210,1136,275)
        text(790,227,'head     tail',23)
        text(770,330,'SEPARATE LINES',18,ACCENT)
        box(770,370,940,435);box(966,370,1136,435)
        text(790,386,'head',23);text(987,386,'tail',23)
        text(770,465,'PAUSE ≠ scheduler yield',16,MUTED)
    elif art == 'scheduler':
        text(770,165,'ONE LOGICAL CPU',19,ACCENT)
        for i,(label,color) in enumerate([('A owns lock',ACCENT),('B spins / A waits',RED),('A resumes + unlocks',ACCENT)]):
            box(770,215+i*75,1136,270+i*75,outline=color)
            text(790,230+i*75,label,18,color)
    elif art == 'benchmark':
        text(770,165,'4 PRODUCERS / 32 SLOTS',18,ACCENT)
        text(770,220,'SPSC',20);box(770,260,1110,284,ACCENT,ACCENT)
        text(770,318,'MPSC + BACKOFF',20);box(770,358,988,382,ACCENT,ACCENT)
        text(770,424,'14.731 vs 9.435 M msg/s',17)
        text(770,461,'VM medians / 30 rounds',16,MUTED)
    elif art == 'zig':
        box(770,155,1136,457)
        text(790,175,'ZAILS / PIPELINE',19,ACCENT)
        for i,name in enumerate(['ingest','parse','dispatch','publish']):
            yy=230+i*49
            text(790,yy,f'0{i+1}',19,ACCENT)
            text(850,yy,name,22)
            if i<3:line(790,yy+39,1116,yy+39)
    else:
        text(850,210,'§',130,ACCENT,True)
        text(790,370,'ENGINEERING NOTES',20,MUTED)
    line(64,520,1136,520)
    text(64,550,'TED KOOMEN',20,MUTED)
    text(895,550,'tedkoomen.com',22,ACCENT)
    path=ROOT/filename;path.parent.mkdir(parents=True,exist_ok=True)
    im.resize((1200,630),Image.Resampling.LANCZOS).save(path,optimize=True)
    print(path.relative_to(ROOT))

card('src/images/social-ai-illusion-v2.png','AI and the\nIllusion of\nOptimization','When an optimization breaks the counter.','002 / AI','counter')
card('src/images/social-wrong-thing-v2.png','Optimizing the\nWrong Thing,\nFaster','Finding where the time actually goes.','003 / AI','latency')
card('src/images/social-zig-framework-v2.png',"Why I'm Building\na Server Framework\nin Zig",'From incoming bytes to published events.','001 / ZIG','zig')
card('static/social/site.png','Critical\nSection','Notes on software, systems, and tradeoffs.','JOURNAL','site')

card('src/images/social-threads-mutexes-atomics.png','Threads, Mutexes,\nand Atomics','Start with what can go wrong.','004 / C++','mutex')
card('src/images/social-queue-topology.png','Queues: Who Owns\nthe Next Slot?','Topology, ownership, and capacity.','005 / C++','queues')
card('src/images/social-cache-pause.png','Cache Lines, Padding,\nand the Cost of\nTrying Again','Measure the layout and retry policy.','006 / C++','cache')
card('src/images/social-spin-scheduler.png','A Spinlock Cannot\nSchedule Its Owner','Waiting for a thread to run.','007 / C++','scheduler')
card('src/images/social-queue-benchmarks.png','Benchmarking\nQueues Fairly','The data, the harness, and the limits.','008 / C++','benchmark')
