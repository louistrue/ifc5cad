// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { div, input, label } from "chili-controls";
import { Config, type I18nKeys, Localize, ObjectSnapType, ObjectSnapTypeUtils } from "chili-core";
import style from "./snapConfig.module.css";

const SnapTypes: Array<{
    type: ObjectSnapType;
    display: I18nKeys;
}> = [
    {
        type: ObjectSnapType.endPoint,
        display: "snap.end",
    },
    {
        type: ObjectSnapType.midPoint,
        display: "snap.mid",
    },
    {
        type: ObjectSnapType.center,
        display: "snap.center",
    },
    {
        type: ObjectSnapType.perpendicular,
        display: "snap.perpendicular",
    },
    {
        type: ObjectSnapType.intersection,
        display: "snap.intersection",
    },
];

export class SnapConfig extends HTMLElement {
    constructor() {
        super();
        this.className = style.container;
        Config.instance.onPropertyChanged(this.snapTypeChanged);

        this.render();
    }

    private readonly snapTypeChanged = (property: keyof Config) => {
        if (
            property === "snapType" ||
            property === "enableSnap" ||
            property === "enableSnapTracking" ||
            property === "gridVisible" ||
            property === "gridSnap" ||
            property === "orthoMode"
        ) {
            this.innerHTML = "";
            this.render();
        }
    };

    private handleSnapClick(snapType: ObjectSnapType) {
        if (ObjectSnapTypeUtils.hasType(Config.instance.snapType, snapType)) {
            Config.instance.snapType = ObjectSnapTypeUtils.removeType(Config.instance.snapType, snapType);
        } else {
            Config.instance.snapType = ObjectSnapTypeUtils.addType(Config.instance.snapType, snapType);
        }
    }

    private render() {
        this.append(
            ...SnapTypes.map((snapType) => {
                return div(
                    input({
                        type: "checkbox",
                        id: `snap-${snapType.type}`,
                        checked: ObjectSnapTypeUtils.hasType(Config.instance.snapType, snapType.type),
                        onclick: () => this.handleSnapClick(snapType.type),
                    }),
                    label({
                        htmlFor: `snap-${snapType.type}`,
                        textContent: new Localize(snapType.display),
                    }),
                );
            }),
            div(
                input({
                    type: "checkbox",
                    id: "snap-tracking",
                    checked: Config.instance.enableSnapTracking,
                    onclick: () => {
                        Config.instance.enableSnapTracking = !Config.instance.enableSnapTracking;
                    },
                }),
                label({
                    htmlFor: "snap-tracking",
                    textContent: new Localize("statusBar.tracking"),
                }),
            ),
            div(
                input({
                    type: "checkbox",
                    id: "snap-grid",
                    checked: Config.instance.gridVisible,
                    onclick: () => {
                        Config.instance.gridVisible = !Config.instance.gridVisible;
                    },
                }),
                label({
                    htmlFor: "snap-grid",
                    textContent: new Localize("statusBar.grid"),
                }),
            ),
            div(
                input({
                    type: "checkbox",
                    id: "snap-gridSnap",
                    checked: Config.instance.gridSnap,
                    onclick: () => {
                        Config.instance.gridSnap = !Config.instance.gridSnap;
                    },
                }),
                label({
                    htmlFor: "snap-gridSnap",
                    textContent: new Localize("statusBar.gridSnap"),
                }),
            ),
            div(
                input({
                    type: "checkbox",
                    id: "snap-ortho",
                    checked: Config.instance.orthoMode,
                    onclick: () => {
                        Config.instance.orthoMode = !Config.instance.orthoMode;
                    },
                }),
                label({
                    htmlFor: "snap-ortho",
                    textContent: new Localize("statusBar.ortho"),
                }),
            ),
        );
    }
}

customElements.define("chili-snap-config", SnapConfig);
