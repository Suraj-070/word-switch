"""Build curated word lists + puzzles. Usage: python3 -I build_words.py <words.txt> <outdir>"""
import sys, json, random, itertools
from collections import deque, defaultdict
from wordfreq import zipf_frequency
from better_profanity import profanity

src, lemf, out = sys.argv[1], sys.argv[2], sys.argv[3]
LEM = {w.strip() for w in open(lemf)}
profanity.load_censor_words()
EXTRA_BLOCK = set("""tit tits cum cums fag fags gay gays nig jew jews kkk rape rapes raped sex sexy anal anus
dyke dykes slut sluts whor whore piss pissed turd turds crap damn hell nazi nazis paki coon coons spic spics
wop wops chink gook homo homos dick dicks cock cocks cunt cunts twat bitch bitchy boob boobs butt butts
porn porno pimp pimps rapist nude nudes orgy dildo shit shits fuck fucks fuk wank wanks tard pedo""".split())
END_BLOCK = set("dead kill kills killed died dies hell damn crap gun guns bomb bombs hang drug drugs".split())
def real(w):
    if w in LEM: return True
    for suf, adds in (("s", [""]), ("es", [""]), ("ies", ["y"]), ("ed", ["", "e"]), ("d", [""]), ("er", ["", "e"]), ("r", [""]), ("est", ["", "e"])):
        if w.endswith(suf):
            stem = w[: -len(suf)]
            for a in adds:
                if len(stem + a) >= 2 and (stem + a) in LEM: return True
            if len(stem) >= 3 and stem[-1] == stem[-2] and stem[:-1] in LEM: return True
    return False
# Soft-block grim words from endpoints only (still valid moves), keep list small
def ok(w): return w.isalpha() and w.isascii() and not profanity.contains_profanity(w) and w not in EXTRA_BLOCK

base = {w.strip() for w in open(src) if 3 <= len(w.strip()) <= 5}
valid, common = {}, {}
for L in (3, 4, 5):
    cand = [w for w in base if len(w) == L and ok(w) and real(w)]
    zs = {w: zipf_frequency(w, "en") for w in cand}
    valid[L] = sorted(w for w in cand if zs[w] >= {3: 2.5, 4: 2.5, 5: 2.6}[L])
    vs = set(valid[L])
    def plural(w): return w.endswith("s") and (w[:-1] in vs or w[:-2] in vs)
    common[L] = {w for w in valid[L] if w in LEM and w not in END_BLOCK and zs[w] >= {3: 4.2, 4: 4.2, 5: 4.1}[L] and not plural(w)}
    print(L, "valid", len(valid[L]), "common", len(common[L]))

def graph(words):
    buckets = defaultdict(list)
    for w in words:
        for i in range(len(w)):
            buckets[(i, w[:i] + "_" + w[i+1:])].append(w)
    adj = defaultdict(list)
    for b in buckets.values():
        for a in b:
            for c in b:
                if a != c: adj[a].append(c)
    return adj

rng = random.Random(7)
puzzles = []
for L in (3, 4, 5):
    adj = graph(valid[L])
    # drop isolated words from valid? keep (harmless). Build puzzles from common words in the big component.
    comm = sorted(common[L])
    found = defaultdict(list)  # par -> [(s,e)]
    for s in comm:
        dist = {s: 0}; dq = deque([s])
        while dq:
            u = dq.popleft()
            if dist[u] >= 8: continue
            for v in adj[u]:
                if v not in dist:
                    dist[v] = dist[u] + 1; dq.append(v)
        for e, d in dist.items():
            if e in common[L] and s < e and 3 <= d <= 8 and not (set(s) == set(e)):
                # no shared letter in same position keeps puzzles meaningful
                if all(a != b for a, b in zip(s, e)):
                    found[d].append((s, e))
    for d, lst in sorted(found.items()):
        rng.shuffle(lst)
        keep = lst[:{3: 160, 4: 220, 5: 180, 6: 120, 7: 80, 8: 40}[d]]
        for s, e in keep:
            if rng.random() < .5: s, e = e, s
            puzzles.append([s, e, d])
        print(L, "par", d, "avail", len(lst), "kept", len(keep))

json.dump({str(L): ",".join(valid[L]) for L in valid}, open(f"{out}/words.json", "w"), separators=(",", ":"))
json.dump(puzzles, open(f"{out}/puzzles.json", "w"), separators=(",", ":"))
print("puzzles", len(puzzles))
