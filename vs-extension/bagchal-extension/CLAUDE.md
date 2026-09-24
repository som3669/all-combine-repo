# Bagchal (Tiger & Goat)

VS Code extension for the traditional Nepali board game बाघचाल: 5x5 board, 4 tigers, 20 goats; play vs AI (you are Goat) or 2 players on one screen. Optional WebSocket server for play across machines.

- Id `somshrestha.bagchal-game`, MIT. Version 0.0.3 (vsix 0.0.1-0.0.3 in folder).
- No own repo: lives in the parent repo `som-personal` (remote `som3669/vs-code-extenstion-setup`), commit `feat: initial project setup` (2026-07-10). `package.json` `repository` points to `github.com/som3669/bagchal`, which is not this folder's remote.

## Stack / key files
- Plain JavaScript, no build step.
- `extension.js` registers `bagchal.play` and renders the game in a webview (inline HTML/SVG, CSP `default-src 'none'`, inline script/style only).
- `server.js` Node HTTP + `ws` WebSocket server (`PORT` env, default 3000) with its own copy of the game logic; serves `client.html` (browser client, uses `wss` on https).
- `create-icon.js` generates the 128x128 `icon.png` with zlib (no image libs).
- `.gitignore` ignores `.railway/`, suggesting the server was deployed to Railway (not confirmed).

## Commands
```
npm run package      # vsce package --no-dependencies  (vsce NOT in local node_modules: use npx @vscode/vsce@2.32.0 package --no-dependencies)
code --install-extension bagchal-game-<ver>.vsix --force   # then reload window
npm install && node server.js   # network play server
```

## Gotchas / open items
- `ws` is installed in `node_modules` but not declared in `package.json` dependencies; a fresh `npm install` will not fetch it for `server.js`.
- README install step still names `bagchal-game-0.0.1.vsix` while the title says v0.0.3.
- Game logic is duplicated between `extension.js` and `server.js`; change both.
