# Sarah W. Vorwerk · Antarktis 2020

Interaktive Logbuch-Karte der Reise der **Sarah W. Vorwerk** von Ushuaia zur Antarktischen Halbinsel und zurück (3.–28. Februar 2020, ca. 1 680 sm).

**Live:** https://dacat84.github.io/antarktis-karte/ (Reportage) · [/logbuch/](https://dacat84.github.io/antarktis-karte/logbuch/) · [/instrumente/](https://dacat84.github.io/antarktis-karte/instrumente/)  
Oben in der Mitte (oder mit der Taste D) zwischen den drei Designs wechseln.

## Was die Karte zeigt
- Den kompletten GPS-Track (61 480 Punkte aus dem Bordlog) mit Replay: Schieberegler, Play-Taste, Leertaste, Pfeiltasten.
- Fahrt über Grund, Kurs, gesegelte und verbleibende Seemeilen, Reisetag.
- **Wetter an der Position**: historische ERA5-Reanalyse von [Open-Meteo](https://open-meteo.com/) für genau diesen Ort und diese Stunde (Temperatur, gefühlt, Wind, Böen, Luftdruck mit Tendenz).
- 15 Ankerplätze/Häfen, aus den Liegezeiten im Log abgeleitet (Deception Island, Enterprise Island, Cuverville, Paradise Bay, Vernadsky, Port Lockroy, Melchior …).
- Fotos von der Reise (Fotos mit Personen bewusst weggelassen, ohne Kameradaten), anhand der Aufnahmezeit auf dem Track verortet.
- Teilbare Links: die URL merkt sich den Zeitpunkt (`#t=2020-02-12T15:30`, Ortszeit UTC−3).

## Dateien
| Pfad | Inhalt |
|---|---|
| `index.html` | Design „Reportage“ (Standard) |
| `logbuch/`, `instrumente/` | Designs „Logbuch“ und „Instrumente“ |
| `assets/core.js` | gemeinsamer Kern: Track, Replay, Wetter, Fotos |
| `assets/chapters.js` | Reiseabschnitte (Kapitel) |
| `raw/*.plt` | Original-Tracklogs (OziExplorer) |
| `scripts/build_track.py` | erzeugt `data/track.json` aus `raw/` |
| `data/stations.json` | Ankerplätze mit Ankunft/Abfahrt (UTC) |

Track neu bauen: `python3 scripts/build_track.py`

Karte: Esri Ocean Basemap (GEBCO, NOAA u. a.).
