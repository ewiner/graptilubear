#!/bin/sh
# Render store/promo.html slides to store/screenshots/*.png with headless Chrome.
set -eu
cd "$(dirname "$0")"
CH="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
shot() {
  "$CH" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size="$2" --screenshot="screenshots/$3" \
    "file://$PWD/promo.html?s=$1" 2>/dev/null
}
mkdir -p screenshots
shot 1 1280,800 1-hero.png
shot 2 1280,800 2-surfaces.png
shot 3 1280,800 3-tabs.png
shot 4 1280,800 4-how.png
shot tile 440,280 promo-small-440x280.png
shot marquee 1400,560 promo-marquee-1400x560.png
ls screenshots
