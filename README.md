# LumiRoam · The Lantern Isles

A small, living pixel world inside Lumiverse. Begin in Hearthwick, wander through Whisperpine and Willowmere, visit the fallen stars, and bring six lost lantern wisps to the sleeping lighthouse.

The entire world is drawn in Canvas: layered pixel scenery, moving water, glowing lanterns, roaming villagers, drifting fireflies, and atmospheric weather. There are no external assets, model calls, or accounts to configure.

## Explore

- Move with **WASD**, **arrow keys**, or click/tap to walk. Touch controls work on small screens.
- Press **E** or **Space** near villagers and landmarks to interact.
- Collect six wisps and return to the lighthouse to restore its beacon.
- Open the **map** with **M** and your **journal** with **J**.
- Change the daylight and weather, or enable the optional ambient soundscape.
- Use **Return to chat** to close the world. Your journey saves automatically.

The world is deterministic, with five places to discover across an interconnected island. Save data includes your position, discoveries, wisps, journal, lighthouse, weather, daylight, and sound choice.

## Run the browser preview

Open **LumiRoam.html** directly in a browser for a complete offline preview. The built file includes the entire game and its artwork. Your browser saves progress locally. For a local preview server:

With [Bun](https://bun.sh) installed:

```sh
bun install
bun run build
bun run preview
```

Open the local URL printed by the preview server. The standalone preview uses browser storage; the installed extension uses Lumiverse’s isolated storage for the signed-in user. Preview saves and Lumiverse saves are separate.

## Install in Lumiverse

Requires Lumiverse **1.2.4** or later.

1. As the Lumiverse owner, open **Extensions**.
2. Paste `https://github.com/Archkr/Lumiverse-LumiRoam` into **Install from Source** and install it.
3. Enable **LumiRoam · The Lantern Isles** and grant **UI panels**.
4. Open the **LumiRoam** sidebar tab and select **Enter the Lantern Isles**.

The repository includes prepared bundles. Lumiverse installs the published development dependencies before loading those bundles; no manual build is needed.

### Local installation

The prepared extension bundle in `release/LumiRoam-1.0.1-extension.zip` contains `spindle.json` and `dist/`; use **Import Local** to install it. Extract it into the backend's data directory and follow steps 3–4 below. To prepare the installation from source, follow all four steps.

1. Run `bun run build` in this repository.
2. In the **backend’s data directory**, create `extensions/lumi_roam/repo/`. Copy **spindle.json** and the complete **dist/** directory into it. The prepared bundles need no package installation.
3. As the Lumiverse owner, open **Extensions → Import Local**. Enable **LumiRoam · The Lantern Isles** and grant **UI panels**.
4. Open the **LumiRoam** sidebar tab and select **Enter the Lantern Isles**. A **Lantern Isles** shortcut is also available in the chat input actions.

The expected local layout is:

```text
<Lumiverse data directory>/extensions/lumi_roam/repo/
├── spindle.json
└── dist/
    ├── backend.js
    └── frontend.js
```

Keep any other build outputs inside `dist/` when copying it. To update a local installation, replace its prepared bundles and reload the extension from the Extensions panel.

## Optional chat atmosphere

**Share scene atmosphere** starts off. Enable it in the LumiRoam sidebar to share your current location, weather, daylight, and lighthouse progress with the next chat generation. This requires the **interceptor** permission; Lumiverse offers its normal permission prompt if needed.

The injected context appears in **Prompt Breakdown** as **LumiRoam scene · The Lantern Isles**. It provides atmosphere while respecting the current story and skips quiet background generations. The world never appends chat messages, runs background generations, or spends model tokens on gameplay. Turn scene sharing off whenever you want.

Progress and scene-sharing settings are stored per user. Replies are routed to the originating frontend session, and a generation uses its authoritative user and frontend-session identity. Save recovery clamps invalid positions, rejects unknown quest IDs, and bounds journal data. Backend connection and storage failures are shown in the sidebar and in an open world.

## Development

```sh
bun run typecheck
bun test
bun run build
```

`src/app.ts` contains the interaction and interface, `src/world.ts` builds the island and navigation, and `src/renderer.ts` draws its pixel scenery. `src/frontend.ts` mounts the native Lumiverse surface, and `src/backend.ts` handles per-user saves and optional prompt context. Persistence validation is covered by malformed-save and round-trip tests.
