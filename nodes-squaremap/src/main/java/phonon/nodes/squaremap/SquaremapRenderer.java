package phonon.nodes.squaremap;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import xyz.jpenilla.squaremap.api.Key;
import xyz.jpenilla.squaremap.api.MapWorld;
import xyz.jpenilla.squaremap.api.Point;
import xyz.jpenilla.squaremap.api.SimpleLayerProvider;
import xyz.jpenilla.squaremap.api.Squaremap;
import xyz.jpenilla.squaremap.api.marker.Marker;
import xyz.jpenilla.squaremap.api.marker.MarkerOptions;
import xyz.jpenilla.squaremap.api.marker.MultiPolygon;

/**
 * Builds squaremap markers from a {@link NodesData.Snapshot}:
 * territory polygons, node icons, port icons, and town/nation name text.
 *
 * <p>All work happens on the async scheduler task; the squaremap marker API
 * (layer providers, icon registry) is thread-safe.
 */
public final class SquaremapRenderer {
    private static final int GRID_SPACING = 32; // block units between node icons in a territory core

    private final Squaremap squaremap;
    private final Settings settings;

    // world identifier string -> layer provider
    private final Map<String, SimpleLayerProvider> providers = new HashMap<>();
    // node type name -> generated icon image (cache)
    private final Map<String, BufferedImage> nodeIconCache = new HashMap<>();
    // town name -> registered text icon key (cache)
    private final Map<String, TextIcon> textIconCache = new HashMap<>();
    // all icon keys we registered in squaremap's icon registry
    private final Set<String> ownedIconKeys = new HashSet<>();

    private Key portIconKey;

    public SquaremapRenderer(Squaremap squaremap, Settings settings) {
        this.squaremap = squaremap;
        this.settings = settings;
        this.portIconKey = registerIcon("nodes.port", drawPortIcon(settings.iconSize));
    }

    /** Register one "Nodes" layer on every enabled squaremap world (or the configured subset). */
    public void registerLayers() {
        for (MapWorld world : squaremap.mapWorlds()) {
            String id = world.identifier().toString();
            if (providers.containsKey(id)) {
                continue;
            }
            if (!settings.worlds.isEmpty() && !worldMatches(id)) {
                continue;
            }
            SimpleLayerProvider provider = SimpleLayerProvider.builder("Nodes").build();
            world.layerRegistry().register(Key.of("nodes_layer"), provider);
            providers.put(id, provider);
        }
    }

    private boolean worldMatches(String identifier) {
        for (String w : settings.worlds) {
            if (identifier.equals(w) || identifier.endsWith(":" + w)) {
                return true;
            }
        }
        return false;
    }

    /** Number of squaremap worlds currently registered. */
    public int worldCount() {
        return providers.size();
    }

    /** Remove all registered layers. */
    public void unregisterLayers() {
        for (MapWorld world : squaremap.mapWorlds()) {
            String id = world.identifier().toString();
            SimpleLayerProvider provider = providers.remove(id);
            if (provider != null) {
                world.layerRegistry().unregister(Key.of("nodes_layer"));
            }
        }
        providers.clear();
    }

    /** Rebuild all markers from the given snapshot. */
    public void render(NodesData.Snapshot snapshot) {
        if (providers.isEmpty() || snapshot.isEmpty()) {
            return;
        }

        // owner/occupier lookup: territory id -> town
        Map<Integer, NodesData.Town> owners = new HashMap<>();
        Map<Integer, NodesData.Town> occupiers = new HashMap<>();
        for (NodesData.Town town : snapshot.towns.values()) {
            for (int id : town.territories) {
                owners.put(id, town);
            }
            for (int id : town.captured) {
                occupiers.put(id, town);
            }
        }

        // build the full marker set (same for every world)
        List<Map.Entry<Key, Marker>> markers = new ArrayList<>();
        if (settings.renderTerritories) {
            for (NodesData.Territory territory : snapshot.territories.values()) {
                Marker marker = buildTerritoryMarker(territory, owners.get(territory.id), occupiers.get(territory.id), snapshot);
                if (marker != null) {
                    markers.add(Map.entry(Key.of("nodes.territory." + territory.id), marker));
                }
            }
        }
        if (settings.renderNodeIcons) {
            for (NodesData.Territory territory : snapshot.territories.values()) {
                if (!territory.nodes.isEmpty()) {
                    addNodeIcons(markers, territory, snapshot);
                }
            }
        }
        if (settings.renderPorts) {
            for (NodesData.Port port : snapshot.ports.values()) {
                markers.add(Map.entry(
                    Key.of("nodes.port." + sanitize(port.name)),
                    Marker.icon(Point.of(port.x, port.z), portIconKey, settings.iconSize)
                        .markerOptions(MarkerOptions.builder().hoverTooltip(esc(port.name)).clickTooltip(esc(port.name)).build())));
            }
        }
        if (settings.renderTownNames || settings.renderNationNames) {
            addTownNameMarkers(markers, snapshot);
        }

        // apply to every provider
        for (SimpleLayerProvider provider : providers.values()) {
            provider.clearMarkers();
            for (Map.Entry<Key, Marker> entry : markers) {
                provider.addMarker(entry.getKey(), entry.getValue());
            }
        }

        // prune stale text icon registrations
        pruneIcons();
    }

