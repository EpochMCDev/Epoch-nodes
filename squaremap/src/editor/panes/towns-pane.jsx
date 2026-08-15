/**
 * Territory editor panel
 *
 * squaremap fork: chinese ui text.
 */

"use strict";

import { useState, useEffect, useMemo } from "react";

import {
    TownSortKey, RESIDENT_RANK_NONE, RESIDENT_RANK_OFFICER, RESIDENT_RANK_LEADER,
} from "constants.js";
import * as UI from "ui/ui.jsx";

import IconDelete from "assets/icon/icon-x.svg";
import IconDeleteThin from "assets/icon/icon-x-thin.svg";
import IconDeleteAll from "assets/icon/icon-terr-remove-all-owner.svg";
import IconRemoveCapture from "assets/icon/icon-terr-remove-capture.svg";
import IconPlus from "assets/icon/icon-plus.svg";
import IconSetTownHome from "assets/icon/icon-terr-set-home.svg";
import IconTerritoryCapture from "assets/icon/icon-terr-capture.svg";
import IconPlayerLeader from "assets/icon/icon-player-leader.svg";
import IconPlayerOfficer from "assets/icon/icon-player-officer.svg";
import IconSave from "assets/icon/icon-save.svg";
import IconSortByAlphabetical from "assets/icon/icon-sort-by-alphabetical.svg";
import IconSortByPlayers from "assets/icon/icon-sort-by-players.svg";
import IconSortByTerritories from "assets/icon/icon-sort-by-territories.svg";

import "ui/css/nodes-scrollbar.css";
import "editor/css/panes/common.css";
import "editor/css/panes/towns-pane.css";     // re-use nodes panel css for nodes list
import "editor/css/panes/territory-pane.css";

const ColorSelector = ({
    enabled,
    color, // array of rgb [r, g, b]
    setLocalColor, // updates local color selector state, but not real color
    setColor,      // updates real target Object color, only color picker closes because high cost
    setColorPicker,
}) => {
    let colorRgbStr = undefined;
    if ( color !== undefined ) {
        colorRgbStr = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
    }

    const colorStyle = {
        backgroundColor: colorRgbStr,
    };

    const handleCloseColorPicker = (col) => {
        // update real color
        setColor([col.r, col.g, col.b]);
        // close on screen color picker
        setColorPicker(
            false,
            color,
            0,
            0,
            (col) => console.log("ColorPicker.onChange", col),
            (col) => console.log("ColorPicker.onExit", col),
        );
    };

    // if not enabled, dont allow opening color picker
    let handleOpenColorPicker;
    if ( enabled ) {
        handleOpenColorPicker = (event) => {
            setColorPicker(
                true,
                color,
                event.clientY - 50,
                event.clientX + 10,
                (col) => setLocalColor([col.r, col.g, col.b]),
                handleCloseColorPicker,
            );
        };
    } else {
        handleOpenColorPicker = null;
    }

    return (
        <div
            className="nodes-editor-town-list-color"
            style={colorStyle}
            onClick={handleOpenColorPicker}
        />
    );
};

/**
 * List of towns.
 */
const TownsList = ({
    towns,
    selectedTownIndex,
    selectTown,
    deleteTown,
}) => {
    const townListElements = [];
    towns.forEach( town => {
        // get color
        let colorArray = town.color; // [r, g, b] format
        let color = undefined;
        if ( colorArray !== undefined ) {
            color = `rgb(${colorArray[0]}, ${colorArray[1]}, ${colorArray[2]})`
        }

        const colorStyle = {
            backgroundColor: color
        };
        
        let nationName = "";
        if ( town.nation !== undefined ) {
            nationName = `[${town.nation}]`
        }
        
        townListElements.push(
            <div key={town.name} className="nodes-editor-terr-nodes-list-item">
                <div className="nodes-editor-town-list-color" style={colorStyle}/>
                <div className="nodes-editor-terr-nodes-list-name">
                    {nationName}  {town.name}
                </div>
                <div
                    className="nodes-editor-terr-nodes-list-item-delete"
                    onClick={() => deleteTown(town.name)}
                >
                    <img
                        className="nodes-editor-terr-nodes-list-item-x"
                        src={IconDeleteThin}
                        draggable={false}
                    />
                </div>
            </div>
        );
    });

    return (
        <UI.List
            id="nodes-editor-town-list"
            list={towns}
            selected={selectedTownIndex}
            select={(town, idx) => selectTown(town, idx)}
            deselect={undefined}
            heightOfItem={20}
        >
            {townListElements}
        </UI.List>
    );
};

/**
 * List of players in each town.
 */
