# System Importer Tools

Converts **2-Parsecs-from-Sol** book data into the **2D Star System Map** `StarSystem` format.

## Philosophy

The book data and the 2D map have different schemas, levels of detail, and sometimes conflicting values. Rather than silently overwriting book data with generated defaults, this tool:

1. **Parses** the raw book data
2. **Inventories** what is present vs missing
3. **Generates** missing fields (worlds, moons, habitability) using physics-based rules
4. **Detects conflicts** between book values and generated values
5. **Presents conflicts** to the user for resolution

This ensures the referee always has final say over their canon.

## Pipeline

```
Raw Book JSON
    ↓
[Parser]  →  ParsedSystem (normalized distances, masses, categories)
    ↓
[Inventory]  →  InventoryReport (missing fields, inconsistencies, auto-gen feasibility)
    ↓
[Generator]
   Step 1: Star → primaryStar, zones
   Step 2: Worlds → categorize, normalize, map to StarSystem arrays
   Step 3: Moons → generate for gas giants & massive terrestrials
   Step 4: Habitability → calculate baseline, compare with book
    ↓
[Conflict Detector]  →  Conflict[] (book vs generated discrepancies)
    ↓
[Resolver]  →  User decides: accept book / accept generated / custom
    ↓
[Encoder]  →  MapPayload → Base64 URL string
```

## Files

| File | Purpose |
|---|---|
| `types.ts` | Bridge types between book data and StarSystem |
| `inventory.ts` | Validates parsed data, reports missing fields |
| `generator.ts` | Runs the 4-step generation pipeline |
| `converter.ts` | Orchestrates parse → inventory → generate → encode |
| `cli.ts` | Command-line interface |

## Usage

### Run the importer

```bash
cd /home/justin/opencode260220/2d-star-system-map
npx tsx tools/system-importer/cli.ts /path/to/extracted-worlds.json
```

### Output

For each system, the CLI writes:
- `tools/system-importer/output/{system}.json` — Full StarSystem + inventory + conflicts
- `tools/system-importer/output/{system}.payload.txt` — Base64-encoded MapPayload for the 2D map

### View in 2D Map

Open the generated payload in the map:

```bash
# Build the map first
npm run build

# Then open with the payload
cat tools/system-importer/output/aleph.payload.txt | xargs -I {} \
  echo "file://$(pwd)/dist/index.html?system={}"
```

Or paste the payload text directly into the map's JSON input box.

## Conflict Types

| Type | Trigger | Severity |
|---|---|---|
| `mass-mismatch` | Parsed mass differs from generated estimate | minor |
| `gravity-mismatch` | Book gravity doesn't match mass-derived expectation | major |
| `distance-mismatch` | World position conflicts with zone placement | critical |
| `zone-mismatch` | Book zone label doesn't match star's zone table | major |
| `habitability-mismatch` | Book Hab differs from MWG-style calculation by ≥2 | minor/major |
| `missing-moons` | Book narrative mentions moons but none in table | minor |
| `missing-composition` | Mass field blank → auto-estimated | minor |
| `moon-count-discrepancy` | Generated moons ≠ narrative moon count | minor |

## Resolving Conflicts

Conflicts are stored in the output JSON with `resolution: "pending"`. To resolve:

1. Edit the output JSON, setting `resolution` to `"accept-book"`, `"accept-generated"`, or `"custom"`
2. If `"custom"`, provide the `customValue`
3. Re-run the converter with the resolutions file

(Programmatic resolution API coming in a future update.)

## Integration with 2-Parsecs Repo

The importer reads `data/extracted-worlds.json` from the 2-parsecs repo. To update:

1. Run the extraction/conversion pipeline in the 2-parsecs repo
2. Copy or symlink `data/extracted-worlds.json` to this tool
3. Re-run the importer

## TODO

- [ ] Binary system support (Alpha Centauri A+B, Luhman 16 A+B)
- [ ] Companion star orbits with barycenterView
- [ ] Parse narrative text for moon mentions
- [ ] Interactive conflict resolution UI
- [ ] Batch resolution from JSON file
- [ ] Link NPCs and ships to worlds in StarSystem metadata