    // ============================================================
    // territory polygons
    // ============================================================

    private Marker buildTerritoryMarker(NodesData.Territory territory,
                                        NodesData.Town owner,
                                        NodesData.Town occupier,
                                        NodesData.Snapshot snapshot) {
        if (territory.chunks.length == 0) {
            return null;
        }

        int[][] cells = new int[territory.chunks.length / 2][2];
        for (int i = 0; i + 1 < territory.chunks.length; i += 2) {
            cells[i / 2][0] = territory.chunks[i];
            cells[i / 2][1] = territory.chunks[i + 1];
        }

        List<TerritoryOutline.Ring> rings = TerritoryOutline.compute(cells);
        if (rings.isEmpty()) {
            return null;
        }

        List<MultiPolygon.MultiPolygonPart> parts = new ArrayList<>();
        for (int i = 0; i < rings.size(); i++) {
            TerritoryOutline.Ring ring = rings.get(i);
            if (ring.depth % 2 != 0) {
                continue; // hole boundary (odd depth); included as negative space of its parent
            }
            List<Point> outer = toPoints(ring.points);
            List<List<Point>> holes = new ArrayList<>();
            for (int j = 0; j < rings.size(); j++) {
                if (rings.get(j).parentIndex == i) {
                    holes.add(toPoints(rings.get(j).points));
                }
            }
            parts.add(MultiPolygon.part(outer, holes));
        }
        if (parts.isEmpty()) {
            return null;
        }

        // resolve colors
        int[] fillColor = settings.unownedColor;
        int[] strokeColor = settings.borderColor;
        String tooltip = territory.name;

        if (owner != null) {
            int[] nationColor = owner.nation != null ? snapshot.nationColors.get(owner.nation) : null;
            if (nationColor != null) {
                fillColor = nationColor;
                tooltip = territory.name.isEmpty() ? owner.name : territory.name + " (" + owner.nation + ")";
            } else if (owner.color != null) {
                fillColor = owner.color;
                tooltip = territory.name.isEmpty() ? owner.name : territory.name + " (" + owner.name + ")";
            }
            if (occupier != null && occupier.color != null) {
                strokeColor = occupier.color;
                tooltip = tooltip + " [occupied by " + occupier.name + "]";
            }
        }

        MarkerOptions.Builder options = MarkerOptions.builder()
            .strokeColor(rgb(strokeColor))
            .strokeWeight(settings.strokeWeight);
        if (settings.renderTerritoryBorderOnly) {
            options.fill(false).fillOpacity(0);
        } else {
            options.fill(true).fillColor(rgb(fillColor)).fillOpacity(settings.fillOpacity);
        }
        if (!tooltip.isEmpty() || !territory.nodes.isEmpty()) {
            String html = esc(tooltip);
            if (!territory.nodes.isEmpty()) {
                StringBuilder nodeList = new StringBuilder();
                for (String t : territory.nodes) {
                    if (nodeList.length() > 0) {
                        nodeList.append(", ");
                    }
                    nodeList.append(esc(t));
                }
                html += (html.isEmpty() ? "" : "<br/>") + "节点: " + nodeList;
            }
            options.hoverTooltip(html).clickTooltip(html);
        }

        return Marker.multiPolygon(parts).markerOptions(options.build());
    }

