import urllib.request, os, time

flags_dir = "public/assets/flags"
os.makedirs(flags_dir, exist_ok=True)

flags = [
    ("cm", "https://upload.wikimedia.org/wikipedia/commons/4/4f/Flag_of_Cameroon.svg"),
    ("cf", "https://upload.wikimedia.org/wikipedia/commons/6/6f/Flag_of_the_Central_African_Republic.svg"),
    ("ht", "https://upload.wikimedia.org/wikipedia/commons/5/56/Flag_of_Haiti.svg"),
    ("tg", "https://upload.wikimedia.org/wikipedia/commons/6/68/Flag_of_Togo.svg"),
    ("sn", "https://upload.wikimedia.org/wikipedia/commons/f/fd/Flag_of_Senegal.svg"),
    ("tz", "https://upload.wikimedia.org/wikipedia/commons/3/38/Flag_of_Tanzania.svg"),
    ("ml", "https://upload.wikimedia.org/wikipedia/commons/9/92/Flag_of_Mali.svg"),
]

for code, url in flags:
    dest = f"{flags_dir}/{code}.svg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read()
        open(dest, "wb").write(data)
        print(f"OK {code}.svg  {len(data):>8} bytes")
    except Exception as e:
        print(f"ERR {code}: {e}")
    time.sleep(3)
