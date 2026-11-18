# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xhamzar/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xhamzar/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01): every pre-token protocol on DefiLlama's watchlist plus the early ones below the floor, ranked by an implied value priced from the market's own multiples, with a farm plan for each.

## The model (radar-2)

A protocol's token, if it launched today, would be priced the way the market already prices the tokens of protocols like it. The model measures, from the sealed snapshot itself, the median mcap/TVL of each category's live-token protocols (shrunk toward the global median when a category has few live peers), then prices every pre-token protocol at its category's multiple, adjusted for its seven-day growth, its age without a token, and its chain spread. No protocol name is special-cased. The full derivation is in [dashboard/MODEL.md](dashboard/MODEL.md).

The board covers all 40 watchlist slugs plus every rankable pre-token protocol below the floor (178 rows), ranked by the model's score — never by raw TVL. Live-token protocols are kept apart in an "Already launched" tab, shown with their market caps and what the model would imply for them as a calibration check.

## Layout

- `main.ts` — the entrypoint (Node 22, stdlib only): reads `/input/snapshot.json`, writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to `/output`.
- `lib/model.ts` — the value model, board builder, farm plans, calibration.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (sortable/filterable board, detail view per protocol, model panel) and `MODEL.md`.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `screenshots/` — three renders of the dashboard: the board, a detail view, a filtered view.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program is fully deterministic: two runs write the same bytes.

## License

MIT — see [LICENSE](LICENSE).