    private void addNodeIcons(List<Map.Entry<Key, Marker>> markers, NodesData.Territory territory, NodesData.Snapshot snapshot) {
        List<String> nodeTypes = territory.nodes;
        int n = nodeTypes.size();
        int cols = (int) Math.ceil(Math.sqrt(n));
        int rows = (int) Math.ceil(n / (double) cols);
        long coreX = territory.coreBlockX();
        long coreZ = territory.coreBlockZ();

        for (int i = 0; i < n; i++) {
            String type = nodeTypes.get(i);
            BufferedImage image = nodeIcon(type);
            if (image == null) {
                continue;
            }
            Key key = registerIcon("nodes.node." + sanitize(type), image);
            int col = i % cols;
            int row = i / cols;
            double x = coreX + (col - (cols - 1) / 2.0) * GRID_SPACING;
            double z = coreZ + (row - (rows - 1) / 2.0) * GRID_SPACING;
            String tooltip = nodeTooltip(type, snapshot.nodes.get(type));
            markers.add(Map.entry(
                Key.of("nodes.node." + territory.id + "." + i),
                Marker.icon(Point.of(x, z), key, settings.iconSize)
                    .markerOptions(MarkerOptions.builder().hoverTooltip(tooltip).clickTooltip(tooltip).build())));
        }
    }

    /**
     * Detailed hover tooltip for a resource node icon, mirroring the
     * dynmap editor's resource tooltip: name plus income/ore/crops/animals.
     */
    private static String nodeTooltip(String type, NodesData.Node node) {
        StringBuilder sb = new StringBuilder();
        sb.append(esc(type));
        if (node != null) {
            appendNodeProps(sb, "收入", node.income);
            appendNodeProps(sb, "矿物", node.ore);
            appendNodeProps(sb, "作物", node.crops);
            appendNodeProps(sb, "动物", node.animals);
        }
        return sb.toString();
    }

    private static void appendNodeProps(StringBuilder sb, String label, Map<String, Double> props) {
        if (props.isEmpty()) {
            return;
        }
        sb.append("<br/>").append(label).append(":");
        for (Map.Entry<String, Double> entry : props.entrySet()) {
            sb.append("<br/>&nbsp;&nbsp;").append(esc(entry.getKey()))
              .append(" ×").append(formatAmount(entry.getValue()));
        }
    }

    private static String formatAmount(double value) {
        if (value == Math.floor(value) && !Double.isInfinite(value)) {
            return Long.toString((long) value);
        }
        return String.format("%.1f", value);
    }

    // ============================================================
    // town / nation name text
    // ============================================================

    private void addTownNameMarkers(List<Map.Entry<Key, Marker>> markers, NodesData.Snapshot snapshot) {
        for (NodesData.Town town : snapshot.towns.values()) {
            if (town.home < 0) {
                continue;
            }
            NodesData.Territory home = snapshot.territories.get(town.home);
            if (home == null) {
                continue;
            }

            String label;
            if (settings.renderNationNames && town.nation != null) {
                label = town.nation; // nation name at every town in the nation (or only capital?)
            } else {
                label = town.name;
            }
            if (label == null || label.isEmpty()) {
                continue;
            }

            TextIcon icon = textIcon(label);
            if (icon == null) {
                continue;
            }
            // place above the core chunk
            markers.add(Map.entry(
                Key.of("nodes.name." + sanitize(town.name)),
                Marker.icon(Point.of(home.coreBlockX(), home.coreBlockZ() - 24), icon.key, icon.width, icon.height)
                    .markerOptions(MarkerOptions.builder().hoverTooltip(esc(town.name)).clickTooltip(esc(town.name)).build())));
        }
    }

    // ============================================================
    // icon registry helpers
    // ============================================================

    private Key registerIcon(String keyString, BufferedImage image) {
        Key key = Key.of(keyString);
        if (!squaremap.iconRegistry().hasEntry(key)) {
            squaremap.iconRegistry().register(key, image);
        }
        ownedIconKeys.add(keyString);
        return key;
    }

    private void pruneIcons() {
        // remove registered text icons whose label no longer exists
        List<String> stale = new ArrayList<>();
        for (String keyString : ownedIconKeys) {
            if (keyString.startsWith("nodes.text.")) {
                String label = keyString.substring("nodes.text.".length());
                if (!textIconCache.containsKey(label)) {
                    stale.add(keyString);
                }
            }
        }
        for (String keyString : stale) {
            try {
                squaremap.iconRegistry().unregister(Key.of(keyString));
            } catch (Exception ignored) {
            }
            ownedIconKeys.remove(keyString);
        }
    }

