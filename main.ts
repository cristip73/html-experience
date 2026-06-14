import { FileView, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

const VIEW_TYPE_HTML_EXPERIENCE = "html-experience-view";

interface HTMLExperienceSettings {
	enableScripts: boolean;
	sandboxPermissions: string;
	backgroundColor: string;
	backgroundColorEnabled: boolean;
	showNavbar: boolean;
	showThemeButton: boolean;
	disableTheme: boolean;
	mhtmlSupport: boolean;
}

const DEFAULT_SETTINGS: HTMLExperienceSettings = {
	enableScripts: true,
	sandboxPermissions: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals",
	backgroundColor: "#ffffff",
	backgroundColorEnabled: false,
	showNavbar: true,
	showThemeButton: true,
	disableTheme: false,
	mhtmlSupport: false,
};

class HTMLExperienceView extends FileView {
	plugin: HTMLExperiencePlugin;
	iframe: HTMLIFrameElement | null = null;
	mainView: HTMLDivElement | null = null;
	searchBar: HTMLDivElement | null = null;
	searchInput: HTMLInputElement | null = null;
	matchCountEl: HTMLSpanElement | null = null;
	currentMatch: number = 0;
	totalMatches: number = 0;
	zoomLevel: number = 1;
	forceDark: boolean = false;
	_messageHandler: ((evt: MessageEvent) => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: HTMLExperiencePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_HTML_EXPERIENCE;
	}

	getIcon(): string {
		return "code-glyph";
	}

	canAcceptExtension(extension: string): boolean {
		return ["html", "htm", "mht", "mhtml"].includes(extension);
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.contentEl.empty();

		try {
			const contents = await this.app.vault.readBinary(file);
			const decoder = new TextDecoder();
			let htmlStr = decoder.decode(contents);

			if (file.extension === "mht" || file.extension === "mhtml") {
				htmlStr = this.parseMhtml(htmlStr);
			}

		this.mainView = this.contentEl.createDiv();
		this.mainView.setAttribute("style", "display: flex; flex-direction: column; height: 100%; padding: 0; overflow: hidden; position: relative;");

		const toolbar = this.contentEl.createDiv({ cls: "html-experience-toolbar" });
		toolbar.setAttribute("style", "display: " + (this.plugin.settings.showNavbar ? "flex" : "none") + "; gap: 4px; padding: 4px; align-items: center; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);");

		toolbar.createEl("button", { text: "+" }).addEventListener("click", () => this.zoomIn());
		toolbar.createEl("button", { text: "-" }).addEventListener("click", () => this.zoomOut());
		toolbar.createEl("button", { text: "Reset" }).addEventListener("click", () => this.resetZoom());
		toolbar.createEl("button", { text: "\u26F6" }).addEventListener("click", () => this.toggleFullscreen());

		const searchBar = this.contentEl.createDiv({ cls: "html-experience-search-bar" });
		searchBar.setAttribute("style", "display: none; gap: 4px; padding: 4px; align-items: center; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);");
		const searchInput = searchBar.createEl("input", {
			attr: { type: "text", placeholder: "Search..." },
		});
		searchInput.setAttribute("style", "padding: 2px 6px; width: 200px;");
		const matchCount = searchBar.createEl("span", { text: "" });
		matchCount.setAttribute("style", "font-size: 12px; color: var(--text-muted); min-width: 50px;");
		const prevBtn = searchBar.createEl("button", { text: "\u25B2" });
		prevBtn.addEventListener("click", (e) => { e.stopPropagation(); this.searchPrevious(); searchInput.focus(); });
		const nextBtn = searchBar.createEl("button", { text: "\u25BC" });
		nextBtn.addEventListener("click", (e) => { e.stopPropagation(); this.searchNext(); searchInput.focus(); });
		searchBar.createEl("button", { text: "Clear" }).addEventListener("click", (e) => {
			e.stopPropagation();
			searchInput.value = "";
			this.clearSearch();
			matchCount.textContent = "";
			searchInput.focus();
		});
		const closeBtn = searchBar.createEl("button", { text: "x" });
		closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this.toggleSearchBar(false); });

		searchInput.addEventListener("input", () => {
			if (searchInput.value) {
				this.searchInIframe(searchInput.value);
			} else {
				this.clearSearch();
			}
		});

		searchInput.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Escape") {
				this.toggleSearchBar(false);
			} else if (evt.key === "Enter") {
				evt.preventDefault();
				if (evt.shiftKey) {
					this.searchPrevious();
				} else {
					this.searchNext();
				}
			}
		});

		this.searchBar = searchBar;
		this.searchInput = searchInput;
		this.matchCountEl = matchCount;

		const sandbox = this.plugin.settings.enableScripts
			? this.plugin.settings.sandboxPermissions
			: "allow-same-origin";

		this.iframe = this.mainView.createEl("iframe", {
			cls: "html-experience-iframe",
			attr: { sandbox },
		});

		if (this.plugin.settings.showThemeButton) {
			const isCurrentlyDark = this.forceDark || document.body.classList.contains("theme-dark");
			const themeBtn = this.mainView.createEl("button", { text: isCurrentlyDark ? "\u2600" : "\u263E" });
			const btnBg = isCurrentlyDark ? "#2a2a2a" : "#f0f0f0";
			const btnColor = isCurrentlyDark ? "#f0c040" : "#1a1a1a";
			themeBtn.setAttribute("style", "position: absolute; bottom: 16px; left: 16px; width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--background-modifier-border); background: " + btnBg + "; color: " + btnColor + "; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 50; transition: all 0.2s;");
			themeBtn.addEventListener("click", () => {
				this.forceDark = !this.forceDark;
				themeBtn.textContent = this.forceDark ? "\u2600" : "\u263E";
				themeBtn.style.background = this.forceDark ? "#2a2a2a" : "#f0f0f0";
				themeBtn.style.color = this.forceDark ? "#f0c040" : "#1a1a1a";
				this.toggleThemeStyles(this.forceDark);
			});
		}

		const baseHref = this.app.vault.getResourcePath(file);
		const doc = new DOMParser().parseFromString(htmlStr, "text/html");

		let baseElm = doc.querySelector("base");
		if (!baseElm) {
			baseElm = doc.createElement("base");
			doc.head.prepend(baseElm);
		}
		baseElm.setAttribute("href", baseHref);

		if (this.plugin.settings.backgroundColorEnabled) {
			const body = doc.querySelector("body");
			if (body) {
				body.style.backgroundColor = this.plugin.settings.backgroundColor;
			}
		}

		const isDark = this.forceDark || (!this.forceDark && document.body.classList.contains("theme-dark"));
		const hasCustomBg = this.plugin.settings.backgroundColorEnabled;
		const themeDisabled = this.plugin.settings.disableTheme;
		if (!themeDisabled && isDark) {
			const style = doc.createElement("style");
			style.textContent = `
				${hasCustomBg ? "" : "body, html { background-color: #1e1e1e !important; }"}
				*, *::before, *::after { color: #d4d4d4 !important; border-color: #444 !important; background-color: transparent !important; }
				a { color: #4fc1ff !important; }
				h1, h2, h3, h4, h5, h6 { color: #e0e0e0 !important; }
				p, span, li, td, th, div, section, article, main, header, footer, nav, aside, label, caption, dt, dd { color: #d4d4d4 !important; }
				code, pre, kbd, samp { background-color: #2d2d2d !important; color: #d4d4d4 !important; }
				input, textarea, select, button { background-color: #3c3c3c !important; color: #d4d4d4 !important; border-color: #555 !important; }
				table { border-color: #444 !important; }
				th { background-color: #2a2a2a !important; }
				tr:nth-child(even) { background-color: #252525 !important; }
				blockquote { border-left-color: #4fc1ff !important; color: #b0b0b0 !important; background-color: #2a2a2a !important; }
				hr { border-color: #444 !important; }
				svg { fill: #d4d4d4 !important; }
				img { opacity: 0.9; }
				.card, [class*="card"], [class*="step"], [class*="rung"], [class*="item"], [class*="box"], [class*="callout"], [class*="notice"], [class*="alert"], [class*="info"], [class*="tip"] { background-color: #2a2a2a !important; border-color: #444 !important; }
				ol, ul { padding-left: 20px; }
				li { margin-bottom: 4px; }
			`;
			doc.head.appendChild(style);
		} else if (!themeDisabled && this.forceDark === false) {
			const style = doc.createElement("style");
			style.textContent = `
				${hasCustomBg ? "" : "body, html { background-color: #ffffff !important; }"}
				*, *::before, *::after { color: #1a1a1a !important; background-color: transparent !important; }
				a { color: #0066cc !important; }
				code, pre, kbd, samp { background-color: #f5f5f5 !important; color: #1a1a1a !important; }
				input, textarea, select, button { background-color: #ffffff !important; color: #1a1a1a !important; border-color: #ccc !important; }
				th { background-color: #f0f0f0 !important; }
				blockquote { border-left-color: #0066cc !important; background-color: #f9f9f9 !important; }
				svg { fill: #1a1a1a !important; }
				.card, [class*="card"], [class*="step"], [class*="rung"], [class*="item"], [class*="box"], [class*="callout"], [class*="notice"], [class*="alert"], [class*="info"], [class*="tip"] { background-color: #f5f5f5 !important; border-color: #ddd !important; }
			`;
			doc.head.appendChild(style);
		}

		const zoomScript = doc.createElement("script");
		zoomScript.textContent = `
			document.addEventListener("wheel", function(evt) {
				if (evt.ctrlKey) {
					evt.preventDefault();
					window.parent.postMessage({ type: "html-experience-zoom", deltaY: evt.deltaY }, "*");
				}
			}, { passive: false });
			document.addEventListener("keydown", function(evt) {
				if (evt.ctrlKey && evt.key === "f") {
					evt.preventDefault();
					window.parent.postMessage({ type: "html-experience-toggle-search" }, "*");
				}
			});
			document.addEventListener("click", function(evt) {
				var link = evt.target.closest("a");
				if (link && link.href) {
					var href = link.href;
					if (href.startsWith("http://") || href.startsWith("https://")) {
						evt.preventDefault();
						window.parent.postMessage({ type: "html-experience-open-link", url: href }, "*");
					}
				}
			});
		`;
		doc.body.appendChild(zoomScript);

		this.iframe.srcdoc = doc.documentElement.outerHTML;

		this.iframe.addEventListener("wheel", (evt: WheelEvent) => {
			if (evt.ctrlKey) {
				evt.preventDefault();
				if (evt.deltaY < 0) {
					this.zoomIn();
				} else {
					this.zoomOut();
				}
			}
		}, { passive: false });

		this._messageHandler = (evt: MessageEvent) => {
			if (evt.data?.type === "html-experience-zoom") {
				if (evt.data.deltaY < 0) {
					this.zoomIn();
				} else {
					this.zoomOut();
				}
			} else if (evt.data?.type === "html-experience-toggle-search") {
				this.toggleSearchBar();
			} else if (evt.data?.type === "html-experience-open-link") {
				window.open(evt.data.url, "_blank");
			}
		};
		window.addEventListener("message", this._messageHandler);

		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (evt.ctrlKey && evt.key === "f" && this.searchBar) {
				evt.preventDefault();
				this.toggleSearchBar();
			}
		});
		} catch (error) {
			this.contentEl.empty();
			const errorDiv = this.contentEl.createDiv();
			errorDiv.setAttribute("style", "padding: 20px; color: var(--text-error);");
			errorDiv.createEl("h3", { text: "Failed to load HTML file" });
			errorDiv.createEl("p", { text: error instanceof Error ? error.message : String(error) });
			errorDiv.createEl("p", { text: "Try reloading or check if the file is valid HTML." });
		}
	}

	parseMhtml(mhtml: string): string {
		const boundary = mhtml.match(/boundary=(.+)/i)?.[1]?.trim();
		if (!boundary) return mhtml;

		const parts = mhtml.split("--" + boundary);
		let htmlContent = "";
		const resources: { [key: string]: string } = {};

		for (const part of parts) {
			const headerEnd = part.indexOf("\r\n\r\n");
			if (headerEnd === -1) continue;
			const header = part.substring(0, headerEnd);
			const body = part.substring(headerEnd + 4).trim();

			const contentType = header.match(/Content-Type:\s*(.+)/i)?.[1]?.trim();
			const location = header.match(/Content-Location:\s*(.+)/i)?.[1]?.trim();

			if (contentType?.startsWith("text/html")) {
				htmlContent = body;
			} else if (location && body) {
				const dataUrl = `data:${contentType};base64,${btoa(unescape(encodeURIComponent(body)))}`;
				resources[location] = dataUrl;
			}
		}

		if (htmlContent) {
			for (const [url, dataUrl] of Object.entries(resources)) {
				const encoded = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				htmlContent = htmlContent.replace(new RegExp(encoded, "g"), dataUrl);
			}
		}

		return htmlContent || mhtml;
	}

	zoomIn(): void {
		this.zoomLevel = Math.min(3, this.zoomLevel + 0.1);
		this.applyZoom();
	}

	toggleFullscreen(): void {
		if (!document.fullscreenElement) {
			this.containerEl.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	zoomOut(): void {
		this.zoomLevel = Math.max(0.3, this.zoomLevel - 0.1);
		this.applyZoom();
	}

	resetZoom(): void {
		this.zoomLevel = 1;
		this.applyZoom();
	}

	toggleSearchBar(forceState?: boolean): void {
		if (!this.searchBar) return;
		const visible = forceState ?? this.searchBar.style.display === "none";
		this.searchBar.style.display = visible ? "flex" : "none";
		if (visible && this.searchInput) {
			this.searchInput.focus();
			this.searchInput.select();
		}
		if (!visible) {
			this.clearSearch();
			if (this.matchCountEl) this.matchCountEl.textContent = "";
		}
	}

	private applyZoom(): void {
		if (this.iframe) {
			this.iframe.style.transform = `scale(${this.zoomLevel})`;
			this.iframe.style.transformOrigin = "top left";
			this.iframe.style.width = `${100 / this.zoomLevel}%`;
			this.iframe.style.height = `${100 / this.zoomLevel}%`;
		}
	}

	toggleThemeStyles(dark: boolean): void {
		if (!this.iframe?.contentDocument) return;
		const existing = this.iframe.contentDocument.getElementById("html-experience-theme");
		if (existing) existing.remove();
		const hasCustomBg = this.plugin.settings.backgroundColorEnabled;
		if (dark) {
			const style = this.iframe.contentDocument.createElement("style");
			style.id = "html-experience-theme";
			style.textContent = `
				${hasCustomBg ? "" : "body, html { background-color: #1e1e1e !important; }"}
				*, *::before, *::after { color: #d4d4d4 !important; border-color: #444 !important; background-color: transparent !important; }
				a { color: #4fc1ff !important; }
				h1, h2, h3, h4, h5, h6 { color: #e0e0e0 !important; }
				p, span, li, td, th, div, section, article, main, header, footer, nav, aside, label, caption, dt, dd { color: #d4d4d4 !important; }
				code, pre, kbd, samp { background-color: #2d2d2d !important; color: #d4d4d4 !important; }
				input, textarea, select, button { background-color: #3c3c3c !important; color: #d4d4d4 !important; border-color: #555 !important; }
				table { border-color: #444 !important; }
				th { background-color: #2a2a2a !important; }
				tr:nth-child(even) { background-color: #252525 !important; }
				blockquote { border-left-color: #4fc1ff !important; color: #b0b0b0 !important; background-color: #2a2a2a !important; }
				hr { border-color: #444 !important; }
				svg { fill: #d4d4d4 !important; }
				img { opacity: 0.9; }
				.card, [class*="card"], [class*="step"], [class*="rung"], [class*="item"], [class*="box"], [class*="callout"], [class*="notice"], [class*="alert"], [class*="info"], [class*="tip"] { background-color: #2a2a2a !important; border-color: #444 !important; }
			`;
			this.iframe.contentDocument.head.appendChild(style);
		} else {
			const style = this.iframe.contentDocument.createElement("style");
			style.id = "html-experience-theme";
			style.textContent = `
				${hasCustomBg ? "" : "body, html { background-color: #ffffff !important; }"}
				*, *::before, *::after { color: #1a1a1a !important; background-color: transparent !important; }
				a { color: #0066cc !important; }
				code, pre, kbd, samp { background-color: #f5f5f5 !important; color: #1a1a1a !important; }
				input, textarea, select, button { background-color: #ffffff !important; color: #1a1a1a !important; border-color: #ccc !important; }
				th { background-color: #f0f0f0 !important; }
				blockquote { border-left-color: #0066cc !important; background-color: #f9f9f9 !important; }
				svg { fill: #1a1a1a !important; }
				.card, [class*="card"], [class*="step"], [class*="rung"], [class*="item"], [class*="box"], [class*="callout"], [class*="notice"], [class*="alert"], [class*="info"], [class*="tip"] { background-color: #f5f5f5 !important; border-color: #ddd !important; }
			`;
			this.iframe.contentDocument.head.appendChild(style);
		}
	}

	searchInIframe(query: string): void {
		if (!this.iframe?.contentDocument || !query) return;
		this.clearSearch();
		const body = this.iframe.contentDocument.body;
		const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(${escapedQuery})`, "gi");

		const textNodes: Text[] = [];
		const walker = this.iframe.contentDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			if (node.parentElement?.tagName === "SCRIPT" || node.parentElement?.tagName === "STYLE") continue;
			if (node.textContent && regex.test(node.textContent)) {
				textNodes.push(node);
			}
			regex.lastIndex = 0;
		}

		let count = 0;
		for (const node of textNodes) {
			const text = node.textContent || "";
			const parts = text.split(new RegExp(escapedQuery, "gi"));
			if (parts.length <= 1) continue;

			const parent = node.parentNode;
			if (!parent) continue;

			const fragment = this.iframe.contentDocument.createDocumentFragment();
			const lowerText = text.toLowerCase();
			let searchIndex = 0;

			for (let i = 0; i < parts.length; i++) {
				if (parts[i]) {
					fragment.appendChild(this.iframe.contentDocument.createTextNode(parts[i]));
				}
				if (i < parts.length - 1) {
					const matchText = text.substring(searchIndex + parts[i].length).match(new RegExp(`^${escapedQuery}`, "i"))?.[0] || "";
					searchIndex += parts[i].length + matchText.length;
					const mark = this.iframe.contentDocument.createElement("mark");
					mark.setAttribute("data-match", String(count));
					mark.style.background = "yellow";
					mark.style.color = "black";
					mark.textContent = matchText || query;
					fragment.appendChild(mark);
					count++;
				}
			}
			parent.replaceChild(fragment, node);
		}

		this.totalMatches = count;
		this.currentMatch = count > 0 ? 1 : 0;
		this.updateMatchCount();
		if (count > 0) this.highlightCurrentMatch();
	}

	searchNext(): void {
		if (this.totalMatches === 0) return;
		this.currentMatch = this.currentMatch >= this.totalMatches ? 1 : this.currentMatch + 1;
		this.highlightCurrentMatch();
	}

	searchPrevious(): void {
		if (this.totalMatches === 0) return;
		this.currentMatch = this.currentMatch <= 1 ? this.totalMatches : this.currentMatch - 1;
		this.highlightCurrentMatch();
	}

	highlightCurrentMatch(): void {
		if (!this.iframe?.contentDocument) return;
		const marks = this.iframe.contentDocument.querySelectorAll("mark");
		marks.forEach((mark) => {
			mark.style.background = "yellow";
			mark.style.outline = "none";
		});
		const current = this.iframe.contentDocument.querySelector(`mark[data-match="${this.currentMatch - 1}"]`) as HTMLElement;
		if (current) {
			current.style.background = "#ff6b6b";
			current.style.outline = "2px solid #ff0000";
			current.scrollIntoView({ behavior: "smooth", block: "center" });
		}
		this.updateMatchCount();
	}

	updateMatchCount(): void {
		if (this.matchCountEl) {
			if (this.totalMatches > 0) {
				this.matchCountEl.textContent = `${this.currentMatch}/${this.totalMatches}`;
			} else if (this.searchInput?.value) {
				this.matchCountEl.textContent = "No matches";
			} else {
				this.matchCountEl.textContent = "";
			}
		}
	}

	clearSearch(): void {
		if (!this.iframe?.contentDocument) return;
		const marks = this.iframe.contentDocument.querySelectorAll("mark");
		marks.forEach((mark) => {
			const parent = mark.parentNode;
			if (parent) {
				parent.replaceChild(this.iframe!.contentDocument!.createTextNode(mark.textContent || ""), mark);
				parent.normalize();
			}
		});
	}

	canRenameExtension(extension: string): boolean {
		return false;
	}

	async onUnloadFile(): Promise<void> {
		if (this._messageHandler) {
			window.removeEventListener("message", this._messageHandler);
			this._messageHandler = null;
		}
	}
}

class HTMLExperienceSettingTab extends PluginSettingTab {
	plugin: HTMLExperiencePlugin;

	constructor(app: any, plugin: HTMLExperiencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "HTML Experience Settings" });

		new Setting(containerEl)
			.setName("Enable JavaScript")
			.setDesc("When ON, scripts in HTML files will run. Turn OFF for safer viewing of untrusted files.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableScripts).onChange(async (value) => {
					this.plugin.settings.enableScripts = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Sandbox permissions")
			.setDesc("Advanced: controls what the HTML viewer is allowed to do. Only change if you know what you're doing.")
			.addText((text) =>
				text
					.setPlaceholder("allow-scripts allow-same-origin...")
					.setValue(this.plugin.settings.sandboxPermissions)
					.onChange(async (value) => {
						this.plugin.settings.sandboxPermissions = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Custom background color")
			.setDesc("Override the HTML's own background with a color you pick. This color always applies, even in dark/light mode.")
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.settings.backgroundColor).onChange(async (value) => {
					this.plugin.settings.backgroundColor = value;
					await this.plugin.saveSettings();
				})
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.backgroundColorEnabled).onChange(async (value) => {
					this.plugin.settings.backgroundColorEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show toolbar")
			.setDesc("Show the top bar with zoom in, zoom out, and reset buttons.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showNavbar).onChange(async (value) => {
					this.plugin.settings.showNavbar = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show theme toggle button")
			.setDesc("Show the floating moon/sun button (bottom-left) to switch between dark and light mode.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showThemeButton).onChange(async (value) => {
					this.plugin.settings.showThemeButton = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Use original HTML colors")
			.setDesc("Turn OFF all dark/light mode styling so you see the HTML file exactly as it was designed.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.disableTheme).onChange(async (value) => {
					this.plugin.settings.disableTheme = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("MHTML support")
			.setDesc("Enable opening MHTML (.mht, .mhtml) web archive files.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.mhtmlSupport).onChange(async (value) => {
					this.plugin.settings.mhtmlSupport = value;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl("h3", { text: "Actions" });

		new Setting(containerEl)
			.setName("Reload active view")
			.setDesc("Refresh the currently open HTML file to apply new settings.")
			.addButton((btn) =>
				btn.setButtonText("Reload").onClick(async () => {
					this.plugin.reloadActiveView();
				})
			);
	}
}

export default class HTMLExperiencePlugin extends Plugin {
	settings: HTMLExperienceSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_HTML_EXPERIENCE, (leaf) => new HTMLExperienceView(leaf, this));

		this.registerExtensions(["html", "htm", "mht", "mhtml"], VIEW_TYPE_HTML_EXPERIENCE);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && ["html", "htm"].includes(file.extension)) {
					this.reloadViewsForFile(file);
				}
			})
		);

		this.addCommand({
			id: "reload-html-view",
			name: "Reload active HTML view",
			callback: () => this.reloadActiveView(),
		});

		this.addCommand({
			id: "zoom-in",
			name: "Zoom in",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.zoomIn();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "zoom-out",
			name: "Zoom out",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.zoomOut();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "reset-zoom",
			name: "Reset zoom",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.resetZoom();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "toggle-fullscreen",
			name: "Toggle full screen",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.toggleFullscreen();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "search-html",
			name: "Search in HTML view",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.toggleSearchBar();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "search-next",
			name: "Search next match",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.searchNext();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "search-previous",
			name: "Search previous match",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
				if (view) {
					if (!checking) view.searchPrevious();
					return true;
				}
				return false;
			},
		});

		this.addSettingTab(new HTMLExperienceSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	reloadActiveView(): void {
		const activeView = this.app.workspace.getActiveViewOfType(HTMLExperienceView);
		if (activeView && activeView.file) {
			activeView.onLoadFile(activeView.file);
		}
	}

	reloadViewsForFile(file: TFile): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML_EXPERIENCE);
		for (const leaf of leaves) {
			const view = leaf.view as HTMLExperienceView;
			if (view.file && view.file.path === file.path) {
				view.onLoadFile(file);
			}
		}
	}

	async onunload(): Promise<void> {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_HTML_EXPERIENCE);
	}
}
