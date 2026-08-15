package phonon.nodes.squaremap;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Snapshot of the nodes plugin JSON state files.
 *
 * <p>Pure file coupling: this addon reads {@code plugins/nodes/world.json},
 * {@code towns.json}, {@code ports.json} — the same files the nodes plugin
 * writes and the dynmap web editor reads. No dependency on the unstable
 * nodes plugin API.
 *
 * <p>Data formats (matching the nodes plugin serde / web editor parser):
 * <pre>
 * world.json:
 *   { "meta":{"type":"world"},
 *     "nodes": { name: {...} },
 *     "territories": { "id": { name, color, coreChunk:[x,z],
 *       chunks:[x1,z1,x2,z2,...], nodes:[...], neighbors:[...], isEdge } } }
 * towns.json:
 *   { "meta":{"type":"towns"},
 *     "towns": { name: { uuid, color:[r,g,b], territories:[id], captured:[id], home, nation, ... } },
 *     "nations": { name: { color:[r,g,b], towns:[name], capital } } }
 * ports.json:
 *   { "meta":{"type":"ports"}, "groups":[...],
 *     "ports": { name: { x, z, groups:[...], isPublic } } }
 * </pre>
 */
public final class NodesData {

    /** A territory parsed from world.json. */
    public static final class Territory {
        public final int id;
        public final String name;
        public final int[] coreChunk; // [x, z] in chunk coords, may be null
        public final int[] chunks;    // interleaved [x1, z1, x2, z2, ...] in chunk coords
        public final List<String> nodes; // resource node type names attached to this territory

        Territory(int id, String name, int[] coreChunk, int[] chunks, List<String> nodes) {
            this.id = id;
            this.name = name == null ? "" : name;
            this.coreChunk = coreChunk;
            this.chunks = chunks == null ? new int[0] : chunks;
            this.nodes = nodes == null ? List.of() : nodes;
        }

        /** Block coordinate of the core chunk center. */
        public long coreBlockX() {
            return coreChunk != null ? coreChunk[0] * 16L + 8L : 0L;
        }

        /** Block coordinate of the core chunk center. */
        public long coreBlockZ() {
            return coreChunk != null ? coreChunk[1] * 16L + 8L : 0L;
        }
    }

    /** A resource node type definition parsed from world.json's "nodes" object. */
    public static final class Node {
        public final String name;
        public final String icon; // icon id, may be null
        public final Map<String, Double> income;
        public final Map<String, Double> ore;
        public final Map<String, Double> crops;
        public final Map<String, Double> animals;

        Node(String name, String icon,
             Map<String, Double> income, Map<String, Double> ore,
             Map<String, Double> crops, Map<String, Double> animals) {
            this.name = name == null ? "" : name;
            this.icon = icon;
            this.income = income == null ? Map.of() : income;
            this.ore = ore == null ? Map.of() : ore;
            this.crops = crops == null ? Map.of() : crops;
            this.animals = animals == null ? Map.of() : animals;
        }
    }

    /** A town parsed from towns.json. */
    public static final class Town {
        public final String name;
        public final int[] color; // [r, g, b], may be null
        public final int[] territories; // owned territory ids
        public final int[] captured;    // occupied (captured) territory ids
        public final int home;          // home territory id
        public final String nation;     // nation name, may be null

        Town(String name, int[] color, int[] territories, int[] captured, int home, String nation) {
            this.name = name;
            this.color = color;
            this.territories = territories == null ? new int[0] : territories;
            this.captured = captured == null ? new int[0] : captured;
            this.home = home;
            this.nation = nation;
        }
    }

    /** A port parsed from ports.json. */
    public static final class Port {
        public final String name;
        public final int x;
        public final int z;

        Port(String name, int x, int z) {
            this.name = name;
            this.x = x;
            this.z = z;
        }
    }

