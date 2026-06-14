import { FileView, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

const VIEW_TYPE_HTML_EXPERIENCE = "html-experience-view";

interface HTMLExperienceSettings {
	enableScripts: boolean;
	sandboxPermissions: string;
	backgroundColor: string;
	backgroundColorEnabled: boolean;
}

const DEFAULT_SETTINGS: HTMLExperienceSettings = {
	enableScripts: true,
	sandboxPermissions: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals",
	backgroundColor: "#ffffff",
	backgroundColorEnabled: false,
};

class HTMLExperienceView extends FileView {
	plugin: HTMLExperiencePlugin;
	iframe: HTMLIFrameElement | null = null;
	mainView: HTMLDivElement | null = null;
	searchBar: HTMLDivElement | null = null;
	searchInput: HTMLInputElement | null = null;
	zoomLevel: number = 1;
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
		return ["html", "htm"].includes(extension);
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.contentEl.empty();

		const contents = await this.app.vault.readBinary(file);
		const decoder = new TextDecoder();
		const htmlStr = decoder.decode(contents);

		this.mainView = this.contentEl.createDiv();
		this.mainView.setAttribute("style", "display: flex; flex-direction: column; height: 100%; padding: 0; overflow: hidden;");

		const toolbar = this.contentEl.createDiv({ cls: "html-experience-toolbar" });
		toolbar.setAttribute("style", "display: flex; gap: 4px; padding: 4px; align-items: center; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);");

		toolbar.createEl("button", { text: "+" }).addEventListener("click", () => this.zoomIn());
		toolbar.createEl("button", { text: "-" }).addEventListener("click", () => this.zoomOut());
		toolbar.createEl("button", { text: "Reset" }).addEventListener("click", () => this.resetZoom());

		const searchBar = this.contentEl.createDiv({ cls: "html-experience-search-bar" });
		searchBar.setAttribute("style", "display: none; gap: 4px; padding: 4px; align-items: center; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);");
		const searchInput = searchBar.createEl("input", {
			attr: { type: "text", placeholder: "Search..." },
		});
		searchInput.setAttribute("style", "padding: 2px 6px; width: 200px;");
		searchBar.createEl("button", { text: "Find" }).addEventListener("click", () => this.searchInIframe(searchInput.value));
		searchBar.createEl("button", { text: "Clear" }).addEventListener("click", () => {
			searchInput.value = "";
			this.clearSearch();
		});
		searchBar.createEl("button", { text: "x" }).addEventListener("click", () => this.toggleSearchBar(false));

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
			}
		});

		this.searchBar = searchBar;
		this.searchInput = searchInput;

		const sandbox = this.plugin.settings.enableScripts
			? this.plugin.settings.sandboxPermissions
			: "allow-same-origin";

		this.iframe = this.mainView.createEl("iframe", {
			cls: "html-experience-iframe",
			attr: { sandbox },
		});

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
	}

	zoomIn(): void {
		this.zoomLevel = Math.min(3, this.zoomLevel + 0.1);
		this.applyZoom();
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

	searchInIframe(query: string): void {
		if (!this.iframe?.contentDocument || !query) return;
		this.clearSearch();
		const body = this.iframe.contentDocument.body;
		const walker = this.iframe.contentDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
		const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
		while (walker.nextNode()) {
			const node = walker.currentNode;
			if (node.parentElement?.tagName === "SCRIPT" || node.parentElement?.tagName === "STYLE") continue;
			if (regex.test(node.textContent || "")) {
				const span = this.iframe.contentDocument.createElement("span");
				span.innerHTML = (node.textContent || "").replace(regex, `<mark style="background: yellow; color: black;">$1</mark>`);
				node.parentElement?.replaceChild(span, node);
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
			.setDesc("Allow scripts to run in HTML files. Disable for untrusted content.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableScripts).onChange(async (value) => {
					this.plugin.settings.enableScripts = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Sandbox permissions")
			.setDesc("Space-separated list of iframe sandbox permissions.")
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
			.setName("Background color")
			.setDesc("Set a custom background color for HTML files.")
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

		this.registerExtensions(["html", "htm"], VIEW_TYPE_HTML_EXPERIENCE);

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
