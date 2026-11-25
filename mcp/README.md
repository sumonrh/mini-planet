# Little Planet playtest MCP server

`little-planet-mcp.mjs` is a dependency-free MCP (stdio) server that opens the
game in Chrome through the installed `browse` relay and exposes the game's
`window.__lp` debug surface as tools.

## Add it to OpenCode

Add this to `~/.config/opencode/opencode.json` (or a project `opencode.json`),
then restart OpenCode so its MCP servers reload:

```json
{
  "mcp": {
    "servers": {
      "little-planet": {
        "type": "local",
        "command": ["node", "C:/Users/sumon/Documents/App Development/Mini Planet/mcp/little-planet-mcp.mjs"],
        "cwd": "C:/Users/sumon/Documents/App Development/Mini Planet",
        "enabled": true
      }
    }
  }
}
```

`browse` must already be paired with Chrome. The server uses the local Vite
preview at `http://127.0.0.1:4173/` and starts it if it is not running. The
game tab is kept focused while the server uses it, so the game keeps running.
`game_start` uses an empty slot only and never overwrites a save.

## Tools

| Tool | Purpose |
| --- | --- |
| `game_open` | Start the preview and open the game in a Chrome tab. |
| `game_start` | Click through the title screen into an **empty** slot. It refuses to overwrite an existing life. |
| `game_state` | Read day, level, biome, health, techs, artifacts, wildlife and sea life. |
| `game_eval` | Run JavaScript in the page main world (`window.__lp` is available). |
| `game_teleport` | Move the explorer to a latitude/longitude. |
| `game_press` | Send a key press to the game. |
| `game_screenshot` | Save a PNG of the tab. |
| `game_artifact_hints` | List the ten relics, guardians/tasks and claim state. |
| `game_close` | Close the tab opened by the server. |

## Example playtest loop

```text
game_open
game_start
game_state
game_teleport { "lat": -34, "lon": 36 }
game_artifact_hints
game_eval { "expression": "window.__lp.ambient.list.filter(e => e.hunt && e.hunt.apex).map(e => ({ name: e.hunt.name, dead: e.dead }))" }
```

The server is intentionally small: `browse` does the browser work, and the
game's debug API does the gameplay inspection. It is a development tool, not
part of the published `dist` bundle.