    /** Full parsed state. */
    public static final class Snapshot {
        public final Map<Integer, Territory> territories = new LinkedHashMap<>();
        public final Map<String, Node> nodes = new LinkedHashMap<>(); // resource type name -> definition
        public final Map<String, int[]> nationColors = new LinkedHashMap<>(); // nation name -> [r,g,b]
        public final Map<String, Town> towns = new LinkedHashMap<>();
        public final Map<String, Port> ports = new LinkedHashMap<>();

        public boolean isEmpty() {
            return territories.isEmpty() && towns.isEmpty() && ports.isEmpty();
        }
    }

    private final Path worldPath;
    private final Path townsPath;
    private final Path portsPath;
    private long worldMtime = -1;
    private long townsMtime = -1;
    private long portsMtime = -1;

    public NodesData(Path dataDirectory) {
        this.worldPath = dataDirectory.resolve("world.json");
        this.townsPath = dataDirectory.resolve("towns.json");
        this.portsPath = dataDirectory.resolve("ports.json");
    }

    /** Returns true if any of the state files changed since the last read. */
    public boolean hasChanges() {
        return mtime(worldPath) != worldMtime
            || mtime(townsPath) != townsMtime
            || mtime(portsPath) != portsMtime;
    }

    /** Forget tracked mtimes so the next read is forced. */
    public void reset() {
        this.worldMtime = -1;
        this.townsMtime = -1;
        this.portsMtime = -1;
    }

    /** Re-read the state files. Only files that exist are parsed. */
    public Snapshot read() {
        Snapshot snapshot = new Snapshot();

        long mt = mtime(worldPath);
        if (mt >= 0) {
            try {
                parseWorld(readObject(worldPath), snapshot);
                this.worldMtime = mt;
            } catch (Exception e) {
                this.worldMtime = -1;
            }
        }

        mt = mtime(townsPath);
        if (mt >= 0) {
            try {
                parseTowns(readObject(townsPath), snapshot);
                this.townsMtime = mt;
            } catch (Exception e) {
                this.townsMtime = -1;
            }
        }

        mt = mtime(portsPath);
        if (mt >= 0) {
            try {
                parsePorts(readObject(portsPath), snapshot);
                this.portsMtime = mt;
            } catch (Exception e) {
                this.portsMtime = -1;
            }
        }

        return snapshot;
    }

    private JsonObject readObject(Path path) throws Exception {
        try (Reader reader = Files.newBufferedReader(path)) {
            return JsonParser.parseReader(reader).getAsJsonObject();
        }
    }

    private static void parseWorld(JsonObject root, Snapshot snapshot) {
        // resource node type definitions
        JsonObject jsonNodes = root.getAsJsonObject("nodes");
        if (jsonNodes != null) {
            for (Map.Entry<String, com.google.gson.JsonElement> entry : jsonNodes.entrySet()) {
                JsonObject json = entry.getValue().getAsJsonObject();
                String name = getString(json, "name");
                snapshot.nodes.put(entry.getKey(), new Node(
                    name != null ? name : entry.getKey(),
                    getString(json, "icon"),
                    readNumberMap(json.getAsJsonObject("income")),
                    readNumberMap(json.getAsJsonObject("ore")),
                    readNumberMap(json.getAsJsonObject("crops")),
                    readNumberMap(json.getAsJsonObject("animals"))
                ));
            }
        }

        JsonObject jsonTerritories = root.getAsJsonObject("territories");
        if (jsonTerritories != null) {
            for (Map.Entry<String, com.google.gson.JsonElement> entry : jsonTerritories.entrySet()) {
                int id = Integer.parseInt(entry.getKey());
                JsonObject json = entry.getValue().getAsJsonObject();
                int[] coreChunk = readInt2(json.getAsJsonArray("coreChunk"));
                int[] chunks = readInterleaved(json.getAsJsonArray("chunks"));
                List<String> nodes = readStringList(json.getAsJsonArray("nodes"));
                snapshot.territories.put(id, new Territory(id, getString(json, "name"), coreChunk, chunks, nodes));
            }
        }
    }

