# HTML Experience

Open `.html`, `.htm`, `.mht`, and `.mhtml` files directly in Obsidian with full JavaScript support.

## Features

- **JavaScript support** - Scripts run inside sandboxed iframes
- **Dark/Light mode** - Floating toggle button to switch themes
- **Original colors** - Option to disable theme override and see the HTML as designed
- **Custom background** - Set your own background color
- **Zoom controls** - Zoom in/out with buttons, Ctrl+scroll, or commands
- **Search** - Ctrl+F to search, Enter/Shift+Enter to navigate matches
- **File watching** - Auto-reloads when you edit the HTML externally
- **Full screen** - Toggle full screen mode
- **External links** - Links open in your default browser
- **MHTML support** - Open web archive files
- **Error handling** - Shows helpful error messages for invalid files

## Installation

### From Community Plugins (after approval)

1. Open Obsidian → Settings → Community plugins
2. Search "HTML Experience"
3. Install and enable

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from [Releases](https://github.com/yabswannalearn/html-experience/releases)
2. Copy to your vault: `.obsidian/plugins/html-experience/`
3. Restart Obsidian
4. Enable "HTML Experience" in Settings → Community plugins

## Usage

- Click any `.html` or `.htm` file in your vault to open it
- Use the toolbar buttons to zoom in/out/reset
- Press Ctrl+F to search within the HTML
- Click the moon/sun button (bottom-left) to toggle dark/light mode
- Click the expand button for full screen

## Settings

| Setting | Description |
|---------|-------------|
| Enable JavaScript | Allow scripts to run in HTML files |
| Sandbox permissions | Advanced: iframe sandbox permissions |
| Custom background color | Override HTML background with a color |
| Show toolbar | Show/hide the zoom controls toolbar |
| Show theme toggle button | Show/hide the dark/light mode button |
| Use original HTML colors | Disable all theme styling |
| MHTML support | Enable opening .mht/.mhtml files |

## Commands

- Toggle full screen
- Zoom in / Zoom out / Reset zoom
- Search in HTML view
- Search next / Search previous match
- Reload active HTML view

## License

MIT
