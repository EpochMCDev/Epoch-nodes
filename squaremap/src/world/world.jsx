/**
 * SVG render layer on top of the squaremap leaflet map.
 *
 * Width/height/viewbox/transform are driven by NodesSvgRenderer (in nodes.js),
 * which mirrors L.Renderer/L.SVG to position the react svg layer when the map
 * pans or zooms.
 */
import { useMemo, useCallback } from "react";
import Nodes from "../nodes";
import {Territory} from "world/territory.jsx";
import "world/css/nodes.css";

export const WorldRenderer = (props) => {

    // squaremap projection: block coords -> latlng -> svg layer point
    const getPoint = (x,z) => {
        if ( props.map !== undefined && props.toLatLng !== undefined ) {
            const latlng = props.toLatLng(x, z);
            return props.map.latLngToLayerPoint(latlng);
        }
        return {x: x, z: z};
    };

    
    // generate cursor circle if painting
    let cursorCircle = (null);
    if ( props.enabledPainting && props.map !== undefined ) {
        try {
            const cursorCenter = props.map.latLngToLayerPoint(props.cursorLatLng);
            const cx = cursorCenter.x;
            const cy = cursorCenter.y;
            // radius in CHUNKS, transform to point
            const r = getPoint(props.paintRadius * 16, 0).x - getPoint(0, 0).x;
            const strokeColor = props.isErasing ? "#A00" : "#000";
            cursorCircle = (
                <g>
                    <circle cx={cx} cy={cy} r={r} stroke={strokeColor} strokeWidth="1" fill="none"/>
                </g>
            );
        }
        catch (e) {
            // ignore?
            console.log("FAILED", e);
        }
        
    }

    // background image location
    let backgroundImage = null;
    if ( Nodes.backgroundImageSrc !== undefined ) {
        const backgroundOrigin = getPoint(props.backgroundImageOriginX, props.backgroundImageOriginY);
        const backgroundEnd = getPoint(props.backgroundImageEndX, props.backgroundImageEndY);
        const backgroundWidth = backgroundEnd.x - backgroundOrigin.x
        const backgroundHeight = backgroundEnd.y - backgroundOrigin.y
        backgroundImage = (
            <image href={props.backgroundImageSrc} width={backgroundWidth} height={backgroundHeight} x={backgroundOrigin.x} y={backgroundOrigin.y} preserveAspectRatio="none"/>
        );
    }

    return (
        <svg
            id="nodes-world"
            className="leaflet-zoom-animated"
            width={props.width}
            height={props.height}
            viewBox={props.viewbox}
            style={{transform: props.transform}}
            onMouseDown={props.handleMouseDown}
            onMouseUp={props.handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
        >
            {backgroundImage}

            <defs>
                {props.svgPatterns}
            </defs>

            {props.territoryElements}
            
            {props.townCapitalElements}

            {props.portElements}

            {props.townNameElements}
            
            {cursorCircle}

        </svg>
    );
}

