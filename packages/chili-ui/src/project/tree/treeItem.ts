// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { label, setSVGIcon, svg } from "chili-controls";
import { Binding, type IDocument, type INode, Transaction } from "chili-core";
import style from "./treeItem.module.css";

export abstract class TreeItem extends HTMLElement {
    readonly name: HTMLLabelElement;
    readonly visibleIcon: SVGSVGElement;

    private _node: INode;
    get node() {
        return this._node;
    }

    constructor(
        private document: IDocument,
        node: INode,
    ) {
        super();
        this._node = node;
        this.draggable = true;
        this.name = label({
            className: style.name,
            textContent: new Binding(node, "name"),
            ondblclick: this.onNameDblClick,
        });
        this.visibleIcon = svg({
            className: style.icon,
            icon: this.getVisibleIcon(),
            onclick: this.onVisibleIconClick,
        });
        this.setVisibleStyle(node.parentVisible);
    }

    connectedCallback(): void {
        this.node.onPropertyChanged(this.onPropertyChanged);
    }

    disconnectedCallback(): void {
        this.node.removePropertyChanged(this.onPropertyChanged);
    }

    private readonly onPropertyChanged = (property: keyof INode, model: INode) => {
        if (property === "visible") {
            setSVGIcon(this.visibleIcon, this.getVisibleIcon());
        } else if (property === "parentVisible") {
            this.setVisibleStyle(model[property]);
        }
    };

    private setVisibleStyle(parentVisible?: boolean) {
        if (parentVisible === true) {
            this.visibleIcon.classList.remove(style["parent-hidden"]);
        } else {
            this.visibleIcon.classList.add(style["parent-hidden"]);
        }
    }

    addSelectedStyle(style: string) {
        this.getSelectedHandler().classList.add(style);
    }

    removeSelectedStyle(style: string) {
        this.getSelectedHandler().classList.remove(style);
    }

    abstract getSelectedHandler(): HTMLElement;

    dispose() {
        this.remove();
        this.node.removePropertyChanged(this.onPropertyChanged);
        this.visibleIcon.removeEventListener("click", this.onVisibleIconClick);
        this.document = null as any;
        this._node = null as any;
    }

    private getVisibleIcon() {
        return this.node.visible ? "icon-eye" : "icon-eye-slash";
    }

    private readonly onVisibleIconClick = (e: MouseEvent) => {
        e.stopPropagation();
        Transaction.execute(this.document, "change visible", () => {
            this.node.visible = !this.node.visible;
        });
        this.document.visual.update();
    };

    private readonly onNameDblClick = (e: MouseEvent) => {
        e.stopPropagation();
        const inp = document.createElement("input");
        inp.type = "text";
        inp.value = this.node.name;
        inp.className = style.nameInput;

        let done = false;
        const commit = () => {
            if (done) return;
            done = true;
            const next = inp.value.trim();
            if (next && next !== this.node.name) {
                Transaction.execute(this.document, `rename: ${this.node.name}`, () => {
                    this.node.name = next;
                });
            }
            inp.replaceWith(this.name);
        };

        inp.addEventListener("blur", commit);
        inp.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); commit(); }
            else if (ev.key === "Escape") { done = true; inp.replaceWith(this.name); }
        });

        this.name.replaceWith(inp);
        inp.select();
        inp.focus();
    };
}