    private static void parseTowns(JsonObject root, Snapshot snapshot) {
        JsonObject jsonNations = root.getAsJsonObject("nations");
        if (jsonNations != null) {
            for (Map.Entry<String, com.google.gson.JsonElement> entry : jsonNations.entrySet()) {
                JsonObject json = entry.getValue().getAsJsonObject();
                int[] color = readInt3(json.getAsJsonArray("color"));
                if (color != null) {
                    snapshot.nationColors.put(entry.getKey(), color);
                }
            }
        }

        JsonObject jsonTowns = root.getAsJsonObject("towns");
        if (jsonTowns != null) {
            for (Map.Entry<String, com.google.gson.JsonElement> entry : jsonTowns.entrySet()) {
                JsonObject json = entry.getValue().getAsJsonObject();
                int[] color = readInt3(json.getAsJsonArray("color"));
                int[] territories = readIntArray(json.getAsJsonArray("territories"));
                int[] captured = readIntArray(json.getAsJsonArray("captured"));
                int home = json.has("home") ? json.get("home").getAsInt() : -1;
                String nation = json.has("nation") && !json.get("nation").isJsonNull()
                    ? json.get("nation").getAsString() : null;
                snapshot.towns.put(entry.getKey(),
                    new Town(entry.getKey(), color, territories, captured, home, nation));
            }
        }
    }

    private static void parsePorts(JsonObject root, Snapshot snapshot) {
        JsonObject jsonPorts = root.getAsJsonObject("ports");
        if (jsonPorts != null) {
            for (Map.Entry<String, com.google.gson.JsonElement> entry : jsonPorts.entrySet()) {
                JsonObject json = entry.getValue().getAsJsonObject();
                if (!json.has("x") || !json.has("z")) {
                    continue;
                }
                snapshot.ports.put(entry.getKey(),
                    new Port(entry.getKey(), json.get("x").getAsInt(), json.get("z").getAsInt()));
            }
        }
    }

    private static long mtime(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (Exception e) {
            return -1;
        }
    }

    private static String getString(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : null;
    }

    private static int[] readInt2(JsonArray array) {
        if (array == null || array.size() < 2) {
            return null;
        }
        return new int[]{array.get(0).getAsInt(), array.get(1).getAsInt()};
    }

    private static int[] readInt3(JsonArray array) {
        if (array == null || array.size() < 3) {
            return null;
        }
        return new int[]{array.get(0).getAsInt(), array.get(1).getAsInt(), array.get(2).getAsInt()};
    }

    private static int[] readIntArray(JsonArray array) {
        if (array == null) {
            return new int[0];
        }
        int[] out = new int[array.size()];
        for (int i = 0; i < array.size(); i++) {
            out[i] = array.get(i).getAsInt();
        }
        return out;
    }

    private static int[] readInterleaved(JsonArray array) {
        if (array == null) {
            return new int[0];
        }
        int[] out = new int[array.size()];
        for (int i = 0; i < array.size(); i++) {
            out[i] = array.get(i).getAsInt();
        }
        return out;
    }

    private static List<String> readStringList(JsonArray array) {
        if (array == null) {
            return List.of();
        }
        List<String> out = new ArrayList<>(array.size());
        for (com.google.gson.JsonElement element : array) {
            out.add(element.getAsString());
        }
        return out;
    }

    /** Read a {"material": amount, ...} object into an insertion-ordered map. */
    private static Map<String, Double> readNumberMap(JsonObject obj) {
        if (obj == null) {
            return Map.of();
        }
        Map<String, Double> out = new LinkedHashMap<>();
        for (Map.Entry<String, com.google.gson.JsonElement> entry : obj.entrySet()) {
            try {
                out.put(entry.getKey(), entry.getValue().getAsDouble());
            } catch (Exception ignored) {
                // skip non-numeric values
            }
        }
        return out;
    }
}
