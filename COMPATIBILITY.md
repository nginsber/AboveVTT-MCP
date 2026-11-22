# AboveVTT MCP compatibility

The setups AboveVTT MCP has been tested on. It may work on others, but they haven't been tried. AboveVTT changes often, and a future AboveVTT update can break some tools until the connector is updated. The `status` tool reports the AboveVTT version it finds, and warns about versions not listed here.

## Tested setups

| | Windows (maintainer) | macOS (tester) |
|---|---|---|
| **Operating system** | Windows 11 26H2, build 26300.9974 | macOS 27.2.1, Apple silicon |
| **Google Chrome** | 158.0.8127.36 | 157.0.8103.79 |
| **Claude desktop** | 6.28899.6 | 6.28899.6 |
| **Claude Code** | not tested | 2.1.330 |
| **Node.js** | 24.21.0 | 26.13.1 LTS |
| **AboveVTT** | 1.61 | 1.61; a second Mac on 1.62 (only `status` and `list_scenes` tried) |
| **AboveVTT MCP** | server 0.23.0, extension 0.25.0 | built from source with `npm ci`; identical to `server/dist/abovevtt-mcp.mjs` |
| **Install guide** | [INSTALL.md → Windows](INSTALL.md#windows) | [INSTALL.md → macOS](INSTALL.md#macos) |

## What was tried

| Area | Windows | macOS |
|---|---|---|
| Scenes and scene folders (create, rename, move, delete, configure) | ✓ | |
| Notes and journal chapters (create, rename, append, share with one player, find and replace, replace-all) | ✓ | ✓ create, rename, append, share with one player, replace a 20 KB HTML note with its formatting intact |
| My Tokens, creatures and tokens on the map | ✓ | |
| Music (tracks and playlists) | ✓ | |
| Fog of war | ✓ | |
| Grid detection | ✓ | |
| Backups (export, previewed import) | ✓ | |
| Settings and Settings buttons | ✓ | |
| One active DM tab across two PCs, Use here and switching from chat | ✓ (two Windows PCs) | |
| Claude desktop and Claude Code both seeing the tools | Claude desktop | ✓ both |

## Reporting a setup

If you try AboveVTT MCP on another setup, please open an issue with the operating system, Chrome, Claude app (or other MCP client) and AboveVTT versions, plus what worked and what didn't. The `status` tool shows the AboveVTT and connector versions.
