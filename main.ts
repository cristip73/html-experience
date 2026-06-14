import { FileView, Plugin, TFile, WorkspaceLeaf } from "obsidian";

const VIEW_TYPE_HTML_EXPERIENCE = "html-experience-view";

class HTMLExperienceView extends FileView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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

		const iframe = mainView.createEl("iframe", {
			cls: "html-experience-iframe",
			attr: {
				sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals",
			},
		});

		const baseHref = this.app.vault.getResourcePath(file);
		const doc = new DOMParser().parseFromString(htmlStr, "text/html");

		let baseElm = doc.querySelector("base");
		if (!baseElm) {
			baseElm = doc.createElement("base");
			doc.head.prepend(baseElm);
		}
		baseElm.setAttribute("href", baseHref);

		iframe.srcdoc = doc.documentElement.outerHTML;
	}

	canRenameExtension(extension: string): boolean {
		return false;
	}
}

export default class HTMLExperiencePlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_HTML_EXPERIENCE, (leaf) => new HTMLExperienceView(leaf));

		this.registerExtensions(["html", "htm"], VIEW_TYPE_HTML_EXPERIENCE);
	}

	async onunload(): Promise<void> {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_HTML_EXPERIENCE);
	}
}