const TownPlayersList = ({
    players,
    selectedTown,
    removeTownResident,
}) => {
    const elements = [];
    if ( players !== undefined ) {
        for ( const p of players ) {
            let insignia = null;
            let name = p.name;
            // insignia
            if ( p.rank === RESIDENT_RANK_LEADER ) {
                insignia = <img
                    className="nodes-editor-town-player-item-rank"
                    src={IconPlayerLeader}
                    draggable={false}
                    title={"镇长"}
                />
            }
            else if ( p.rank === RESIDENT_RANK_OFFICER ) {
                insignia = <img
                    className="nodes-editor-town-player-item-rank"
                    src={IconPlayerOfficer}
                    draggable={false}
                    title={"官员"}
                />
            }
            elements.push(
                <div key={p.name} className="nodes-editor-terr-nodes-list-item">
                    {insignia}
                    <div className="nodes-editor-terr-nodes-list-name">
                        {name}
                    </div>
                    <div
                        className="nodes-editor-terr-nodes-list-item-delete"
                        onClick={() => removeTownResident(selectedTown, p.name)}
                    >
                        <img
                            className="nodes-editor-terr-nodes-list-item-x"
                            src={IconDeleteThin}
                            draggable={false}
                        />
                    </div>
                </div>
            );
        }
    }

    return (
        <UI.List
            id="nodes-editor-town-players-list"
            list={players}
            selected={null}
            select={undefined}
            deselect={undefined}
            heightOfItem={20}
        >
            {elements}
        </UI.List>
    );
};

