# बाघचाल — Bagchal v0.0.3

Traditional Nepali Tiger & Goat board game as a VS Code extension.

## Install

1. Extensions panel (`Ctrl+Shift+X`) → `···` → **Install from VSIX…**
2. Select `bagchal-game-0.0.1.vsix`
3. Reload VS Code

## Launch

`Ctrl+Shift+P` → **Bagchal: Play Tiger & Goat Game**

## Modes

| Mode | How |
|------|-----|
| **vs AI** | You play Goat, computer plays Tiger |
| **2 Players** | Take turns on same screen — one plays Goat, one plays Tiger |

Click **Mode** button to switch. **New Game** to restart.

## Game Rules

- **Board:** 5×5 grid, 25 intersections
- **Tigers:** 4 — start at corners
- **Goats:** 20 — placed one at a time by goat player

**Placement phase:** Goat places one goat per turn. Tiger moves after each placement.

**Movement phase:** Both sides move one piece per turn. Tigers capture goats by jumping over them (like checkers) to an empty space in the same line.

**Tiger wins:** Capture 5 goats
**Goat wins:** Block all 4 tigers (no valid moves left)

## Multiplayer (different machines)

Run the included server for network play:

```bash
npm install
node server.js
```

Both players open `http://YOUR_IP:3000` in browser and pick a role.

For internet play across networks: use `npx ngrok http 3000` and share the ngrok URL.
