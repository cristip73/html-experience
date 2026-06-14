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

		const mainView = this.contentEl.createDiv();
		mainView.setAttribute("style", "display: flex; flex-direction: column; height: 100%; padding: 0;");

		const sandbox = this.plugin.settings.enableScripts
			? this.plugin.settings.sandboxPermissions
			: "allow-same-origin";

		const iframe = mainView.createEl("iframe", {
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

		iframe.srcdoc = doc.documentElement.outerHTML;
	}

	canRenameExtension(extension: string): boolean {
		return false;
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