export const TownsPane = ({
    saveTowns,
    towns,
    townsNameList,
    selectedTownIndex,
    selectedTown,
    selectTown,
    setTownSortKey,
    createTown,
    deleteTown,
    setTownName,
    setTownNationFromName,
    setTownHome,
    addTownResident,
    removeTownResident,
    setSelectedTownHomeToSelectedTerritory,
    addSelectedTownSelectedTerritories,
    addSelectedTownSelectedTerritoriesAsCaptured,
    removeSelectedTownSelectedTerritories,
    removeSelectedTerritoriesOwned,
    removeSelectedTerritoriesCaptured,
    setSelectedTownColor,
    setSelectedTownNationColor,
    setColorPicker,
}) => {
    // local state
    const [inputNewPlayerName, setInputNewPlayerName] = useState("");
    // local town, nation colors
    const [localTownColor, setLocalTownColor] = useState([0, 0, 0]);
    const [localNationColor, setLocalNationColor] = useState([0, 0, 0]);

    // handler for setting local town, nation color from selected town
    useEffect(() => {
        if ( selectedTown !== undefined ) {
            setLocalTownColor(selectedTown.colorTown);
            setLocalNationColor(selectedTown.colorNation);
        } else {
            setLocalTownColor([0, 0, 0]);
            setLocalNationColor([0, 0, 0]);
        }
    }, [selectedTown]);
    
    // onclick handler for input ui for adding new player to town
    const handleAddPlayerToTown = () => {
        if ( selectedTown !== undefined && inputNewPlayerName !== "" ) {
            addTownResident(selectedTown, inputNewPlayerName);
            setInputNewPlayerName("");
        }
    };

    // town view list
    const townList = useMemo(() => 
        <TownsList
            towns={towns}
            townsNameList={townsNameList}
            selectedTownIndex={selectedTownIndex}
            selectedTown={selectedTown}
            selectTown={selectTown}
            deleteTown={deleteTown}
        />
    , [towns, selectedTown, selectedTown?.nation, selectedTown?.color]);

    // selected town info
    const selectedTownTerritories = selectedTown ? `(${selectedTown.territories.length} 个领土)` : "";
    const selectedTownPlayersCount = `玩家: ${selectedTown ? selectedTown.residents.length : ""}`;
    const selectedTownColor = selectedTown ? selectedTown.color : [0, 0, 0];
    const selectedTownColorTown = selectedTown ? selectedTown.colorTown : [0, 0, 0];
    const selectedTownColorNation = selectedTown ? selectedTown.colorNation : [0, 0, 0];
    
    // nodes selection list
    const selectedTownPlayersList = useMemo(() =>
        <TownPlayersList
            players={selectedTown?.residents}
            selectedTown={selectedTown}
            removeTownResident={removeTownResident}
        />
    , [selectedTown?.residents]);

    return (
        <>
        <div className="nodes-editor-list-header">
            <div className="nodes-editor-list-header-text">城镇:</div>
            <div className="nodes-editor-list-header-buttons">
                <UI.Button
                    className="nodes-editor-nodes-header-btn"
                    onClick={() => setTownSortKey(TownSortKey.ALPHABETICAL)}
                    icon={IconSortByAlphabetical}
                    tooltip={"按字母排序"}
                />
                <UI.Button
                    className="nodes-editor-nodes-header-btn"
                    onClick={() => setTownSortKey(TownSortKey.PLAYERS)}
                    icon={IconSortByPlayers}
                    tooltip={"按玩家数排序"}
                />
                <UI.Button
                    className="nodes-editor-nodes-header-btn"
                    onClick={() => setTownSortKey(TownSortKey.TERRITORIES)}
                    icon={IconSortByTerritories}
                    tooltip={"按领土数排序"}
                />
                <UI.Button
                    className="nodes-editor-nodes-header-btn"
                    onClick={() => createTown()}
                    icon={IconPlus}
                    tooltip={"创建新城镇"}
                />
                <UI.Button
                    className="nodes-editor-nodes-header-btn"
                    onClick={saveTowns}
                    icon={IconSave}
                    tooltip={"下载 towns.json"}
                />
            </div>
        </div>

        {townList}

        {/* Town name edit */}
        <div className="nodes-editor-setting-field">
            <div>城镇:</div>
            <UI.InputEdit
                className={"nodes-editor-setting-input"}
                value={selectedTown ? selectedTown.name : ""}
                onChange={(val) => setTownName(selectedTown, val)}
            />
            <ColorSelector
                enabled={selectedTown !== undefined}
                color={localTownColor}
                setColor={setSelectedTownColor}
                setLocalColor={setLocalTownColor}
                setColorPicker={setColorPicker}
            />
        </div>

        {/* Nation name edit: for now, this will edit ALL nation naes */}
        <div className="nodes-editor-setting-field">
            <div>国家:</div>
            <UI.InputEdit
                className={"nodes-editor-setting-input"}
                value={selectedTown?.nation ? selectedTown.nation : ""}
                onChange={(val) => setTownNationFromName(selectedTown, val)}
            />
            <ColorSelector
                enabled={selectedTown !== undefined}
                color={localNationColor}
                setColor={setSelectedTownNationColor}
                setLocalColor={setLocalNationColor}
                setColorPicker={setColorPicker}
            />
        </div>

        {/* Town home territory id edit */}
        <div className="nodes-editor-setting-field">
            <div>首都领土 ID:</div>
            <UI.InputEdit
                className={"nodes-editor-setting-input"}
                value={selectedTown ? selectedTown.home : ""}
                onChange={(val) => setTownHome(selectedTown, val)}
            />
        </div>

        {/* Town territory operations */}
        <div className="nodes-editor-towns-header">{`领土操作 ${selectedTownTerritories}`}</div>
        
        <div id="nodes-editor-terr-toolbar">
            <div id="nodes-editor-terr-toolbar-g1">
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={setSelectedTownHomeToSelectedTerritory}
                    icon={IconSetTownHome}
                    tooltip={"设城镇首都为选中领土"}
                />
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={addSelectedTownSelectedTerritoriesAsCaptured}
                    icon={IconTerritoryCapture}
                    tooltip={"为城镇占领选中领土"}
                />
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={addSelectedTownSelectedTerritories}
                    icon={IconPlus}
                    tooltip={"将选中领土加入城镇"}
                />
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={removeSelectedTownSelectedTerritories}
                    icon={IconDelete}
                    tooltip={"将选中领土移出城镇"}
                />
            </div>
            <div id="nodes-editor-terr-toolbar-g2">
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={removeSelectedTerritoriesCaptured}
                    icon={IconRemoveCapture}
                    tooltip={"解除所有城镇对选中领土的占领"}
                />
                <UI.Button
                    className="nodes-editor-terr-tool-btn"
                    onClick={removeSelectedTerritoriesOwned}
                    icon={IconDeleteAll}
                    tooltip={"从所有城镇移除选中领土"}
                />
            </div>
        </div>

        {/* Town player/resident operations */}
        <div className="nodes-editor-towns-header">{selectedTownPlayersCount}</div>
        {selectedTownPlayersList}
        <div id="nodes-editor-terr-add-node">
            <UI.Button
                className="nodes-editor-terr-tool-btn"
                onClick={handleAddPlayerToTown}
                icon={IconPlus}
                tooltip={"添加玩家到城镇"}
            />
            <UI.InputEdit
                className="nodes-editor-terr-add-node-input"
                value={inputNewPlayerName}
                bubbleChange={true}
                onChange={setInputNewPlayerName}
                onEnterKey={handleAddPlayerToTown}
            />
        </div>
        </>
    );

};
