import { App, ItemView, Plugin, TFile, WorkspaceLeaf } from "obsidian";

const VIEW_TYPE_HTML_EXPERIENCE = "html-experience-view";

class HTMLExperienceView extends ItemView {
	file: TFile | null = null;
	iframe: HTMLIFrameElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_HTML_EXPERIENCE;
	}

	getDisplayText(): string {
		return this.file ? this.file.name : "HTML Experience";
	}

	getIcon(): string {
		return "code-glyph";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("html-experience-container");

		this.iframe = container.createEl("iframe", {
			cls: "html-experience-iframe",
			attr: {
				sandbox: "allow-scripts allow-same-origin allow-forms allow-popups",
				frameborder: "0",
			},
		});

		if (this.file) {
			await this.loadFile(this.file);
		}
	}

	async loadFile(file: TFile): Promise<void> {
		this.file = file;
		if (!this.iframe) return;

		const content = await this.app.vault.read(file);
		const blob = new Blob([content], { type: "text/html" });
		const url = URL.createObjectURL(blob);
		this.iframe.src = url;
	}

	async onClose(): Promise<void> {
		if (this.iframe?.src) {
			URL.revokeObjectURL(this.iframe.src);
		}
	}
}

export default class HTMLExperiencePlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_HTML_EXPERIENCE, (leaf) => new HTMLExperienceView(leaf));

		this.registerExtensions(["html", "htm"], VIEW_TYPE_HTML_EXPERIENCE);

		this.addCommand({
			id: "open-html-in-experience",
			name: "Open current file in HTML Experience",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && (activeFile.extension === "html" || activeFile.extension === "htm")) {
					if (!checking) {
						this.openHTMLFile(activeFile);
					}
					return true;
				}
				return false;
			},
		});
	}

	async openHTMLFile(file: TFile): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML_EXPERIENCE);
		let leaf: WorkspaceLeaf;

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = this.app.workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_HTML_EXPERIENCE,
				active: true,
			});
		}

		const view = leaf.view as HTMLExperienceView;
		await view.loadFile(file);
		this.app.workspace.revealLeaf(leaf);
	}

	async onunload(): Promise<void> {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_HTML_EXPERIENCE);
	}
}
