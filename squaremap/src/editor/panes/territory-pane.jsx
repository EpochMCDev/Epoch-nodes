/**
 * Territory editor panel
 *
 * squaremap fork: chinese ui text, brush size +/- buttons,
 * paint button shows pressed state.
 */

"use strict";

import { useState, useMemo } from "react";

import Nodes from "nodes.js";
import * as UI from "ui/ui.jsx";
import IconDelete from "assets/icon/icon-x.svg";
import IconDeleteNode from "assets/icon/icon-x-thin.svg";
import IconPlus from "assets/icon/icon-plus.svg";
import IconMerge from "assets/icon/icon-terr-merge.svg";
import IconPaint from "assets/icon/icon-terr-paint.svg";

import "ui/css/nodes-scrollbar.css";
import "editor/css/panes/common.css";
import "editor/css/panes/nodes-pane.css";     // re-use nodes panel css for nodes list
import "editor/css/panes/territory-pane.css";

// ===============================
// territory nodes list
// ===============================
const TerritoryNodesList = (props) => {
    const nodesDivList = [];
    if ( props.selectedTerritory !== undefined ) {
        props.selectedTerritory.nodes.forEach( nodeName => {
            if ( props.nodes.has(nodeName) ) {
                let icon = props.nodes.get(nodeName).icon;
                let iconSrc = props.resourceIcons.get(icon);

                nodesDivList.push(
                    <div key={nodeName} className="nodes-editor-terr-nodes-list-item">
                        <div className="nodes-editor-terr-nodes-list-item-icon">
                            {iconSrc !== undefined ?
                            <img
                                className="nodes-editor-terr-nodes-list-item-img"
                                src={iconSrc}
                                draggable={false}
                            />
                            : (null)}
                        </div>
                        <div className="nodes-editor-terr-nodes-list-name">
                            {nodeName}
                        </div>
                        <div
                            className="nodes-editor-terr-nodes-list-item-delete"
                            onClick={() => props.removeNodeFromTerritory(props.selectedTerritory.id, nodeName)}
                        >
                            <img
                                className="nodes-editor-terr-nodes-list-item-x"
                                src={IconDeleteNode}
                                draggable={false}
                            />
                        </div>
                    </div>
                );
            }
        });
    }

    return (
        <UI.List
            id="nodes-editor-terr-list"
            list={props.selectedTerritoryNodes}
            selected={undefined}
            select={undefined}
            deselect={undefined}
            heightOfItem={20}
        >
            {nodesDivList}
        </UI.List>
    );
};

// brush size step
const BRUSH_STEP = 0.5;

