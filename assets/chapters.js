// Reiseabschnitte (Zeiten UTC, aus dem GPS-Log abgeleitet)
window.CHAPTERS = {
  list: [
    { n: 'Beagle-Kanal', to: '2020-02-04T04:15:00Z', s: 'Ablegen in Ushuaia, ostwärts durch den Beagle-Kanal.' },
    { n: 'Drake-Passage', to: '2020-02-08T15:53:45Z', s: 'Offene See zwischen Kap Hoorn und den Südshetlandinseln.' },
    { n: 'Deception Island', to: '2020-02-09T19:14:40Z', s: 'Baily Head und Whalers Bay mit der alten Walfangstation Hektor.' },
    { n: 'Gerlache-Straße', to: '2020-02-14T12:11:31Z', s: 'Enterprise Island, Cuverville Island und Paradise Bay.' },
    { n: 'Lemaire-Kanal', to: '2020-02-18T19:17:02Z', s: 'Pléneau Island, Station Vernadsky, Yalour Islands und Port Charcot.' },
    { n: 'Port Lockroy & Melchior', to: '2020-02-22T12:38:46Z', s: 'Arthur Harbour, Port Lockroy und die Melchior Islands.' },
    { n: 'Zurück über die Drake', to: '2020-02-26T21:33:35Z', s: 'Nordwärts zurück über die Drake-Passage.' },
    { n: 'Ankunft', to: '2020-02-28T16:00:00Z', s: 'Harberton im Beagle-Kanal und zurück nach Ushuaia.' }
  ],
  bounds(t0) {
    let from = 0;
    return this.list.map((c) => { const to = (Date.parse(c.to) - t0) / 1000; const b = { from, to }; from = to; return b; });
  }
};
