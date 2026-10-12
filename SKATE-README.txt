SKATE 3 FAN GAME — HAR FRONTEND STARTER

This archive contains only the public frontend files captured in the supplied HAR.
It is NOT a complete playable game.

Missing important dependencies:
- /pkg/skate3rust.js (Rust wasm JS loader)
- /pkg/skate3rust_bg.wasm (likely engine binary; verify exact path)
- external skate3-game-data.zip and skate3-audio.zip (not included in HAR)
- potential server-side multiplayer relay

The game frontend config points to https://gamedata.xposed.wtf/skate3-game-data.zip.
Do not redistribute proprietary game data without authorization.

In GitHub Codespaces, upload and unzip this archive in your website root:
  unzip skate-codespaces-starter.zip
  python3 -m http.server 8000
Then open /skate/. It may show an engine-loading error until missing files are supplied.

Home page box (adapt thumbnail to a file you own):
<a class="game" href="skate/">
  <span class="game-name">Skate 3 Fan Game</span>
</a>