export const TerritoryPane = (props) => {

    const [inputNodeName, setInputNodeName] = useState("");
    
    const selectedTerritory = props.selectedTerritory;

    // button onclick handler for adding node to selected territory
    const handleAddNodeToTerritory = () => {
        if ( selectedTerritory !== undefined ) {
            let status = props.addNodeToTerritory(selectedTerritory.id, inputNodeName);
            if ( status === true ) { // success
                setInputNodeName("");
            }
        }
    };

    // brush size +/- buttons (alternative to shift + drag)
    const changeBrushSize = (delta) => {
        const newRadius = Math.max(
            Nodes.minPaintRadius,
            Math.min(Nodes.maxPaintRadius, Nodes.paintRadius + delta)
        );
        Nodes.paintRadius = newRadius;
        Nodes.renderEditor();
        Nodes.renderWorld();
    };

    // territory info
    const selectedTerritoryName = selectedTerritory !== undefined ? selectedTerritory.name : "";
    const selectedTerritoryId = `ID: ${selectedTerritory !== undefined ? selectedTerritory.id : ""}`;
    const selectedTerritoryCore = `核心: ${selectedTerritory !== undefined && selectedTerritory.coreChunk ? `${selectedTerritory.coreChunk.x},${selectedTerritory.coreChunk.y}` : ""}`
    const selectedTerritorySize = `区块数: ${selectedTerritory !== undefined ? selectedTerritory.size : ""}`;
    const selectedTerritoryCost = `费用: ${selectedTerritory !== undefined ? selectedTerritory.cost : ""}`;
    const selectedTerritoryNodes = selectedTerritory !== undefined ? selectedTerritory.nodes : undefined;
    const selectedTerritoryNodesCount = selectedTerritoryNodes !== undefined ? selectedTerritoryNodes.length : 0;

    // nodes selection list
    const territoryNodesList = useMemo(() => TerritoryNodesList({
        nodes: props.nodes,
        resourceIcons: props.resourceIcons,
        selectedTerritory: selectedTerritory,
        selectedTerritoryNodes: selectedTerritoryNodes,
        removeNodeFromTerritory: props.removeNodeFromTerritory,
    }), [selectedTerritory, selectedTerritoryNodesCount]);

    return (
        <>
        <div id="nodes-editor-terr-header">领土:</div>

        <div id="nodes-editor-terr-chunk">
            <div id="nodes-editor-terr-chunk-label">当前区块:</div>
            <div>x: {props.x}</div>
            <div>z: {props.z}</div>
        </div>

        <div id="nodes-editor-terr-toolbar">
            <div id="nodes-editor-terr-toolbar-g1">
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={props.createTerritory}
                    icon={IconPlus}
                    tooltip={"创建领土"}
                />
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={() => props.deleteTerritory(Nodes.selectedTerritories.keys())}
                    icon={IconDelete}
                    tooltip={"删除领土"}
                />
            </div>
            <div id="nodes-editor-terr-toolbar-g2">
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={props.togglePainting}
                    icon={IconPaint}
                    pressed={Nodes.enabledPainting}
                    tooltip={"绘制领土区块"}
                />
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={Nodes.mergeSelectedTerritories}
                    icon={IconMerge}
                    tooltip={"合并领土"}
                />
            </div>
        </div>
        <div id="nodes-editor-brush-size">
            <span>{`画笔半径: ${props.paintRadius.toFixed(2)}`}</span>
            <span className="nodes-editor-brush-btns">
                <UI.Button
                    className="nodes-editor-terr-tool-btn nodes-editor-brush-btn"
                    onClick={() => changeBrushSize(-BRUSH_STEP)}
                >-</UI.Button>
                <UI.Button
                    className="nodes-editor-terr-tool-btn nodes-editor-brush-btn"
                    onClick={() => changeBrushSize(BRUSH_STEP)}
                >+</UI.Button>
            </span>
        </div>

        <div id="nodes-editor-terr-selected-header">选中领土:</div>
        <div id="nodes-editor-terr-selected-name">
            <div>名称:</div>
            <UI.InputEdit
                id="nodes-editor-terr-selected-name-edit"
                value={selectedTerritoryName}
                onChange={(newName) => props.setTerritoryName(selectedTerritory, newName)}
            />
        </div>
        <div>{selectedTerritoryId}</div>
        <div>{selectedTerritoryCore}</div>
        <div>{selectedTerritorySize}</div>
        <div>{selectedTerritoryCost}</div>
        <div>资源节点:</div>
        {territoryNodesList}
        <div id="nodes-editor-terr-add-node">
            <UI.Button
                className="nodes-editor-terr-tool-btn"
                onClick={handleAddNodeToTerritory}
                icon={IconPlus}
                tooltip={"添加资源节点"}
            />
            <UI.InputEdit
                className="nodes-editor-terr-add-node-input"
                value={inputNodeName}
                bubbleChange={true}
                onChange={setInputNodeName}
                onEnterKey={handleAddNodeToTerritory}
            />
        </div>
        
        <div className="nodes-editor-help">
            <div>操作说明:</div>
            <div>- [右键单击]: 选择领土(画笔关闭时)</div>
            <div>- [空格键]: 开关画笔模式</div>
            <div>- [右键拖动]: 绘制区块</div>
            <div>- [Ctrl + 右键拖动]: 擦除区块</div>
            <div>- [Shift + 拖动]: 调整画笔大小</div>
            <div>- [A]: 绘制时按住创建新领土</div>
        </div>
        </>
    );

};
