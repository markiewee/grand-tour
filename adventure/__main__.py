"""Command line for The Great Adventure skills. Every command prints JSON or a file path."""
import argparse
import json
import pathlib
import sys

from . import commons, journey, plates, poster, qa, render, theme, theme_cut, trip, weather

ENGINE = pathlib.Path(__file__).resolve().parent.parent / "templates" / "journey"


def _print(value):
    print(json.dumps(value, ensure_ascii=False, indent=1))


def main(argv=None):
    parser = argparse.ArgumentParser(prog="adventure")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("gaps", help="list what is missing from a trip file")
    p.add_argument("trip")

    p = sub.add_parser("weather", help="forecast for every place in a trip file")
    p.add_argument("trip")

    p = sub.add_parser("commons-search", help="search Wikimedia Commons files")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=10)

    p = sub.add_parser("commons-fetch", help="download a Commons file and record its credit")
    p.add_argument("title")
    p.add_argument("--dest", required=True)
    p.add_argument("--key", required=True)
    p.add_argument("--max-width", type=int, default=1600)

    p = sub.add_parser("prompt", help="build a poster prompt from a concept and a theme")
    p.add_argument("--theme", required=True, help="a theme name or a path to a theme folder")
    p.add_argument("--concept", required=True)
    p.add_argument("--reference-note")

    p = sub.add_parser("poster", help="generate poster takes with Gemini")
    p.add_argument("--theme", required=True, help="a theme name or a path to a theme folder")
    p.add_argument("--concept", required=True)
    p.add_argument("--reference-note")
    p.add_argument("--ref", action="append", default=[])
    p.add_argument("--out", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--takes", type=int, default=2)

    p = sub.add_parser("flow-card", help="write a card for making the poster by hand in Google Flow")
    p.add_argument("--theme", required=True, help="a theme name or a path to a theme folder")
    p.add_argument("--concept", required=True)
    p.add_argument("--reference-note")
    p.add_argument("--ref", action="append", default=[])
    p.add_argument("--out", required=True)
    p.add_argument("--name", required=True)

    p = sub.add_parser("text-check", help="OCR a poster for stray lettering")
    p.add_argument("image")

    p = sub.add_parser("sheet", help="contact sheet of images")
    p.add_argument("out")
    p.add_argument("images", nargs="+")

    p = sub.add_parser("pdf", help="print an HTML file to PDF with headless Chrome")
    p.add_argument("html")
    p.add_argument("pdf")

    p = sub.add_parser("journey", help="check, scaffold, build or retheme an interactive journey")
    p.add_argument("action", choices=["check", "new", "build", "retheme"])
    p.add_argument("app")
    p.add_argument("--trip", help="a planning trip.json to draft the stops from")
    p.add_argument("--theme", default="lantern-night", help="a theme name or a path to a theme folder")
    p.add_argument("--template", help="where to copy the engine from (default: the plugin's templates/journey)")

    p = sub.add_parser("theme", help="scaffold a theme or cut its art to size")
    p.add_argument("action", choices=["new", "cut"])
    p.add_argument("name")
    p.add_argument("--dest", help="where to write it (default: the plugin's templates/themes/<name>)")
    p.add_argument("--from", dest="source", help="a folder of generated images, for cut")
    p.add_argument("--moon", choices=["fill", "trim"], default="fill",
                   help="fill if the disc runs past its frame, trim if it sits on a plain card")
    p.add_argument("--sky-bias", type=float, default=0.5,
                   help="0 keeps the top of the sky, 1 keeps the bottom, 0.5 the middle")

    p = sub.add_parser("plates", help="cut a poster into a phone-sized poster, a thumb and five plates")
    p.add_argument("image")
    p.add_argument("--out", required=True, help="the app's public/img directory")

    args = parser.parse_args(argv)

    if args.cmd == "gaps":
        _print(trip.gaps(trip.load(args.trip)))
    elif args.cmd == "weather":
        data = trip.load(args.trip)
        _print({place["name"]: weather.forecast(place["lat"], place["lon"], place["from"], place["to"])
                for place in data.get("places", [])})
    elif args.cmd == "commons-search":
        _print(commons.search(args.query, limit=args.limit))
    elif args.cmd == "commons-fetch":
        _print(commons.fetch(args.title, args.dest, args.key, max_width=args.max_width))
    elif args.cmd in ("prompt", "poster", "flow-card"):
        text = poster.build_prompt(args.concept, theme.load(args.theme), args.reference_note)
        if args.cmd == "prompt":
            print(text)
        elif args.cmd == "poster":
            _print(poster.generate(text, args.ref, args.out, args.name, takes=args.takes))
        else:
            print(poster.flow_card(text, args.ref, args.out, args.name))
    elif args.cmd == "text-check":
        _print({"image": args.image, "words": qa.text_found(args.image)})
    elif args.cmd == "sheet":
        print(qa.contact_sheet(args.images, args.out))
    elif args.cmd == "pdf":
        print(render.to_pdf(args.html, args.pdf))
    elif args.cmd == "journey":
        if args.action == "check":
            report = journey.check(args.app)
            _print(report)
            # A skill reads the exit code, so a journey with errors has to fail the command.
            return 1 if report["errors"] else 0
        if args.action == "new":
            _print({"app": str(journey.new(args.template or ENGINE, args.app, args.trip,
                                           theme_name=args.theme))})
        elif args.action == "retheme":
            _print(journey.retheme(args.app, args.theme))
        else:
            _print(journey.build(args.app))
    elif args.cmd == "theme":
        if args.action == "new":
            _print({"theme": str(theme.new(args.name, args.dest or theme.THEMES / args.name))})
        else:
            if not args.source:
                parser.error("theme cut needs --from <folder of generated images>")
            _print(theme_cut.run(args.name, args.source, dest=args.dest,
                                 moon_mode=args.moon, sky_bias=args.sky_bias))
    elif args.cmd == "plates":
        cut = plates.cut(args.image, args.out)
        _print({"poster": str(cut["poster"]), "thumb": str(cut["thumb"]),
                "plates": [str(p) for p in cut["plates"]]})
    return 0


if __name__ == "__main__":
    sys.exit(main())