    private BufferedImage nodeIcon(String type) {
        BufferedImage cached = nodeIconCache.get(type);
        if (cached != null) {
            return cached;
        }
        int[] color = settings.iconColors.getOrDefault(type, new int[]{128, 128, 128});
        BufferedImage image = drawNodeIcon(color, settings.iconSize);
        nodeIconCache.put(type, image);
        return image;
    }

    private TextIcon textIcon(String label) {
        TextIcon existing = textIconCache.get(label);
        if (existing != null) {
            return existing;
        }
        BufferedImage image = drawTextSprite(label, settings.textSize);
        Key key = registerIcon("nodes.text." + sanitize(label), image);
        TextIcon icon = new TextIcon(key, image.getWidth(), image.getHeight());
        textIconCache.put(label, icon);
        return icon;
    }

    // ============================================================
    // drawing helpers (generated icons, no binary assets needed)
    // ============================================================

    private static BufferedImage drawNodeIcon(int[] color, int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        // diamond shape
        int m = size / 2;
        int[] xs = {m, size - 1, m, 0};
        int[] ys = {0, m, size - 1, m};
        g.setColor(new Color(0, 0, 0, 120));
        g.fillPolygon(xs, ys, 4);
        g.setColor(new Color(color[0], color[1], color[2]));
        g.fillPolygon(xs, ys, 4);
        g.setColor(new Color(255, 255, 255, 200));
        g.setStroke(new BasicStroke(Math.max(1, size / 8)));
        g.drawPolygon(xs, ys, 4);
        g.dispose();
        return img;
    }

    private static BufferedImage drawPortIcon(int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        int m = size / 2;
        // simple anchor: ring + stem + crossbar
        g.setColor(new Color(0, 0, 0, 120));
        g.fillOval(m - 3, 2, 6, 6);
        g.setColor(new Color(70, 180, 220));
        g.fillOval(m - 3, 2, 6, 6);
        g.setStroke(new BasicStroke(Math.max(1, size / 10)));
        g.drawLine(m, 8, m, size - 1);
        g.drawLine(Math.max(2, m - 4), size - 4, Math.min(size - 2, m + 4), size - 4);
        g.drawLine(2, m - 2, size - 2, m - 2);
        g.dispose();
        return img;
    }

    private static BufferedImage drawTextSprite(String text, int height) {
        Font font = new Font(Font.SANS_SERIF, Font.BOLD, height);
        BufferedImage probe = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D pg = probe.createGraphics();
        pg.setFont(font);
        FontMetrics fm = pg.getFontMetrics();
        int width = fm.stringWidth(text) + 8;
        int textHeight = fm.getHeight() + 4;
        pg.dispose();

        BufferedImage img = new BufferedImage(width, textHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setFont(font);
        fm = g.getFontMetrics();
        int baseline = fm.getAscent() + 2;

        // black outline: draw text 8x offset by one pixel
        g.setColor(new Color(0, 0, 0, 200));
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                if (dx == 0 && dy == 0) {
                    continue;
                }
                g.drawString(text, 4 + dx, baseline + dy);
            }
        }
        g.setColor(new Color(255, 255, 255, 230));
        g.drawString(text, 4, baseline);
        g.dispose();
        return img;
    }

    // ============================================================
    // misc
    // ============================================================

    private static List<Point> toPoints(List<long[]> points) {
        List<Point> out = new ArrayList<>(points.size());
        for (long[] p : points) {
            out.add(Point.of(p[0], p[1]));
        }
        return out;
    }

    private static Color rgb(int[] rgb) {
        return new Color(rgb[0], rgb[1], rgb[2]);
    }

    private static String sanitize(String s) {
        if (s == null) {
            return "unknown";
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            sb.append((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-' ? c : '_');
        }
        return sb.toString();
    }

    private static String esc(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Registered text-sprite icon with its natural pixel size. */
    private static final class TextIcon {
        final Key key;
        final int width;
        final int height;

        TextIcon(Key key, int width, int height) {
            this.key = key;
            this.width = width;
            this.height = height;
        }
    }
}
